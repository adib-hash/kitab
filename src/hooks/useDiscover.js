import { useState, useEffect } from 'react'
import { useLibrary } from './useLibrary'
import { searchBooks, mapGoogleBook } from '../lib/googleBooks'
import { searchBySubject, getWeightedGenres, getAwardWinnersForGenres } from '../lib/openLibrary'

const CACHE_KEY = 'kitab-discover-cache-v1'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

function getCacheKey(books) {
  const readIds = books.filter(b => b.status === 'read').map(b => b.id).sort().join(',')
  return btoa(readIds).slice(0, 20)
}

function loadCache(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw)
    if (cache.key !== key) return null
    if (Date.now() - cache.ts > CACHE_TTL) return null
    return cache.data
  } catch { return null }
}

function saveCache(key, data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, ts: Date.now(), data }))
  } catch {}
}

// ── Section 1: More from authors you love ────────────────────────────────────
export function useAuthorRecs(libraryTitles) {
  const { data: books = [] } = useLibrary()
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function fetch() {
    setLoading(true); setError(false)
    try {
      // Get read books rated 4+ (fall back to all read if not enough)
      let sourceBooks = books.filter(b => b.status === 'read' && (b.rating || 0) >= 4)
      if (sourceBooks.length < 3) sourceBooks = books.filter(b => b.status === 'read')
      if (sourceBooks.length === 0) { setRecs([]); return }

      // Weight authors by rating, pick top 5 unique
      const authorMap = {}
      sourceBooks.forEach(b => {
        if (!b.author) return
        const existing = authorMap[b.author]
        if (!existing || (b.rating || 0) > (existing.rating || 0)) {
          authorMap[b.author] = b
        }
      })
      const topAuthors = Object.values(authorMap)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5)

      // Query Google Books for each author
      const results = await Promise.all(
        topAuthors.map(async (sourceBook) => {
          const query = `inauthor:"${sourceBook.author}"`
          const found = await searchBooks(query, 8)
          return found
            .filter(b => !libraryTitles.has(b.title.toLowerCase().trim()))
            .slice(0, 3)
            .map(b => ({ ...b, _because: sourceBook.title }))
        })
      )

      const flat = results.flat()
      // Deduplicate by title
      const seen = new Set()
      const deduped = flat.filter(b => {
        const key = b.title.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key); return true
      })
      setRecs(deduped.slice(0, 12))
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (books.length > 0) fetch() }, [books.length])

  return { recs, loading, error, refresh: fetch }
}

// ── Section 2: In your wheelhouse ────────────────────────────────────────────
export function useGenreRecs(libraryTitles) {
  const { data: books = [] } = useLibrary()
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [topGenres, setTopGenres] = useState([])

  async function fetch() {
    setLoading(true); setError(false)
    try {
      const readBooks = books.filter(b => b.status === 'read')
      if (readBooks.length === 0) { setRecs([]); return }

      const weighted = getWeightedGenres(readBooks)
      setTopGenres(weighted.slice(0, 3))
      if (weighted.length === 0) { setRecs([]); return }

      // Query top 3 genres from both Google Books and Open Library
      const topThree = weighted.slice(0, 3).map(g => g.genre)

      const [gbResults, olResults] = await Promise.all([
        Promise.all(topThree.map(g => searchBooks(`subject:"${g}"`, 8))),
        Promise.all(topThree.map(g => searchBySubject(g, 8))),
      ])

      const all = [...gbResults.flat(), ...olResults.flat()]
        .filter(b => !libraryTitles.has(b.title.toLowerCase().trim()))

      // Deduplicate
      const seen = new Set()
      const deduped = all.filter(b => {
        const key = b.title.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key); return true
      })

      setRecs(deduped.slice(0, 15))
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (books.length > 0) fetch() }, [books.length])

  return { recs, loading, error, topGenres, refresh: fetch }
}

// ── Section 3: Stretch picks ──────────────────────────────────────────────────
export function useStretchRecs(libraryTitles) {
  const { data: books = [] } = useLibrary()
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function fetch() {
    setLoading(true); setError(false)
    try {
      const readBooks = books.filter(b => b.status === 'read')
      if (readBooks.length === 0) { setRecs([]); return }

      const weighted = getWeightedGenres(readBooks)

      // Strategy A: Award winners in your genres
      const awardMatches = getAwardWinnersForGenres(weighted)
        .filter(b => !libraryTitles.has(b.title.toLowerCase().trim()))

      // Strategy B: Open Library subject co-occurrence using secondary genres
      const secondaryGenres = weighted.slice(2, 5).map(g => g.genre)
      const olResults = secondaryGenres.length > 0
        ? await Promise.all(secondaryGenres.map(g => searchBySubject(g, 6)))
        : [[]]

      const olFlat = olResults.flat()
        .filter(b => !libraryTitles.has(b.title.toLowerCase().trim()))

      // Merge and deduplicate, interleaving award winners with OL results
      const all = []
      const seen = new Set()
      // Add library titles to seen
      ;[...awardMatches, ...olFlat].forEach(b => {
        const key = b.title.toLowerCase().trim()
        if (seen.has(key)) return
        seen.add(key)
        all.push(b)
      })

      // Shuffle slightly for variety
      const shuffled = all.sort(() => Math.random() - 0.3)
      setRecs(shuffled.slice(0, 12))
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (books.length > 0) fetch() }, [books.length])

  return { recs, loading, error, refresh: fetch }
}
