import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

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
  return useQuery({
    queryKey: ['book', id],
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
        await supabase.from('book_tags').insert(
          tagIds.map(tag_id => ({ book_id: data.id, tag_id }))
        )
      }

      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success(`"${data.title}" added to your library`)
    },
    onError: (err) => toast.error(`Failed to add book: ${err.message}`),
  })
}

// ── Update book ────────────────────────────────────────────────────────
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

      // If tags provided, replace them
      if (tagIds !== undefined) {
        await supabase.from('book_tags').delete().eq('book_id', id)
        if (tagIds.length) {
          await supabase.from('book_tags').insert(
            tagIds.map(tag_id => ({ book_id: id, tag_id }))
          )
        }
      }

      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['book', data.id] })
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
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
      const updates = orderedIds.map((id, i) =>
        supabase.from('books').update({ tbr_order: (i + 1) * 1000 }).eq('id', id)
      )
      await Promise.all(updates)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }),
  })
}
