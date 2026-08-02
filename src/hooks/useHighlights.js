// src/hooks/useHighlights.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ── Kindle scraper ────────────────────────────────────────────────────────
// The scraper itself lives in public/kindle-scraper.js so the native background
// task can inject the exact same code from the app bundle. Fetched at call time
// rather than bundled, which keeps one copy on disk for both callers.
let scraperSource = null

export async function loadKindleScraper() {
  if (scraperSource) return scraperSource
  const res = await fetch('/kindle-scraper.js', { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load the Kindle scraper')
  scraperSource = await res.text()
  return scraperSource
}

/** Wrap the scraper with its config so it can be injected as one script. */
export function buildScraperScript(source, config) {
  return `window.__KITAB_SYNC_CONFIG = ${JSON.stringify(config)};\n${source}`
}


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

export function useDeleteHighlight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('highlights').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      toast.success('Highlight deleted')
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  })
}

export function useAllHighlights() {
  return useQuery({
    queryKey: ['all_highlights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('id, text, book_id, books(id, title, author, cover_url)')
        .not('book_id', 'is', null)
      if (error) throw error
      return data || []
    },
    staleTime: 1000 * 60 * 15,
  })
}

export function useDeleteUnmatched() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookTitle }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('highlights')
        .delete()
        .eq('user_id', user.id)
        .eq('book_title', bookTitle)
        .is('book_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      toast.success('Removed')
    },
    onError: (err) => toast.error(`Failed to remove: ${err.message}`),
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

export function normalize(str = '') {
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

function clippingHash(bookTitle, location, text) {
  const key = `${bookTitle}|${location ?? ''}|${text.slice(0, 100)}`
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = (((h << 5) + h) ^ key.charCodeAt(i)) >>> 0
  }
  return h.toString()
}

// Shared upsert logic — returns { totalHighlights, unmatched } where totalHighlights
// is the count of *newly inserted* rows (duplicates silently skipped by ON CONFLICT DO NOTHING)
export async function upsertHighlights(user, kitabBooks, highlights) {
  const byBook = {}
  for (const h of highlights) {
    if (!byBook[h.bookTitle]) byBook[h.bookTitle] = { ...h, highlights: [] }
    byBook[h.bookTitle].highlights.push(h)
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
      note: h.note || null,
      location: h.location,
      book_title: h.bookTitle,
      book_author: h.bookAuthor,
      highlighted_at: h.highlighted_at || null,
    }))

    const { data, error } = await supabase
      .from('highlights')
      .upsert(rows, { onConflict: 'clipping_hash', ignoreDuplicates: true })
      .select('id')
    // data contains only the rows that were actually inserted (not skipped duplicates)
    if (!error) totalHighlights += data?.length ?? 0
  }
  return { totalHighlights, unmatched }
}

export function useKindleSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ highlights }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: kitabBooks } = await supabase
        .from('books').select('id, title, author').eq('user_id', user.id)
      return upsertHighlights(user, kitabBooks, highlights)
    },
    onSuccess: ({ totalHighlights, unmatched }) => {
      localStorage.setItem('kindle_last_sync', new Date().toISOString())
      localStorage.removeItem('kindle_sync_reminder_sent_at')
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      qc.invalidateQueries({ queryKey: ['all_highlights'] })
      const msg = `${totalHighlights} new highlight${totalHighlights !== 1 ? 's' : ''} imported`
        + (unmatched > 0 ? ` · ${unmatched} unmatched` : '')
      toast.success(msg, { duration: 5000 })
    },
    onError: (err) => toast.error(err.message),
  })
}
