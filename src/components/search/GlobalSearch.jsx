import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, BookOpen, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLibrary } from '../../hooks/useLibrary'
import { BookCover } from '../books/BookCover'
import { StatusBadge } from '../books/StatusBadge'
import { BookSearchModal } from '../books/BookSearch'
import { BookForm } from '../books/BookForm'

export function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [addSearchOpen, setAddSearchOpen] = useState(false)
  const [addPrefill, setAddPrefill] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { data: books = [] } = useLibrary()

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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-50"
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ type: 'spring', duration: 0.25 }}
              className="fixed top-[10vh] inset-x-4 max-w-lg z-50 md:left-1/2 md:-translate-x-1/2 md:inset-x-auto md:w-full md:px-4"
            >
              <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-paper-200 dark:border-ink-700 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-paper-100 dark:border-ink-700">
                  <Search size={18} className="text-ink-400 flex-shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search books, authors, tags..."
                    className="flex-1 bg-transparent text-ink-900 dark:text-paper-50 placeholder:text-ink-400 outline-none"
                    style={{ fontSize: '16px' }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-300">
                      <X size={16} />
                    </button>
                  )}
                  <kbd className="hidden sm:flex items-center text-[10px] text-ink-400 border border-paper-200 dark:border-ink-600 rounded px-1.5 py-0.5 font-mono">
                    esc
                  </kbd>
                </div>

                {results.length > 0 ? (
                  <div className="max-h-[60vh] overflow-y-auto py-1">
                    {results.map(book => (
                      <button
                        key={book.id}
                        onClick={() => handleSelect(book)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors text-left"
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
                ) : q.length > 0 ? (
                  <div className="flex flex-col items-center py-10 text-ink-400 gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen size={32} className="opacity-40" />
                      <p className="text-sm">"{query}" isn't in your library.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBook}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors"
                    >
                      <Plus size={15} />
                      Add it to your library
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-ink-400 text-sm">
                    Start typing to search your library
                  </div>
                )}
              </div>
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
