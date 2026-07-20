// Book-metadata provider adapters for the bake-off.
// Each search* fn returns an array of normalized results in the app's book shape:
//   { title, author, cover_url, published_year, page_count, genres[], description, isbn, language }
// No app code is modified; Google logic mirrors src/lib/googleBooks.js, and we reuse
// normalizeTitle from the real app module for relevance scoring.

// ── shared helpers ────────────────────────────────────────────────────────────

const UA = 'Kitab-BakeOff/1.0 (+https://kitab.ihsan.build; adib@ihsan.build)'

export async function timedFetch(url, opts = {}) {
  const t0 = performance.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs || 10000), ...opts })
    const ms = Math.round(performance.now() - t0)
    return { res, ms }
  } catch (err) {
    return { res: null, ms: Math.round(performance.now() - t0), err }
  }
}

// ── Google Books (mirrors src/lib/googleBooks.js) ─────────────────────────────

function enhanceCoverUrl(url) {
  if (!url) return null
  return url
    .replace('http://', 'https://')
    .replace('zoom=1', 'zoom=3')
    .replace('&edge=curl', '')
}

function mapGoogleBook(volume) {
  const info = volume.volumeInfo || {}
  const isbn =
    info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ||
    info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier
  return {
    title: info.title || 'Unknown Title',
    author: info.authors?.join(', ') || null,
    cover_url: enhanceCoverUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
    published_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null,
    page_count: info.pageCount || null,
    genres: info.categories || [],
    description: info.description || null,
    isbn: isbn || null,
    language: info.language || null,
  }
}

export async function searchGoogle(query, { max = 10, apiKey } = {}) {
  if (!query?.trim()) return { results: [], ms: 0 }
  const params = new URLSearchParams({
    q: query,
    maxResults: String(max),
    printType: 'books',
    ...(apiKey && { key: apiKey }),
  })
  const { res, ms, err } = await timedFetch(
    `https://www.googleapis.com/books/v1/volumes?${params}`
  )
  if (err || !res || !res.ok) return { results: [], ms, error: err?.message || res?.status }
  const data = await res.json()
  return { results: (data.items || []).map(mapGoogleBook), ms }
}

// ── Open Library ──────────────────────────────────────────────────────────────

const OL_FIELDS =
  'key,title,author_name,cover_i,cover_edition_key,isbn,first_publish_year,number_of_pages_median,subject,language,edition_count'

// Cover by cover_i / OLID is NOT rate-limited (unlike by-ISBN), so we resolve
// covers through the search result's cover_i. size: 'S' | 'M' | 'L'
function olCoverUrl(doc, size = 'M') {
  if (doc.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-${size}.jpg`
  if (doc.cover_edition_key)
    return `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-${size}.jpg`
  return null
}

function mapOLDoc(doc, size = 'M') {
  return {
    title: doc.title || 'Unknown Title',
    author: doc.author_name?.[0] || (doc.author_name ? doc.author_name.join(', ') : null),
    cover_url: olCoverUrl(doc, size),
    published_year: doc.first_publish_year || null,
    page_count: doc.number_of_pages_median || null,
    genres: (doc.subject || []).slice(0, 5),
    description: null, // OL search endpoint returns no description (needs /works lookup)
    isbn: doc.isbn?.[0] || null,
    language: doc.language?.[0] || null,
    _edition_count: doc.edition_count || null,
  }
}

// mode: 'raw' (q=title author) | 'precise' (title=&author=) | 'isbn'
export async function searchOpenLibrary(
  { title, author, isbn, mode = 'raw', max = 10, coverSize = 'M' } = {}
) {
  const p = new URLSearchParams({ fields: OL_FIELDS, limit: String(max) })
  if (mode === 'isbn' && isbn) {
    p.set('isbn', isbn)
  } else if (mode === 'precise') {
    if (title) p.set('title', title)
    if (author) p.set('author', author)
  } else {
    p.set('q', [title, author].filter(Boolean).join(' '))
  }
  const { res, ms, err } = await timedFetch(`https://openlibrary.org/search.json?${p}`, {
    headers: { 'User-Agent': UA },
  })
  if (err || !res || !res.ok) return { results: [], ms, error: err?.message || res?.status }
  const data = await res.json()
  return { results: (data.docs || []).map(d => mapOLDoc(d, coverSize)), ms }
}

// ── Hardcover (GraphQL) ───────────────────────────────────────────────────────
// Uses the Typesense-backed `search` endpoint (flat document per hit — stays within
// the max-query-depth-of-3 limit). Field access is defensive because the search
// document shape is only lightly documented and in beta.

function hcPick(doc, keys) {
  for (const k of keys) if (doc[k] != null && doc[k] !== '') return doc[k]
  return null
}

function mapHardcoverDoc(doc) {
  const image = hcPick(doc, ['image', 'featured_series_image'])
  const cover =
    (image && typeof image === 'object' && (image.url || image.src)) ||
    hcPick(doc, ['cover_image_url', 'image_url', 'cover']) ||
    null
  const authors =
    doc.author_names ||
    doc.contributions?.map?.(c => c?.author?.name || c?.name).filter(Boolean) ||
    (doc.author ? [doc.author] : null)
  const genres = doc.genres || doc.cached_tags?.Genre?.map?.(g => g.tag || g.name) || []
  return {
    title: doc.title || 'Unknown Title',
    author: Array.isArray(authors) ? authors.join(', ') : authors || null,
    cover_url: cover,
    published_year: hcPick(doc, ['release_year']) ||
      (doc.release_date ? parseInt(String(doc.release_date).slice(0, 4)) : null),
    page_count: hcPick(doc, ['pages', 'page_count']),
    genres: Array.isArray(genres) ? genres.slice(0, 5) : [],
    description: doc.description || null,
    isbn: (doc.isbns && doc.isbns[0]) || doc.isbn_13 || doc.isbn_10 || null,
    language: doc.language || null,
    _rating: doc.rating || null,
  }
}

export async function searchHardcover(query, { token, max = 10, dump = false } = {}) {
  if (!token) return { results: [], ms: 0, error: 'no-token' }
  const gql = `query Search($q: String!, $n: Int!) {
    search(query: $q, query_type: "books", per_page: $n, page: 1, sort: "activities_count:desc") {
      results
    }
  }`
  const { res, ms, err } = await timedFetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    },
    body: JSON.stringify({ query: gql, variables: { q: query, n: max } }),
  })
  if (err || !res || !res.ok) return { results: [], ms, error: err?.message || res?.status }
  const json = await res.json()
  if (json.errors) return { results: [], ms, error: JSON.stringify(json.errors).slice(0, 300) }
  let results = json.data?.search?.results
  if (typeof results === 'string') { try { results = JSON.parse(results) } catch {} }
  const hits = results?.hits || results?.found != null ? (results.hits || []) : []
  if (dump && hits[0]) console.error('HARDCOVER sample document:\n', JSON.stringify(hits[0].document, null, 2))
  return { results: hits.map(h => mapHardcoverDoc(h.document || h)).filter(Boolean), ms }
}

// ── cover image probe (bytes + dimensions, no deps) ───────────────────────────

function parseImageSize(buf) {
  if (!buf || buf.length < 24) return null
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), type: 'gif' }
  // WEBP (VP8X / VP8L / VP8)
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    const fmt = buf.slice(12, 16).toString('ascii')
    try {
      if (fmt === 'VP8X') return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)), type: 'webp' }
      if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, type: 'webp' }
      if (fmt === 'VP8L') { const b = buf.slice(21); const w = 1 + (((b[1] & 0x3f) << 8) | b[0]); const h = 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)); return { w, h, type: 'webp' } }
    } catch { return { type: 'webp' } }
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2
    while (o < buf.length - 8) {
      if (buf[o] !== 0xff) { o++; continue }
      const m = buf[o + 1]
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7), type: 'jpeg' }
      o += 2 + buf.readUInt16BE(o + 2)
    }
    return { type: 'jpeg' }
  }
  return null
}

export async function probeCover(url) {
  if (!url) return { present: false, reason: 'no-url' }
  const { res, ms, err } = await timedFetch(url, { headers: { 'User-Agent': UA } })
  if (err || !res) return { present: false, reason: err?.message || 'fetch-failed', ms }
  if (!res.ok) return { present: false, reason: `http-${res.status}`, ms, status: res.status }
  const ct = res.headers.get('content-type') || ''
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  const bytes = buf.length
  const dims = parseImageSize(buf)
  // Google returns a 1x1/tiny "image not available" gif/png for missing covers;
  // OL (with default) returns a 1px gif. Treat sub-1KB or 1px as "no real cover".
  const tiny = bytes < 1500 || (dims && dims.w && dims.w <= 2)
  return {
    present: ct.startsWith('image/') && !tiny,
    bytes,
    kb: Math.round((bytes / 1024) * 10) / 10,
    w: dims?.w || null,
    h: dims?.h || null,
    type: dims?.type || ct.replace('image/', '') || null,
    ms,
    url,
  }
}

export const _internal = { enhanceCoverUrl, olCoverUrl }
