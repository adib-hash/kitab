import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { enqueue, isOfflineError, pendingRows } from '../lib/outbox'

const NOTE_COLS = 'id, book_id, highlight_id, body, page, created_at, updated_at'

const mergePending = (rows, pending) => {
  const ids = new Set(rows.map(r => r.id))
  return [...rows, ...pending.filter(p => !ids.has(p.id))]
}

export function useBookNotes(bookId) {
  return useQuery({
    queryKey: ['book_notes', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_notes').select(NOTE_COLS)
        .eq('book_id', bookId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return mergePending(data, pendingRows('note.insert', r => r.book_id === bookId))
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useAllNotes() {
  return useQuery({
    queryKey: ['all_notes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_notes').select(`${NOTE_COLS}, books(id, title, author, cover_url)`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return mergePending(data, pendingRows('note.insert'))
    },
    staleTime: 1000 * 60 * 5,
  })
}

const patchList = (id, patch) => list => list?.map(n => (n.id === id ? { ...n, ...patch } : n))

/**
 * Save a note. The caller builds `row` with a client id and created_at, so the
 * optimistic entry and the stored one are the same record, online or not.
 */
export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ row, book }) => {
      const { error } = await supabase.from('book_notes').insert(row)
      if (!error) return { ...row }
      if (isOfflineError(error)) {
        enqueue('note.insert', row, { books: book })
        return { ...row, _pending: true }
      }
      throw error
    },
    onMutate: async ({ row, book }) => {
      await qc.cancelQueries({ queryKey: ['book_notes', row.book_id] })
      const prev = qc.getQueryData(['book_notes', row.book_id])
      const prevAll = qc.getQueryData(['all_notes'])
      const optimistic = { ...row, books: book }
      qc.setQueryData(['book_notes', row.book_id], old => [...(old || []), optimistic])
      qc.setQueryData(['all_notes'], old => (old ? [optimistic, ...old] : old))
      return { prev, prevAll }
    },
    onError: (err, { row }, ctx) => {
      qc.setQueryData(['book_notes', row.book_id], ctx?.prev)
      if (ctx?.prevAll) qc.setQueryData(['all_notes'], ctx.prevAll)
      toast.error(`Couldn't save the note: ${err.message}`)
    },
    onSuccess: (saved, { row }) => {
      qc.setQueryData(['book_notes', row.book_id], patchList(row.id, saved))
      qc.setQueryData(['all_notes'], patchList(row.id, saved))
      toast.success(saved._pending ? "Saved on this device. It'll sync when you're back online." : 'Note saved', { id: 'note-saved' })
    },
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body, page }) => {
      const { error } = await supabase.from('book_notes').update({ body, page: page || null }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, bookId, body, page }) => {
      const prev = qc.getQueryData(['book_notes', bookId])
      const prevAll = qc.getQueryData(['all_notes'])
      qc.setQueryData(['book_notes', bookId], patchList(id, { body, page: page || null }))
      qc.setQueryData(['all_notes'], patchList(id, { body, page: page || null }))
      return { prev, prevAll }
    },
    onError: (err, { bookId }, ctx) => {
      qc.setQueryData(['book_notes', bookId], ctx?.prev)
      if (ctx?.prevAll) qc.setQueryData(['all_notes'], ctx.prevAll)
      toast.error(isOfflineError(err) ? 'Editing a note needs a connection.' : `Couldn't update the note: ${err.message}`)
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('book_notes').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, bookId }) => {
      const prev = qc.getQueryData(['book_notes', bookId])
      const prevAll = qc.getQueryData(['all_notes'])
      const drop = list => list?.filter(n => n.id !== id)
      qc.setQueryData(['book_notes', bookId], drop)
      qc.setQueryData(['all_notes'], drop)
      return { prev, prevAll }
    },
    onError: (err, { bookId }, ctx) => {
      qc.setQueryData(['book_notes', bookId], ctx?.prev)
      if (ctx?.prevAll) qc.setQueryData(['all_notes'], ctx.prevAll)
      toast.error(isOfflineError(err) ? 'Deleting a note needs a connection.' : `Couldn't delete the note: ${err.message}`)
    },
    onSuccess: () => toast.success('Note deleted', { id: 'note-deleted' }),
  })
}
