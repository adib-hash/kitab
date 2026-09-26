import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { checkGoalMilestones } from '../lib/notifications'

// ── Fetch all books with their tags ──────────────────────────────────────
export function useLibrary() {
  return useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data: books, error } = await supabase
        .from('books')
        .select(`
          *,
          book_tags ( tag_id, tags ( id, name, color ) )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Flatten tags
      return books.map(b => ({
        ...b,
        tags: b.book_tags?.map(bt => bt.tags).filter(Boolean) || [],
      }))
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Fetch single book ──────────────────────────────────────────────────
export function useBook(id) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['book', id],
    // The row is almost always already in ['books']; show it while the fresh
    // fetch runs instead of a skeleton.
    placeholderData: () => qc.getQueryData(['books'])?.find(b => b.id === id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select(`
          *,
          book_tags ( tag_id, tags ( id, name, color ) )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return { ...data, tags: data.book_tags?.map(bt => bt.tags).filter(Boolean) || [] }
    },
    enabled: !!id,
  })
}

// ── Add book ───────────────────────────────────────────────────────────
export function useAddBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ book, tagIds = [] }) => {
      const { data: { user } } = await supabase.auth.getUser()

      // When adding a TBR book, default tbr_order to end of list
      let bookToInsert = { ...book, user_id: user.id }
      if (book.status === 'tbr' && book.tbr_order === undefined) {
        const { data: existingTBR } = await supabase
          .from('books')
          .select('tbr_order')
          .eq('user_id', user.id)
          .eq('status', 'tbr')
          .order('tbr_order', { ascending: false })
          .limit(1)
        const maxOrder = existingTBR?.[0]?.tbr_order || 0
        bookToInsert.tbr_order = maxOrder + 1000
      }

      const { data, error } = await supabase
        .from('books')
        .insert(bookToInsert)
        .select()
        .single()

      if (error) throw error

      if (tagIds.length) {
        const { error: tagErr } = await supabase.from('book_tags').insert(
          tagIds.map(tag_id => ({ book_id: data.id, tag_id }))
        )
        if (tagErr) throw tagErr
      }

      return data
    },
    onSuccess: (data) => {
      toast.success(`"${data.title}" added to your library`, { id: 'book-added' })
    },
    onError: (err) => toast.error(`Failed to add book: ${err.message}`),
    // The book row is inserted before the tags, so refetch even on error.
    onSettled: () => qc.invalidateQueries({ queryKey: ['books'] }),
  })
}

// ── Update book ────────────────────────────────────────────────────────
// Optimistic: the cache is patched before the network call, so a rating, a
// status change or an ELO vote shows instantly and doesn't trigger a refetch
// of the whole library (with its tags join) on every save. Rolled back on error.
export function useUpdateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates, tagIds }) => {
      const { data, error } = await supabase
        .from('books')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // If tags provided, replace them. Both writes are checked: the old code
      // ignored a failed insert, which could silently wipe a book's tags.
      if (tagIds !== undefined) {
        const { error: delErr } = await supabase.from('book_tags').delete().eq('book_id', id)
        if (delErr) throw delErr
        if (tagIds.length) {
          const { error: insErr } = await supabase.from('book_tags').insert(
            tagIds.map(tag_id => ({ book_id: id, tag_id }))
          )
          if (insErr) throw insErr
        }
      }

      return data
    },
    onMutate: async ({ id, updates }) => {
      await qc.cancelQueries({ queryKey: ['books'] })
      await qc.cancelQueries({ queryKey: ['book', id] })
      const prevBooks = qc.getQueryData(['books'])
      const prevBook  = qc.getQueryData(['book', id])
      if (prevBooks) qc.setQueryData(['books'], prevBooks.map(b => (b.id === id ? { ...b, ...updates } : b)))
      if (prevBook)  qc.setQueryData(['book', id], { ...prevBook, ...updates })
      return { prevBooks, prevBook, id }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevBooks) qc.setQueryData(['books'], ctx.prevBooks)
      if (ctx?.prevBook)  qc.setQueryData(['book', ctx.id], ctx.prevBook)
      // A sibling mutation may have landed in between; resync with the server.
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.error(`Failed to update: ${err.message}`)
    },
    onSuccess: (data, { id, tagIds }) => {
      // `data` is the bare row (no tags join), so spreading it over the cached
      // item keeps the flattened `tags` array intact.
      const merge = row => (row ? { ...row, ...data } : row)
      qc.setQueryData(['books'], old => (old ? old.map(b => (b.id === id ? merge(b) : b)) : old))
      qc.setQueryData(['book', id], old => merge(old))
      if (tagIds !== undefined) {
        qc.invalidateQueries({ queryKey: ['books'] })
        qc.invalidateQueries({ queryKey: ['book', id] })
      }
      // Check goal milestones when a book is marked as read
      if (data.status === 'read') {
        const books = qc.getQueryData(['books']) || []
        const thisYear = new Date().getFullYear()
        const booksRead = books.filter(
          b => b.status === 'read' && b.date_finished &&
          parseInt(b.date_finished.slice(0, 4)) === thisYear
        ).length
        const goal = qc.getQueryData(['reading_goal', thisYear])
        if (goal?.target) checkGoalMilestones(booksRead, goal.target)
      }
    },
  })
}

// ── Delete book ────────────────────────────────────────────────────────
export function useDeleteBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('books').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success('Book removed from library')
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  })
}

// ── Update TBR order (batch) ───────────────────────────────────────────
export function useReorderTBR() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds) => {
      // Assign sparse orders: 1000, 2000, 3000...
      const results = await Promise.all(orderedIds.map((id, i) =>
        supabase.from('books').update({ tbr_order: (i + 1) * 1000 }).eq('id', id)
      ))
      // Supabase builders resolve to { error } rather than rejecting, so
      // Promise.all alone never surfaced a failed row.
      const failed = results.find(r => r.error)
      if (failed) throw failed.error
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ['books'] })
      const prev = qc.getQueryData(['books'])
      const pos = new Map(orderedIds.map((id, i) => [id, (i + 1) * 1000]))
      if (prev) qc.setQueryData(['books'], prev.map(b => (pos.has(b.id) ? { ...b, tbr_order: pos.get(b.id) } : b)))
      return { prev }
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(['books'], ctx.prev)
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.error(`Couldn't save the new order: ${err.message}`)
    },
    // No refetch on success: the optimistic order is exactly what was written.
  })
}
