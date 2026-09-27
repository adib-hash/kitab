// Right-size a stored cover URL to its display size at render time — no DB migration.
// Google Books content URLs carry a `zoom` param (zoom=3 ≈ 575px, zoom=1 ≈ 128px);
// Open Library covers carry a size suffix (-S / -M / -L). Everything else (Hardcover
// assets, data:/blob: URIs, user-pasted URLs, SVG) has no safe resize lever and is
// returned unchanged.
//
// This is what fixes "slow covers" for the covers already saved in the library: a 48px
// list thumbnail no longer downloads a 575px / ~80KB image.

const GOOGLE_ZOOM = { sm: 1, md: 1, lg: 2, xl: 2, full: 2 }
const OL_SIZE = { sm: 'M', md: 'M', lg: 'L', xl: 'L', full: 'L' }

export function sizeCoverUrl(url, size = 'md') {
  if (!url || typeof url !== 'string') return url || null
  if (url.startsWith('data:') || url.startsWith('blob:')) return url

  // Google Books content endpoint (books.google.com / *.googleusercontent.com)
  if (url.includes('books.google') || url.includes('googleusercontent')) {
    const zoom = GOOGLE_ZOOM[size] ?? 1
    if (/([?&])zoom=\d+/.test(url)) return url.replace(/([?&])zoom=\d+/, `$1zoom=${zoom}`)
    return url + (url.includes('?') ? '&' : '?') + `zoom=${zoom}`
  }

  // Open Library covers: .../b/id/12345-L.jpg (also -M / -S), optional query string
  if (url.includes('covers.openlibrary.org')) {
    const s = OL_SIZE[size] ?? 'M'
    return url.replace(/-(?:S|M|L)\.jpg(\?.*)?$/i, `-${s}.jpg$1`)
  }

  return url
}

// Google Books answers a missing larger scan with an "image not available" PNG
// and a 200 status, so onError never fires. It is always one of these exact
// sizes; anything else is a real cover. (Measured 2026-09-26: zoom=2 placeholder
// 300x391, zoom=3 placeholder 575x750. Real covers at those sizes are ~300x440.)
const GOOGLE_PLACEHOLDER_SIZES = new Set(['300x391', '575x750'])

export function isGooglePlaceholder(img, src) {
  if (!img || !src || !(src.includes('books.google') || src.includes('googleusercontent'))) return false
  return GOOGLE_PLACEHOLDER_SIZES.has(`${img.naturalWidth}x${img.naturalHeight}`)
}

/** The smallest Google Books scan (zoom=1), which exists whenever any cover does. */
export function googleThumbnail(url) {
  if (!url) return url
  return /([?&])zoom=\d+/.test(url) ? url.replace(/([?&])zoom=\d+/, '$1zoom=1') : url
}

// Build an Open Library cover URL from an ISBN (the lightest, most reliable cover source
// when a book has an ISBN). `default=false` makes a missing cover 404 instead of returning
// a blank placeholder, so onError fallbacks fire cleanly.
export function olCoverByIsbn(isbn, size = 'M') {
  if (!isbn) return null
  const clean = String(isbn).replace(/[^0-9Xx]/g, '')
  if (!clean) return null
  return `https://covers.openlibrary.org/b/isbn/${clean}-${size}.jpg?default=false`
}
