import { useState, useCallback, useEffect } from 'react'
import { Search, Loader2, BookOpen, ArrowRight, ExternalLink } from 'lucide-react'
import { Modal } from '../ui/index.jsx'
import { searchBooks, searchByISBN } from '../../lib/googleBooks'
import { BookCover } from './BookCover'
import { BarcodeScannerModal } from './BarcodeScannerModal'
import { clsx } from 'clsx'

function useDebounce(value, delay) {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return deb
}

// Inline barcode SVG icon — Lucide doesn't have one
function BarcodeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1"   y="2" width="1.5" height="14" rx="0.5" fill="currentColor" />
      <rect x="4"   y="2" width="1"   height="14" rx="0.5" fill="currentColor" />
      <rect x="6.5" y="2" width="2"   height="14" rx="0.5" fill="currentColor" />
      <rect x="10"  y="2" width="1"   height="14" rx="0.5" fill="currentColor" />
      <rect x="12.5"y="2" width="1.5" height="14" rx="0.5" fill="currentColor" />
      <rect x="15.5"y="2" width="1.5" height="14" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function extractTitleFromUrl(url) {
  if (!url) return ''
  try {
    const path = new URL(url).pathname
    // Amazon: /Book-Title-Here/dp/ASIN or /dp/ASIN/
    // Goodreads: /book/show/12345.Book_Title or /book/show/12345-book-title
    const amazonMatch = path.match(/^\/([^/]+)\/dp\//)
    if (amazonMatch) return amazonMatch[1].replace(/-/g, ' ')
    const goodreadsMatch = path.match(/\/book\/show\/\d+[.-](.+)$/)
    if (goodreadsMatch) return goodreadsMatch[1].replace(/[-_]/g, ' ')
  } catch {}
  return ''
}

export function BookSearchModal({ open, onClose, onSelect, onManual, prefill = '', sharedUrl = '' }) {
  const [query, setQuery] = useState('')

  // Pre-populate query when opened with a prefill value or shared URL
  useEffect(() => {
    if (open) {
      if (prefill) setQuery(prefill)
      else if (sharedUrl) setQuery(extractTitleFromUrl(sharedUrl))
    }
  }, [open, prefill, sharedUrl])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanLookingUp, setScanLookingUp] = useState(false)
  const debounced = useDebounce(query, 400)

  useEffect(() => {
    if (!debounced.trim()) { setResults([]); return }
    setLoading(true)
    searchBooks(debounced).then(r => {
      setResults(r)
      setLoading(false)
    })
  }, [debounced])

  function handleSelect(book) {
    onSelect(book)
    setQuery('')
    setResults([])
    onClose()
  }

  async function handleBarcodeScan(isbn) {
    setScanLookingUp(true)
    setQuery(isbn)
    const results = await searchByISBN(isbn)
    setScanLookingUp(false)
    if (results.length === 1) {
      handleSelect(results[0])
    } else if (results.length > 1) {
      setResults(results)
    }
    // 0 results: ISBN shown in input, existing empty state renders with "Add manually" CTA
  }

  return (
    <>
      <Modal open={open} onClose={() => { onClose(); setQuery(''); setResults([]) }} title="Add a Book" size="lg">
        <div className="p-4">
          {sharedUrl && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-paper-100 dark:bg-ink-800 flex items-start gap-2">
              <ExternalLink size={13} className="text-ink-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-ink-500 dark:text-ink-400 truncate">
                Shared from: <span className="font-mono">{(() => { try { return new URL(sharedUrl).hostname } catch { return sharedUrl } })()}</span>
              </p>
            </div>
          )}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by title, author, or ISBN..."
              className="input pl-9 pr-10" style={{ fontSize: "16px" }}
            />
            {loading || scanLookingUp
              ? <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 animate-spin" />
              : <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  aria-label="Scan barcode"
                >
                  <BarcodeIcon size={18} />
                </button>
            }
          </div>

          {results.length === 0 && !loading && !scanLookingUp && !query && (
            <div className="flex flex-col items-center py-10 text-ink-400">
              <BookOpen size={40} className="mb-3 opacity-40" />
              <p className="text-sm">Search for a book to add to your library</p>
            </div>
          )}

          {results.length === 0 && !loading && !scanLookingUp && query && (
            <div className="flex flex-col items-center py-10 text-ink-400 gap-3">
              <p className="text-sm">No results for "{query}"</p>
              {onManual && (
                <button
                  type="button"
                  onClick={() => { onClose(); setQuery(''); setResults([]); onManual() }}
                  className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Book not in Google Books? Add it manually
                </button>
              )}
            </div>
          )}

          <div className="space-y-1 overflow-y-auto" style={{maxHeight: "40vh"}}>
            {results.map(book => (
              <button
                key={book.google_books_id}
                onClick={() => handleSelect(book)}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors text-left group"
              >
                <div className="flex-shrink-0">
                  <BookCover book={book} size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                    {book.title}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                  <p className="text-xs text-ink-400 dark:text-ink-500">
                    {[book.published_year, book.page_count && `${book.page_count} pages`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {onManual && (
            <div className="px-4 pb-4 pt-1 text-center">
              <button
                type="button"
                onClick={() => { onClose(); setQuery(''); setResults([]); onManual(); }}
                className="text-xs text-ink-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors underline underline-offset-2 inline-flex items-center gap-1"
              >
                Can't find it? Add manually <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      </Modal>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetect={isbn => { setScannerOpen(false); handleBarcodeScan(isbn) }}
      />
    </>
  )
}
