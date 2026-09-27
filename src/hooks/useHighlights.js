// src/hooks/useHighlights.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { enqueue, isOfflineError, pendingRows } from '../lib/outbox'

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
      const ids = new Set(data.map(h => h.id))
      return [...data, ...pendingRows('highlight.insert', r => r.book_id === bookId).filter(p => !ids.has(p.id))]
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
      qc.setQueryData(['all_highlights'], old => (old ? old.filter(h => h.id !== id) : old))
      qc.invalidateQueries({ queryKey: ['book_notes'] })   // attached notes are deleted by the FK cascade
      qc.invalidateQueries({ queryKey: ['all_notes'] })
      toast.success('Highlight deleted')
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  })
}

/**
 * Save a highlight typed by hand (paper books). Same table as Kindle highlights,
 * with source 'manual' and an optional page, so it joins the daily rotation,
 * the widget, search and the deck automatically. Works offline via the outbox.
 */
export function useAddTypedHighlight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ row, book }) => {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.from('highlights').insert({ ...row, user_id: session?.user?.id })
      if (!error) return { ...row }
      if (isOfflineError(error)) {
        enqueue('highlight.insert', row, { books: book })
        return { ...row, _pending: true }
      }
      throw error
    },
    onMutate: async ({ row, book }) => {
      await qc.cancelQueries({ queryKey: ['highlights', row.book_id] })
      const prev = qc.getQueryData(['highlights', row.book_id])
      const prevAll = qc.getQueryData(['all_highlights'])
      const optimistic = { ...row, books: book }
      qc.setQueryData(['highlights', row.book_id], old => [...(old || []), optimistic])
      qc.setQueryData(['all_highlights'], old => (old ? [...old, optimistic] : old))
      return { prev, prevAll }
    },
    onError: (err, { row }, ctx) => {
      qc.setQueryData(['highlights', row.book_id], ctx?.prev)
      if (ctx?.prevAll) qc.setQueryData(['all_highlights'], ctx.prevAll)
      toast.error(`Couldn't save the highlight: ${err.message}`)
    },
    onSuccess: (saved, { row }) => {
      const patch = list => list?.map(h => (h.id === row.id ? { ...h, ...saved } : h))
      qc.setQueryData(['highlights', row.book_id], patch)
      qc.setQueryData(['all_highlights'], patch)
      qc.invalidateQueries({ queryKey: ['highlight_count', row.book_id] })
      toast.success(saved._pending ? "Saved on this device. It'll sync when you're back online." : 'Highlight saved', { id: 'hl-saved' })
    },
  })
}

export function useAllHighlights() {
  return useQuery({
    queryKey: ['all_highlights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('id, text, note, location, page, source, synced_at, highlighted_at, book_id, books(id, title, author, cover_url)')
        .not('book_id', 'is', null)
      if (error) throw error
      const ids = new Set((data || []).map(h => h.id))
      return [...(data || []), ...pendingRows('highlight.insert').filter(p => !ids.has(p.id))]
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
      qc.invalidateQueries({ queryKey: ['all_highlights'] })
      toast.success('Highlights linked!')
    },
    onError: (err) => toast.error(`Failed to link: ${err.message}`),
  })
}

export function normalize(str) {
  return (str || '').toLowerCase()
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

// Shared upsert logic — returns { totalHighlights, unmatched, failedTitles }.
// totalHighlights is the count of *newly inserted* rows (duplicates are silently
// skipped by ON CONFLICT DO NOTHING). failedTitles lists the raw book titles whose
// upsert errored; callers must leave those out of the "already scraped" map so
// the next sync re-opens them. Throws only if every book failed.
export async function upsertHighlights(user, kitabBooks, highlights) {
  const byBook = {}
  for (const h of highlights) {
    if (!byBook[h.bookTitle]) byBook[h.bookTitle] = { ...h, highlights: [] }
    byBook[h.bookTitle].highlights.push(h)
  }

  let totalHighlights = 0, unmatched = 0
  const failedTitles = []
  for (const [bookTitle, group] of Object.entries(byBook)) {
    const matchedBookId = matchBook(
      { title: bookTitle, author: group.bookAuthor },
      kitabBooks || []
    )

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
    if (error) { failedTitles.push(bookTitle); continue }
    if (!matchedBookId) unmatched++
    // data contains only the rows that were actually inserted (not skipped duplicates)
    totalHighlights += data?.length ?? 0
  }

  const bookCount = Object.keys(byBook).length
  if (bookCount > 0 && failedTitles.length === bookCount) {
    throw new Error(`Could not save highlights for ${bookCount} book${bookCount === 1 ? '' : 's'}`)
  }
  return { totalHighlights, unmatched, failedTitles }
}

export function useKindleSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ highlights }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: kitabBooks, error } = await supabase
        .from('books').select('id, title, author').eq('user_id', user.id)
      if (error) throw error // otherwise every highlight would import as "unmatched"
      return upsertHighlights(user, kitabBooks, highlights)
    },
    onSuccess: ({ totalHighlights, unmatched, failedTitles = [] }) => {
      try {
        localStorage.setItem('kindle_last_sync', new Date().toISOString())
        localStorage.removeItem('kindle_sync_reminder_sent_at')
      } catch {}
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      qc.invalidateQueries({ queryKey: ['all_highlights'] })
      const msg = `${totalHighlights} new highlight${totalHighlights !== 1 ? 's' : ''} imported`
        + (unmatched > 0 ? ` · ${unmatched} unmatched` : '')
      toast.success(msg, { duration: 5000 })
      if (failedTitles.length) {
        toast.error(
          `${failedTitles.length} book${failedTitles.length === 1 ? '' : 's'} could not be saved — will retry next sync`,
          { duration: 6000 }
        )
      }
    },
    onError: (err) => toast.error(err.message),
  })
}
