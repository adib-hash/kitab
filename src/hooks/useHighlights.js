// src/hooks/useHighlights.js
// Supabase queries + full Readwise sync orchestration.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ── Highlights for one book (shown in BookDetail) ─────────────────────────
export function useHighlights(bookId) {
  return useQuery({
    queryKey: ['highlights', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .eq('book_id', bookId)
        .order('location', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
  })
}

// ── Count only — for the tab badge ────────────────────────────────────────
export function useHighlightCount(bookId) {
  return useQuery({
    queryKey: ['highlight_count', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('highlights')
        .select('*', { count: 'exact', head: true })
        .eq('book_id', bookId)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Highlights with no matched book (review queue in Settings) ────────────
export function useAllUnmatched() {
  return useQuery({
    queryKey: ['highlights_unmatched'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .is('book_id', null)
        .order('book_title')
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Manually link an unmatched group to a Kitab book ─────────────────────
export function useAssignHighlights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookTitle, bookId }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('highlights')
        .update({ book_id: bookId })
        .eq('user_id', user.id)
        .eq('book_title', bookTitle)
        .is('book_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      toast.success('Highlights linked!')
    },
    onError: (err) => toast.error(`Failed to link: ${err.message}`),
  })
}

// ── Normalize titles for fuzzy matching ───────────────────────────────────
function normalize(str = '') {
  return str
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchBook(rwBook, kitabBooks) {
  const rwTitle = normalize(rwBook.title)
  const rwAuthor = normalize(rwBook.author || '')

  // Pass 1: exact normalized title
  let m = kitabBooks.find(k => normalize(k.title) === rwTitle)
  if (m) return m.id

  // Pass 2: Kitab title is prefix of Readwise title (e.g. "Dune" vs "Dune: A Novel")
  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return kt.length >= 4 && rwTitle.startsWith(kt)
  })
  if (m) return m.id

  // Pass 3: Readwise title is prefix of Kitab title
  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return rwTitle.length >= 4 && kt.startsWith(rwTitle)
  })
  if (m) return m.id

  // Pass 4: title prefix overlap + author first-word match
  const rwFirstAuthorWord = rwAuthor.split(' ')[0]
  if (rwFirstAuthorWord.length >= 3) {
    m = kitabBooks.find(k => {
      const kt = normalize(k.title)
      const ka = normalize(k.author || '')
      const titleOverlap = rwTitle.includes(kt.slice(0, 6)) || kt.includes(rwTitle.slice(0, 6))
      return titleOverlap && ka.startsWith(rwFirstAuthorWord)
    })
    if (m) return m.id
  }

  return null
}

// ── Main sync: token → Readwise → Supabase ────────────────────────────────
export function useReadwiseSync() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ token }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      // 1. Verify token
      const verifyRes = await fetch('/api/readwise-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'verify' }),
      })
      const { valid } = await verifyRes.json()
      if (!valid) throw new Error('Invalid Readwise token — check readwise.io/access_token')

      // 2. Load Kitab books for matching
      const { data: kitabBooks } = await supabase
        .from('books')
        .select('id, title, author')
        .eq('user_id', user.id)

      // 3. Fetch Readwise books
      const booksRes = await fetch('/api/readwise-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'books' }),
      })
      if (!booksRes.ok) {
        const { error } = await booksRes.json()
        throw new Error(error || 'Failed to fetch Readwise books')
      }
      const { books: rwBooks } = await booksRes.json()

      // 4 + 5. Per book: fetch highlights, match, upsert
      let totalHighlights = 0
      let unmatched = 0

      for (const rwBook of rwBooks) {
        const hlRes = await fetch('/api/readwise-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'highlights', bookId: rwBook.id }),
        })
        if (!hlRes.ok) continue
        const { highlights } = await hlRes.json()
        if (!highlights || !highlights.length) continue

        const matchedBookId = matchBook(rwBook, kitabBooks || [])
        if (!matchedBookId) unmatched++

        const rows = highlights.map(h => ({
          user_id: user.id,
          book_id: matchedBookId,
          readwise_id: h.readwise_id,
          text: h.text,
          note: h.note,
          location: h.location,
          book_title: rwBook.title,
          book_author: rwBook.author,
          highlighted_at: h.highlighted_at,
        }))

        const { error } = await supabase
          .from('highlights')
          .upsert(rows, { onConflict: 'readwise_id' })

        if (!error) totalHighlights += rows.length
      }

      return { totalHighlights, unmatched, books: rwBooks.length }
    },

    onSuccess: ({ totalHighlights, unmatched, books }) => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      const msg = `Synced ${totalHighlights} highlight${totalHighlights !== 1 ? 's' : ''} from ${books} book${books !== 1 ? 's' : ''}`
        + (unmatched > 0 ? ` · ${unmatched} unmatched (check Settings)` : '')
      toast.success(msg, { duration: 6000 })
    },

    onError: (err) => toast.error(err.message),
  })
}
