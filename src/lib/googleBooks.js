const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'
const API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY

/**
 * Enhance cover URL to get higher resolution image
 */
function enhanceCoverUrl(url) {
  if (!url) return null
  return url
    .replace('http://', 'https://')
    .replace('zoom=1', 'zoom=3')
    .replace('&edge=curl', '')
}

/**
 * Map a Google Books volume to our internal book schema
 */
export function mapGoogleBook(volume) {
  const info = volume.volumeInfo || {}
  const isbn = info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier
    || info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier

  return {
    google_books_id: volume.id,
    title: info.title || 'Unknown Title',
    author: info.authors?.join(', ') || 'Unknown Author',
    cover_url: enhanceCoverUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
    published_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null,
    page_count: info.pageCount || null,
    genres: info.categories || [],
    description: info.description || null,
    isbn: isbn || null,
  }
}

/**
 * Search books by query string
 */
export async function searchBooks(query, maxResults = 15) {
  if (!query?.trim()) return []

  const params = new URLSearchParams({
    q: query,
    maxResults,
    printType: 'books',
    ...(API_KEY && { key: API_KEY }),
  })

  try {
    const res = await fetch(`${GOOGLE_BOOKS_BASE}/volumes?${params}`)
    if (!res.ok) throw new Error(`Google Books API error: ${res.status}`)
    const data = await res.json()
    return (data.items || []).map(mapGoogleBook)
  } catch (err) {
    console.error('Book search failed:', err)
    return []
  }
}

/**
 * Fetch a single book by Google Books ID
 */
export async function fetchBookById(googleBooksId) {
  try {
    const params = API_KEY ? `?key=${API_KEY}` : ''
    const res = await fetch(`${GOOGLE_BOOKS_BASE}/volumes/${googleBooksId}${params}`)
    if (!res.ok) throw new Error(`Google Books API error: ${res.status}`)
    const data = await res.json()
    return mapGoogleBook(data)
  } catch (err) {
    console.error('Book fetch failed:', err)
    return null
  }
}

/**
 * Search books by ISBN
 */
export async function searchByISBN(isbn) {
  return searchBooks(`isbn:${isbn}`, 5)
}
