import { useState, useEffect, useRef } from 'react'
import { useLibrary } from './useLibrary'
import { searchBooks } from '../lib/googleBooks'
import {
  searchBySubject,
  getWeightedGenres,
  getAwardWinnersForGenres,
  isQualityBook,
  normalizeTitle,
} from '../lib/openLibrary'

// ── Deduplication helpers ─────────────────────────────────────────────────────

function buildLibrarySet(books) {
  const s = new Set()
  books.forEach(b => {
    s.add(normalizeTitle(b.title))
    // Also add first-4-words author+title key
    const key = (b.author || '') + '::' + normalizeTitle(b.title).split(' ').slice(0, 4).join(' ')
    s.add(key)
  })
  return s
}

function isInLibrary(book, librarySet) {
  const norm = normalizeTitle(book.title)
  if (librarySet.has(norm)) return true
  const key = (book.author || '') + '::' + norm.split(' ').slice(0, 4).join(' ')
  return librarySet.has(key)
}

function dedupe(books, seenTitles = new Set()) {
  const result = []
  books.forEach(b => {
    const key = normalizeTitle(b.title)
    if (seenTitles.has(key)) return
    seenTitles.add(key)
    result.push(b)
  })
  return result
}

// Random offset in multiples of 10, up to 40
function randomOffset() {
  return Math.floor(Math.random() * 5) * 10
}

// ── Section 1: More from authors you love ────────────────────────────────────
export function useAuthorRecs() {
  const { data: books = [] } = useLibrary()
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const seenRef = useRef(new Set()) // tracks titles shown across refreshes

  async function load() {
    setLoading(true); setError(false)
    try {
      const librarySet = buildLibrarySet(books)

      let sourceBooks = books.filter(b => b.status === 'read' && (b.rating || 0) >= 4)
      if (sourceBooks.length < 3) sourceBooks = books.filter(b => b.status === 'read')
      if (sourceBooks.length === 0) { setRecs([]); return }

      // Best-rated book per author, top 5 authors
      const authorMap = {}
      sourceBooks.forEach(b => {
        if (!b.author) return
        if (!authorMap[b.author] || (b.rating || 0) > (authorMap[b.author].rating || 0)) {
          authorMap[b.author] = b
        }
      })
      const topAuthors = Object.values(authorMap)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5)

      const results = await Promise.all(
        topAuthors.map(async (sourceBook) => {
          // Randomize start index on each call for refresh variety
          const offset = randomOffset()
          const query = `inauthor:"${sourceBook.author}"`
          const found = await searchBooks(query, 10, offset)
          return found
            .filter(b => !isInLibrary(b, librarySet))
            .filter(b => !seenRef.current.has(normalizeTitle(b.title)))
            .filter(isQualityBook)
            .slice(0, 2) // Hard cap: max 2 per author
            .map(b => ({ ...b, _because: sourceBook.title }))
        })
      )

      const flat = results.flat()
      const deduped = dedupe(flat)

      // Track what we've shown
      deduped.forEach(b => seenRef.current.add(normalizeTitle(b.title)))

      setRecs(deduped.slice(0, 10))
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (books.length > 0) load() }, [books.length])

  return { recs, loading, error, refresh: load }
}

// ── Section 2: In your wheelhouse ────────────────────────────────────────────
export function useGenreRecs() {
  const { data: books = [] } = useLibrary()
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [topGenres, setTopGenres] = useState([])
  const seenRef = useRef(new Set())

  async function load() {
    setLoading(true); setError(false)
    try {
      const librarySet = buildLibrarySet(books)
      const readBooks = books.filter(b => b.status === 'read')
      if (readBooks.length === 0) { setRecs([]); return }

      // Only use books that have real Google Books genre data
      const booksWithGenres = readBooks.filter(b => b.genres && b.genres.length > 0)
      const weighted = getWeightedGenres(booksWithGenres.length >= 3 ? booksWithGenres : readBooks)
      setTopGenres(weighted.slice(0, 3))

      if (weighted.length === 0) { setRecs([]); return }

      // Use top 3 genres, with randomized offsets for refresh variety
      const topThree = weighted.slice(0, 3).map(g => g.genre)

      const [gbResults, olResults] = await Promise.all([
        Promise.all(topThree.map(g =>
          searchBooks(`insubject:"${g}"`, 8, randomOffset())
        )),
        Promise.all(topThree.map(g =>
          searchBySubject(g, 8, randomOffset())
        )),
      ])

      const all = [...gbResults.flat(), ...olResults.flat()]
        .filter(b => !isInLibrary(b, librarySet))
        .filter(b => !seenRef.current.has(normalizeTitle(b.title)))
        .filter(isQualityBook)

      const deduped = dedupe(all)
      deduped.forEach(b => seenRef.current.add(normalizeTitle(b.title)))

      setRecs(deduped.slice(0, 12))
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (books.length > 0) load() }, [books.length])

  return { recs, loading, error, topGenres, refresh: load }
}

// ── Section 3: Stretch picks ──────────────────────────────────────────────────
export function useStretchRecs() {
  const { data: books = [] } = useLibrary()
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const shuffleSeedRef = useRef(0)

  async function load() {
    setLoading(true); setError(false)
    shuffleSeedRef.current += 1
    const seed = shuffleSeedRef.current
    try {
      const librarySet = buildLibrarySet(books)
      const readBooks = books.filter(b => b.status === 'read')
      if (readBooks.length === 0) { setRecs([]); return }

      const booksWithGenres = readBooks.filter(b => b.genres && b.genres.length > 0)
      const weighted = getWeightedGenres(booksWithGenres.length >= 3 ? booksWithGenres : readBooks)

      // Award winners filtered by user genres, shuffled differently each refresh
      const awardMatches = getAwardWinnersForGenres(weighted)
        .filter(b => !isInLibrary(b, librarySet))
        .sort((a, b) => (seed % 2 === 0 ? 1 : -1) * (a.title > b.title ? 1 : -1))

      // Fetch covers for award winners from Google Books
      const awardWithCovers = await Promise.all(
        awardMatches.slice(0, 8).map(async (book) => {
          try {
            const results = await searchBooks(`intitle:"${book.title}" inauthor:"${book.author}"`, 1)
            const match = results[0]
            return match ? { ...book, cover_url: match.cover_url, description: match.description, page_count: match.page_count, published_year: match.published_year, google_books_id: match.google_books_id } : book
          } catch { return book }
        })
      )

      // OL results from secondary/tertiary genres for variety
      const secondaryGenres = weighted.slice(1, 4).map(g => g.genre)
      const olResults = secondaryGenres.length > 0
        ? (await Promise.all(secondaryGenres.map(g =>
            searchBySubject(g, 6, randomOffset())
          ))).flat()
        : []

      const olFiltered = olResults
        .filter(b => !isInLibrary(b, librarySet))
        .filter(isQualityBook)

      // Interleave: 1 award winner, 1 OL result, repeat
      const all = []
      const maxLen = Math.max(awardWithCovers.length, olFiltered.length)
      for (let i = 0; i < maxLen; i++) {
        if (awardWithCovers[i]) all.push(awardWithCovers[i])
        if (olFiltered[i]) all.push(olFiltered[i])
      }

      const deduped = dedupe(all)
      setRecs(deduped.slice(0, 12))
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (books.length > 0) load() }, [books.length])

  return { recs, loading, error, refresh: load }
}
