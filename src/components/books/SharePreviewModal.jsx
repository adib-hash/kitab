import { useState, useEffect } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { BookCover } from './BookCover'
import { useAddBook } from '../../hooks/useLibrary'
import { searchBooks, searchByISBN } from '../../lib/googleBooks'

// ── URL parsing ───────────────────────────────────────────────────────────────

function parseSharedUrl(url) {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname.includes('amazon.')) {
      const m = pathname.match(/\/(?:dp|product)\/([A-Z0-9]{10})/)
      if (m) return { type: 'isbn', value: m[1] }
      // Amazon title slug fallback: /Book-Title-Here/dp/...
      const slug = pathname.match(/^\/([^/]+)\/dp\//)
      if (slug) return { type: 'title', value: slug[1].replace(/-/g, ' ') }
    }
    if (hostname.includes('goodreads.com')) {
      const gr = pathname.match(/\/book\/show\/\d+[.-](.+)$/)
      if (gr) return { type: 'title', value: gr[1].replace(/[-_]/g, ' ') }
    }
  } catch {}
  return null
}

async function lookupFromSharedUrl(url) {
  const parsed = parseSharedUrl(url)
  if (!parsed) return null
  if (parsed.type === 'isbn') {
    const results = await searchByISBN(parsed.value)
    if (results.length) return results[0]
    // ISBN miss — try ASIN as a search query
    const fallback = await searchBooks(parsed.value, 3)
    if (fallback.length) return fallback[0]
  }
  if (parsed.type === 'title') {
    const results = await searchBooks(parsed.value, 5)
    if (results.length) return results[0]
  }
  return null
}

function getHostname(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

// ── Status pills ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'tbr',     label: 'Want to Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'read',    label: 'Read' },
]

// ── Shimmer loading skeleton ──────────────────────────────────────────────────

function LoadingSkeleton({ hostname }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 animate-pulse">
      {/* Source badge */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-paper-100 dark:bg-ink-800">
        <ExternalLink size={12} className="text-ink-400" />
        <span className="text-xs text-ink-500 dark:text-ink-400">from {hostname}</span>
      </div>
      {/* Cover placeholder */}
      <div className="w-28 rounded-md bg-paper-200 dark:bg-ink-700" style={{ aspectRatio: '2/3' }} />
      {/* Text placeholders */}
      <div className="w-full space-y-2 px-2">
        <div className="h-5 rounded bg-paper-200 dark:bg-ink-700 w-4/5 mx-auto" />
        <div className="h-4 rounded bg-paper-200 dark:bg-ink-700 w-3/5 mx-auto" />
        <div className="h-3 rounded bg-paper-200 dark:bg-ink-700 w-2/5 mx-auto" />
      </div>
      <p className="text-xs text-ink-400 dark:text-ink-500">Finding book…</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SharePreviewModal({ open, sharedUrl, onClose, onEditDetails, onFallback }) {
  const [foundBook, setFoundBook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [status, setStatus] = useState('tbr')
  const addBook = useAddBook()

  // Scroll lock
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Auto-lookup on open
  useEffect(() => {
    if (!open || !sharedUrl) return
    setFoundBook(null)
    setNotFound(false)
    setStatus('tbr')
    setLoading(true)
    lookupFromSharedUrl(sharedUrl).then(book => {
      setLoading(false)
      if (book) {
        setFoundBook(book)
      } else {
        setNotFound(true)
        // Auto-fallback to search modal after brief delay
        setTimeout(() => onFallback(), 800)
      }
    })
  }, [open, sharedUrl])

  if (!open) return null

  const hostname = getHostname(sharedUrl)
  const meta = [
    foundBook?.published_year,
    foundBook?.page_count ? `${foundBook.page_count} pages` : null,
  ].filter(Boolean).join(' · ')

  async function handleAdd() {
    if (!foundBook) return
    await addBook.mutateAsync({ book: { ...foundBook, status }, tagIds: [] })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-end justify-center sm:items-center"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-sm bg-paper-50 dark:bg-ink-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-paper-300 dark:bg-ink-700" />
        </div>

        <div className="px-5 pb-6 pt-2">
          {loading && <LoadingSkeleton hostname={hostname} />}

          {notFound && (
            <div className="flex flex-col items-center gap-3 py-8 text-ink-400">
              <Search size={32} className="opacity-40" />
              <p className="text-sm">Couldn't identify this book automatically.</p>
              <p className="text-xs text-ink-400">Opening search…</p>
            </div>
          )}

          {foundBook && !loading && (
            <>
              {/* Source badge */}
              <div className="flex items-center justify-center gap-1.5 mb-4">
                <ExternalLink size={12} className="text-ink-400" />
                <span className="text-xs text-ink-500 dark:text-ink-400">from {hostname}</span>
              </div>

              {/* Cover */}
              <div className="flex justify-center mb-4">
                <BookCover book={foundBook} size="lg" className="shadow-lg" />
              </div>

              {/* Title + author */}
              <div className="text-center mb-1">
                <h2
                  className="font-serif font-semibold text-ink-900 dark:text-paper-50 leading-snug"
                  style={{ fontSize: 18 }}
                >
                  {foundBook.title}
                </h2>
              </div>
              <p className="text-center text-sm text-ink-500 dark:text-ink-400 mb-1">
                {foundBook.author}
              </p>
              {meta && (
                <p className="text-center text-xs text-ink-400 dark:text-ink-500 mb-3">
                  {meta}
                </p>
              )}

              {/* Description */}
              {foundBook.description && (
                <p
                  className="text-xs text-ink-500 dark:text-ink-400 mb-4 text-center leading-relaxed"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {foundBook.description}
                </p>
              )}

              {/* Status pills */}
              <div className="flex gap-2 justify-center mb-4">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={status === opt.value ? {
                      backgroundColor: '#0F766E',
                      color: '#fff',
                    } : {
                      backgroundColor: 'var(--color-paper-100, #F5F0EB)',
                      color: 'var(--color-ink-600, #57534E)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Add to Library */}
              <button
                type="button"
                onClick={handleAdd}
                disabled={addBook.isPending}
                className="btn-primary w-full mb-2"
              >
                {addBook.isPending ? 'Adding…' : 'Add to Library'}
              </button>

              {/* Edit details */}
              <button
                type="button"
                onClick={() => onEditDetails(foundBook)}
                className="btn-secondary w-full mb-3"
              >
                Edit details
              </button>

              {/* Search instead */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={onFallback}
                  className="text-xs text-ink-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors underline underline-offset-2"
                >
                  Not the right book? Search instead
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
