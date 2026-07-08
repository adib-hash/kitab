import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, BookOpen, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLibrary } from '../../hooks/useLibrary'
import { BookCover } from '../books/BookCover'
import { StatusBadge } from '../books/StatusBadge'
import { BookSearchModal } from '../books/BookSearch'
import { BookForm } from '../books/BookForm'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

export function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [addSearchOpen, setAddSearchOpen] = useState(false)
  const [addPrefill, setAddPrefill] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { data: books = [] } = useLibrary()

  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80)
    } else {
      setQuery('')
    }
  }, [open])

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const q = query.trim().toLowerCase()
  const results = q.length < 1 ? [] : books.filter(b =>
    b.title?.toLowerCase().includes(q) ||
    b.author?.toLowerCase().includes(q) ||
    b.isbn?.includes(q) ||
    b.tags?.some(t => t.name.toLowerCase().includes(q))
  ).slice(0, 8)

  function handleSelect(book) {
    navigate(`/library/${book.id}`)
    onClose()
  }

  function handleAddBook() {
    setAddPrefill(query)
    onClose()
    setAddSearchOpen(true)
  }

  function handleSearchSelect(book) {
    setSelectedBook(book)
    setFormOpen(true)
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[400] bg-ink-900/60 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              className="fixed top-0 left-0 right-0 z-[410] bg-white dark:bg-ink-900 shadow-2xl"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}
              initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-paper-200 dark:border-ink-700">
                <Search size={18} className="text-ink-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search your library..."
                  className="flex-1 bg-transparent text-ink-900 dark:text-paper-50 placeholder-ink-400 text-base outline-none"
                  style={{ fontSize: '16px' }}
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-300">
                    <X size={16} />
                  </button>
                )}
                <button onClick={onClose} className="text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 px-2 py-1 rounded-md border border-paper-200 dark:border-ink-600">
                  Esc
                </button>
              </div>

              {results.length > 0 && (
                <div className="max-h-80 overflow-y-auto divide-y divide-paper-100 dark:divide-ink-700">
                  {results.map(book => (
                    <button
                      key={book.id}
                      onClick={() => handleSelect(book)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors text-left"
                    >
                      <BookCover book={book} size="sm" className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                      </div>
                      <StatusBadge status={book.status} />
                    </button>
                  ))}
                </div>
              )}

              {q.length > 0 && results.length === 0 && (
                <div className="px-4 py-4 space-y-3">
                  <p className="text-sm text-ink-500 dark:text-ink-400">No matches in your library.</p>
                  <button
                    onClick={handleAddBook}
                    className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400 hover:underline font-medium"
                  >
                    <Plus size={14} /> Add "{query}" to your library
                  </button>
                </div>
              )}

              {q.length === 0 && (
                <div className="px-4 py-4 text-sm text-ink-400 dark:text-ink-500">
                  Type to search by title, author, or tag.
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BookSearchModal
        open={addSearchOpen}
        onClose={() => setAddSearchOpen(false)}
        onSelect={handleSearchSelect}
        onManual={() => { setSelectedBook(null); setFormOpen(true) }}
        prefill={addPrefill}
      />
      <BookForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedBook(null) }}
        initialBook={selectedBook}
      />
    </>
  )
}
