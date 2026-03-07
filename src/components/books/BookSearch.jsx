import { useState, useCallback, useEffect } from 'react'
import { Search, Loader2, BookOpen } from 'lucide-react'
import { Modal } from '../ui/index.jsx'
import { searchBooks } from '../../lib/googleBooks'
import { BookCover } from './BookCover'
import { clsx } from 'clsx'

function useDebounce(value, delay) {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return deb
}

export function BookSearchModal({ open, onClose, onSelect, onManual }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
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

  return (
    <Modal open={open} onClose={() => { onClose(); setQuery(''); setResults([]) }} title="Add a Book" size="lg">
      <div className="p-4">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by title, author, or ISBN..."
            className="input pl-9" style={{ fontSize: "16px" }}
          />
          {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 animate-spin" />}
        </div>

        {results.length === 0 && !loading && !query && (
          <div className="flex flex-col items-center py-10 text-ink-400">
            <BookOpen size={40} className="mb-3 opacity-40" />
            <p className="text-sm">Search for a book to add to your library</p>
          </div>
        )}

        {results.length === 0 && !loading && query && (
          <div className="flex flex-col items-center py-10 text-ink-400">
            <p className="text-sm">No results for "{query}"</p>
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
              className="text-xs text-ink-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors underline underline-offset-2"
            >
              Can't find it? Add manually →
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
