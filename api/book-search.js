// Vercel Serverless Function — unified book search.
//
// Hybrid provider strategy (keeps all API credentials server-side):
//   1. Hardcover (primary) — best relevance, least junk, and best coverage of
//      niche/Islamic/Arabic titles in a measured bake-off. Popularity-sorted.
//   2. Google Books (fallback) — used when Hardcover has no token, errors, or
//      returns nothing, so search can never go dark. This mirrors today's behavior.
//
// Returns { source, books: [...] } where each book is the app's normalized shape:
//   { google_books_id, title, author, cover_url, published_year, page_count,
//     genres[], description, isbn, source }

const HARDCOVER_URL = 'https://api.hardcover.app/v1/graphql'
const GOOGLE_URL = 'https://www.googleapis.com/books/v1/volumes'

// Drop obvious non-book junk (summaries / study guides) that clutter title searches.
const JUNK_TITLE = /\b(summary|study guide|analysis of|workbook|cliffs?notes|sparknotes|conversation starters)\b/i

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const q = (req.query?.q || '').toString().trim()
  const max = Math.min(parseInt(req.query?.max) || 15, 20)
  if (!q) return res.status(400).json({ error: 'Missing q', books: [] })

  const googleKey = process.env.VITE_GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_API_KEY
  const hcToken = process.env.HARDCOVER_API_TOKEN

  // Short-lived edge/CDN cache — search results are stable enough for a few minutes.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400')

  try {
    let books = []
    let source = 'hardcover'

    if (hcToken) {
      try {
        books = await searchHardcover(q, max, hcToken)
      } catch (err) {
        books = [] // fall through to Google
      }
    }

    if (!books.length) {
      source = 'google'
      // Use Google's isbn: operator when the query is a bare ISBN, else raw text.
      const digits = q.replace(/[^0-9Xx]/g, '')
      const googleQ = /^\d{9}[\dXx]$|^\d{13}$/.test(digits) ? `isbn:${digits}` : q
      books = await searchGoogle(googleQ, max, googleKey)
    }

    return res.status(200).json({ source, books })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'search failed', books: [] })
  }
}

// ── Open Library cover by ISBN (lightweight gap-filler for coverless results) ──
function olCoverByIsbn(isbn) {
  if (!isbn) return null
  const clean = String(isbn).replace(/[^0-9Xx]/g, '')
  return clean ? `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg?default=false` : null
}

// ── Hardcover ─────────────────────────────────────────────────────────────────
async function searchHardcover(q, max, token) {
  const query = `query Search($q: String!, $n: Int!) {
    search(query: $q, query_type: "books", per_page: $n, page: 1, sort: "activities_count:desc") { results }
  }`
  const resp = await fetch(HARDCOVER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: { q, n: max } }),
  })
  if (!resp.ok) { const e = new Error(`Hardcover ${resp.status}`); e.status = resp.status; throw e }
  const json = await resp.json()
  if (json.errors) throw new Error('Hardcover GraphQL error')

  let results = json.data?.search?.results
  if (typeof results === 'string') { try { results = JSON.parse(results) } catch { results = null } }
  const hits = results?.hits || []

  return hits
    .map(h => mapHardcover(h.document || h))
    .filter(b => b && b.title && !JUNK_TITLE.test(b.title))
}

function mapHardcover(doc) {
  if (!doc) return null
  const isbn = (Array.isArray(doc.isbns) && doc.isbns[0]) || doc.isbn_13 || doc.isbn_10 || null
  const cover = (doc.image && (doc.image.url || doc.image.src)) || olCoverByIsbn(isbn)
  const year = doc.release_year || (doc.release_date ? parseInt(String(doc.release_date).slice(0, 4)) : null)
  return {
    google_books_id: `hc:${doc.id || doc.slug || doc.title}`,
    title: doc.title || 'Unknown Title',
    author: Array.isArray(doc.author_names) ? doc.author_names.join(', ') : (doc.author_names || null),
    cover_url: cover || null,
    published_year: Number.isFinite(year) ? year : null,
    page_count: doc.pages || null,
    genres: Array.isArray(doc.genres) ? doc.genres.slice(0, 5) : [],
    description: doc.description || null,
    isbn: isbn,
    source: 'hardcover',
  }
}

// ── Google Books (mirrors src/lib/googleBooks.js mapGoogleBook) ────────────────
function enhanceCoverUrl(url) {
  if (!url) return null
  return url.replace('http://', 'https://').replace('zoom=1', 'zoom=3').replace('&edge=curl', '')
}

async function searchGoogle(q, max, apiKey) {
  const params = new URLSearchParams({ q, maxResults: String(max), printType: 'books', ...(apiKey && { key: apiKey }) })
  const resp = await fetch(`${GOOGLE_URL}?${params}`)
  if (!resp.ok) { const e = new Error(`Google Books ${resp.status}`); e.status = resp.status; throw e }
  const data = await resp.json()
  return (data.items || []).map(mapGoogle).filter(b => b && b.title && !JUNK_TITLE.test(b.title))
}

function mapGoogle(volume) {
  const info = volume.volumeInfo || {}
  const isbn =
    info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ||
    info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier ||
    null
  return {
    google_books_id: volume.id,
    title: info.title || 'Unknown Title',
    author: info.authors?.join(', ') || null,
    cover_url: enhanceCoverUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail) || olCoverByIsbn(isbn),
    published_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null,
    page_count: info.pageCount || null,
    genres: info.categories || [],
    description: info.description || null,
    isbn,
    source: 'google',
  }
}
