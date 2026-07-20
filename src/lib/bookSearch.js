import { Capacitor } from '@capacitor/core'

// User-facing "add a book" search — the barcode/share/title lookups a person runs
// to add a book to their library. Routes through the server-side proxy
// (api/book-search), which is Hardcover-first with an automatic Google Books
// fallback, so all provider credentials stay off the client.
//
// The Discover feed and metadata enrichment still use src/lib/googleBooks.js
// directly, because they rely on Google's query operators (inauthor:/insubject:/
// intitle:) and pagination, which the catalog proxy does not model.
const API_BASE = Capacitor.isNativePlatform() ? 'https://kitab.ihsan.build' : ''

export async function searchCatalog(query, maxResults = 15) {
  if (!query?.trim()) return []
  try {
    const res = await fetch(
      `${API_BASE}/api/book-search?q=${encodeURIComponent(query)}&max=${maxResults}`
    )
    if (!res.ok) throw new Error(`Book search error: ${res.status}`)
    const data = await res.json()
    return data.books || []
  } catch (err) {
    console.error('Book search failed:', err)
    return []
  }
}

export async function searchCatalogByISBN(isbn) {
  return searchCatalog(String(isbn).trim(), 5)
}
