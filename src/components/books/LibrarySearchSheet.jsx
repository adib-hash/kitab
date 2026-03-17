import { useState, useEffect, useRef } from 'react'
import { Search, X, Plus, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BookCover } from './BookCover'
import { StatusBadge } from './StatusBadge'

export function LibrarySearchSheet({ open, onClose, books = [], onAddBook }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // Auto-focus and scroll lock
  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    // Small delay so the sheet animation starts before focus
    const t = setTimeout(() => inputRef.current?.focus(), 80)

    return () => {
      clearTimeout(t)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Clear query when closed
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const q = query.trim().toLowerCase()
  const results = q
    ? books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.name.toLowerCase().includes(q))
      )
    : []

  function handleSelect(book) {
    onClose()
    navigate(`/library/${book.id}`)
  }

  function handleAddBook() {
    onClose()
    onAddBook(query)
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
      }}
      className="bg-paper-50 dark:bg-ink-900"
    >
      {/* Search bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-paper-200 dark:border-ink-700">
        <Search size={18} className="text-ink-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your library..."
          className="flex-1 bg-transparent text-ink-900 dark:text-paper-50 placeholder-ink-400 outline-none"
          style={{ fontSize: '16px' }}
        />
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-ink-400 hover:text-ink-700 dark:hover:text-paper-200 transition-colors"
          aria-label="Close search"
        >
          <X size={20} />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {/* No query yet */}
        {!q && (
          <div className="flex flex-col items-center justify-center py-16 text-ink-400">
            <Search size={36} className="mb-3 opacity-30" />
            <p className="text-sm">Search by title, author, or tag</p>
          </div>
        )}

        {/* Results list */}
        {q && results.length > 0 && (
          <div className="divide-y divide-paper-100 dark:divide-ink-800">
            {results.map(book => (
              <button
                key={book.id}
                type="button"
                onClick={() => handleSelect(book)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors text-left"
              >
                <div className="flex-shrink-0">
                  <BookCover book={book} size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                </div>
                <StatusBadge status={book.status} />
              </button>
            ))}
          </div>
        )}

        {/* No results in library */}
        {q && results.length === 0 && (
          <div className="flex flex-col items-center py-16 px-6 text-center gap-4">
            <p className="text-sm text-ink-500 dark:text-ink-400">
              "{query}" isn't in your library.
            </p>
            <button
              type="button"
              onClick={handleAddBook}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Add it to your library
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
