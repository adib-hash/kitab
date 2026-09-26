const OL_BASE = 'https://openlibrary.org'

// ── Open Library cover fallback ───────────────────────────────────────────────
// Used by Settings → Enrich Library when Google Books has no cover.

export async function findCoverUrl(title, author, isbn) {
  // Strategy 1: search by ISBN (most precise)
  if (isbn) {
    try {
      const res = await fetch(
        `${OL_BASE}/search.json?isbn=${encodeURIComponent(isbn)}&limit=1&fields=cover_i`
      )
      const data = await res.json()
      const hit = data.docs?.[0]
      if (hit?.cover_i) return `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg`
    } catch {}
  }

  // Strategy 2: search by title + author
  try {
    const q = [title, author].filter(Boolean).join(' ')
    const res = await fetch(
      `${OL_BASE}/search.json?q=${encodeURIComponent(q)}&limit=3&fields=cover_i,title`
    )
    const data = await res.json()
    const hit = data.docs?.find(d => d.cover_i)
    if (hit?.cover_i) return `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg`
  } catch {}

  return null
}
