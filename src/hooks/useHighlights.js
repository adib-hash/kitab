// src/hooks/useHighlights.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

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

function normalize(str = '') {
  return str.toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchBook(rwBook, kitabBooks) {
  const rwTitle = normalize(rwBook.title)
  const rwAuthor = normalize(rwBook.author || '')

  let m = kitabBooks.find(k => normalize(k.title) === rwTitle)
  if (m) return m.id

  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return kt.length >= 4 && rwTitle.startsWith(kt)
  })
  if (m) return m.id

  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return rwTitle.length >= 4 && kt.startsWith(rwTitle)
  })
  if (m) return m.id

  const rwFirstWord = rwAuthor.split(' ')[0]
  if (rwFirstWord.length >= 3) {
    m = kitabBooks.find(k => {
      const kt = normalize(k.title)
      const ka = normalize(k.author || '')
      const titleOverlap = rwTitle.includes(kt.slice(0, 6)) || kt.includes(rwTitle.slice(0, 6))
      return titleOverlap && ka.startsWith(rwFirstWord)
    })
    if (m) return m.id
  }

  return null
}

function parseClippings(text) {
  const entries = text.split('==========').map(s => s.trim()).filter(Boolean)
  const results = []
  for (const entry of entries) {
    const lines = entry.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 3) continue
    const metaLine = lines[1]
    if (metaLine.includes('Bookmark')) continue

    const titleLine = lines[0]
    const authorMatch = titleLine.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
    const bookTitle = authorMatch ? authorMatch[1].trim() : titleLine
    const bookAuthor = authorMatch ? authorMatch[2].trim() : null

    const locMatch = metaLine.match(/Location\s+(\d+)/)
    const location = locMatch ? parseInt(locMatch[1]) : null

    const dateMatch = metaLine.match(/Added on (.+)$/)
    let highlighted_at = null
    if (dateMatch) {
      try { highlighted_at = new Date(dateMatch[1].trim()).toISOString() } catch {}
    }

    const text = lines.slice(2).join(' ').trim()
    if (!text) continue
    results.push({ bookTitle, bookAuthor, location, highlighted_at, text })
  }
  return results
}

function clippingHash(bookTitle, location, text) {
  const key = `${bookTitle}|${location ?? ''}|${text.slice(0, 100)}`
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = (((h << 5) + h) ^ key.charCodeAt(i)) >>> 0
  }
  return h.toString()
}

export function useClippingsImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const text = await file.text()
      const clippings = parseClippings(text)
      const { data: kitabBooks } = await supabase
        .from('books').select('id, title, author').eq('user_id', user.id)

      const byBook = {}
      for (const c of clippings) {
        if (!byBook[c.bookTitle]) byBook[c.bookTitle] = { ...c, highlights: [] }
        byBook[c.bookTitle].highlights.push(c)
      }

      let totalHighlights = 0, unmatched = 0
      for (const [bookTitle, group] of Object.entries(byBook)) {
        const matchedBookId = matchBook(
          { title: bookTitle, author: group.bookAuthor },
          kitabBooks || []
        )
        if (!matchedBookId) unmatched++

        const rows = group.highlights.map(h => ({
          user_id: user.id,
          book_id: matchedBookId,
          clipping_hash: clippingHash(h.bookTitle, h.location, h.text),
          text: h.text,
          note: null,
          location: h.location,
          book_title: h.bookTitle,
          book_author: h.bookAuthor,
          highlighted_at: h.highlighted_at,
        }))

        const { error } = await supabase
          .from('highlights')
          .upsert(rows, { onConflict: 'clipping_hash', ignoreDuplicates: true })
        if (!error) totalHighlights += rows.length
      }
      return { totalHighlights, unmatched }
    },
    onSuccess: ({ totalHighlights, unmatched }) => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      const msg = `Imported ${totalHighlights} highlight${totalHighlights !== 1 ? 's' : ''}`
        + (unmatched > 0 ? ` · ${unmatched} unmatched (check Settings)` : '')
      toast.success(msg, { duration: 6000 })
    },
    onError: (err) => toast.error(err.message),
  })
}
