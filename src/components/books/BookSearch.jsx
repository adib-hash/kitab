import { useState, useEffect, lazy, Suspense } from 'react'
import { Search, Loader2, BookOpen, ArrowRight, ExternalLink, Plus } from 'lucide-react'
import { Modal } from '../ui/index.jsx'
import { searchCatalog as searchBooks, searchCatalogByISBN as searchByISBN } from '../../lib/bookSearch'
import { BookCover } from './BookCover'
import { useDebounce } from '../../hooks/useDebounce'
import { useAddBook } from '../../hooks/useLibrary'
import { useQueryClient } from '@tanstack/react-query'
import { notifySuccess } from '../../lib/haptics'
import { Capacitor, registerPlugin } from '@capacitor/core'
import toast from 'react-hot-toast'

// Native AVFoundation scanner (ios/App/CapApp-SPM/.../KitabScannerPlugin.swift).
// The in-WebView @zxing scanner below is kept for the web app and as a fallback.
const KitabScanner = registerPlugin('KitabScanner')

// @zxing is only needed once someone taps the barcode icon; keep it out of the
// main bundle (BookSearch is reachable from the always-mounted GlobalSearch).
const BarcodeScannerModal = lazy(() => import('./BarcodeScannerModal').then(m => ({ default: m.BarcodeScannerModal })))

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
    let stale = false // a slower response for an earlier query must not overwrite a newer one
    setLoading(true)
    searchBooks(debounced).then(r => {
      if (stale) return
      setResults(r)
      setLoading(false)
    })
    return () => { stale = true }
  }, [debounced])

  const addBook = useAddBook()
  const qc = useQueryClient()
  const [addingId, setAddingId] = useState(null)

  function closeAndReset() {
    setQuery('')
    setResults([])
    onClose()
  }

  // One tap adds the book to the bottom of TBR. The toast offers Edit, which
  // opens the saved book in the caller's form (onSelect now receives the saved
  // row, with its id, rather than a draft).
  async function handleSelect(book) {
    if (addingId) return
    const norm = s => (s || '').trim().toLowerCase()
    const existing = (qc.getQueryData(['books']) || []).find(
      b => norm(b.title) === norm(book.title) && norm(b.author) === norm(book.author)
    )
    if (existing) {
      toast(`“${existing.title}” is already in your library`, { id: 'book-added' })
      return
    }
    setAddingId(book.google_books_id)
    try {
      const { source: _source, ...fields } = book // `source` is search metadata, not a column
      const saved = await addBook.mutateAsync({ book: { ...fields, status: 'tbr' }, tagIds: [] })
      notifySuccess()
      toast.success(t => (
        <span className="flex items-center gap-3">
          <span>Added “{saved.title}” to TBR</span>
          <button
            onClick={() => { toast.dismiss(t.id); onSelect?.(saved) }}
            className="font-semibold text-teal-400 hover:text-teal-300 flex-shrink-0"
          >
            Edit
          </button>
        </span>
      ), { id: 'book-added', duration: 4500 })
      closeAndReset()
    } catch {
      // useAddBook already showed the error
    } finally {
      setAddingId(null)
    }
  }

  async function openScanner() {
    if (!Capacitor.isNativePlatform()) { setScannerOpen(true); return }
    try {
      const res = await KitabScanner.scan()
      if (res?.status === 'ok' && res.code) return handleBarcodeScan(res.code)
      if (res?.status === 'denied') {
        toast.error('Kitab needs camera access to scan. Turn it on in Settings, then Kitab.', { duration: 5000 })
        return
      }
      if (res?.status === 'cancelled') return
      setScannerOpen(true) // 'unavailable': fall back to the web scanner
    } catch {
      setScannerOpen(true) // older native build without the plugin
    }
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
              <p className="text-sm text-ink-500 dark:text-ink-400 truncate">
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
                  onClick={openScanner}
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
              <p className="text-sm">Search, then tap a book to add it to your TBR</p>
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
                disabled={!!addingId}
                aria-label={`Add ${book.title} to TBR`}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors text-left group disabled:opacity-60"
              >
                <div className="flex-shrink-0">
                  <BookCover book={book} size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                    {book.title}
                  </p>
                  <p className="text-sm text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                  <p className="text-sm text-ink-400 dark:text-ink-500">
                    {[book.published_year, book.page_count && `${book.page_count} pages`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30">
                  {addingId === book.google_books_id ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                </span>
              </button>
            ))}
          </div>

          {onManual && (
            <div className="px-4 pb-4 pt-1 text-center">
              <button
                type="button"
                onClick={() => { onClose(); setQuery(''); setResults([]); onManual(); }}
                className="text-sm text-ink-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors underline underline-offset-2 inline-flex items-center gap-1"
              >
                Can't find it? Add manually <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      </Modal>

      {scannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScannerModal
            open
            onClose={() => setScannerOpen(false)}
            onDetect={isbn => { setScannerOpen(false); handleBarcodeScan(isbn) }}
          />
        </Suspense>
      )}
    </>
  )
}
