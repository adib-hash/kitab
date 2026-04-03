import { useState } from 'react'
import { X, BookmarkPlus, Check, ChevronDown, ChevronUp, Loader2, BookOpen, Calendar, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAddBook } from '../../hooks/useLibrary'
import { searchBooks } from '../../lib/googleBooks'

export function BookPreviewModal({ book, open, onClose }) {
  const [descOpen, setDescOpen] = useState(false)
  const [added, setAdded] = useState(false)
  const [enriched, setEnriched] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const addBook = useAddBook()

  // Fetch richer data from Google Books if we don't have it yet
  async function fetchEnriched(b) {
    if (enriched || enriching) return
    if (b.description && b.page_count) return // already complete
    setEnriching(true)
    try {
      const query = `intitle:"${b.title}" inauthor:"${b.author || ''}"`
      const results = await searchBooks(query, 1)
      if (results[0]) setEnriched(results[0])
    } catch {}
    finally { setEnriching(false) }
  }

  // Merge enriched data on top of base book
  const display = enriched ? { ...book, ...enriched, cover_url: book.cover_url || enriched.cover_url } : book

  async function handleAdd() {
    if (added || addBook.isPending) return
    await addBook.mutateAsync({
      book: {
        title: display.title,
        author: display.author,
        cover_url: display.cover_url || null,
        published_year: display.published_year || null,
        page_count: display.page_count || null,
        genres: display.genres || [],
        description: display.description || null,
        google_books_id: display.google_books_id || null,
        isbn: display.isbn || null,
        status: 'tbr',
      },
      tagIds: [],
    })
    setAdded(true)
  }

  // Fetch enriched data when modal opens
  function handleOpen(b) {
    setDescOpen(false)
    fetchEnriched(b)
  }

  return (
    <AnimatePresence onExitComplete={() => setEnriched(null)}>
      {open && book && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-[250]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', duration: 0.3 }}
            onAnimationComplete={() => handleOpen(book)}
            className="fixed inset-x-4 max-w-md mx-auto z-[260] flex flex-col"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 72px)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
            }}
          >
            <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-paper-200 dark:border-ink-700 overflow-hidden flex flex-col min-h-0">
              {/* Close */}
              <div className="flex items-center justify-end px-4 pt-4 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-700 text-ink-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto px-5 pb-5 flex-1 min-h-0 scrollbar-persistent">
                {/* Book header */}
                <div className="flex gap-4 mb-5">
                  {/* Cover */}
                  <div className="flex-shrink-0 w-24">
                    {display.cover_url ? (
                      <img
                        src={display.cover_url}
                        alt={display.title}
                        className="w-full rounded-lg shadow-book object-cover book-cover"
                      />
                    ) : (
                      <div
                        className="w-full book-cover rounded-lg flex items-center justify-center text-xl font-serif font-bold text-white"
                        style={{ backgroundColor: `hsl(${(display.title.charCodeAt(0) * 37) % 360}, 35%, 30%)` }}
                      >
                        {display.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Title + author */}
                  <div className="flex-1 min-w-0 pt-1">
                    <h2 className="font-serif text-lg font-bold text-ink-900 dark:text-paper-50 leading-tight">
                      {display.title}
                    </h2>
                    <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                      {display.author}
                    </p>
                    {book.award && (
                      <span className="inline-flex mt-2 items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
                        ✦ {book.award}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata row */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-paper-50 dark:bg-ink-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar size={12} className="text-ink-400" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Published</p>
                    </div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-300">
                      {enriching ? (
                        <span className="inline-flex items-center gap-1 text-ink-400"><Loader2 size={10} className="animate-spin" /> Loading</span>
                      ) : display.published_year || '—'}
                    </p>
                  </div>
                  <div className="bg-paper-50 dark:bg-ink-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <FileText size={12} className="text-ink-400" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Pages</p>
                    </div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-300">
                      {enriching ? (
                        <span className="inline-flex items-center gap-1 text-ink-400"><Loader2 size={10} className="animate-spin" /> Loading</span>
                      ) : display.page_count ? `${display.page_count} pages` : '—'}
                    </p>
                  </div>
                </div>

                {/* Description */}
                {(display.description || enriching) && (
                  <div className="mb-5">
                    <button
                      onClick={() => setDescOpen(o => !o)}
                      className="w-full flex items-center justify-between mb-2 group"
                    >
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={13} className="text-ink-400" />
                        <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">About this book</p>
                      </div>
                      <span className="text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300 transition-colors">
                        {descOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>

                    {enriching && !display.description ? (
                      <div className="flex items-center gap-2 text-ink-400 text-sm">
                        <Loader2 size={13} className="animate-spin" /> Fetching description...
                      </div>
                    ) : display.description ? (
                      <>
                        <p className={`text-sm text-ink-700 dark:text-ink-300 leading-relaxed ${descOpen ? '' : 'line-clamp-3'}`}>
                          {display.description}
                        </p>
                        {!descOpen && display.description.length > 180 && (
                          <button
                            onClick={() => setDescOpen(true)}
                            className="mt-1.5 text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium"
                          >
                            Show more
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                )}

                {/* Add to TBR */}
                <button
                  onClick={handleAdd}
                  disabled={added || addBook.isPending}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    added
                      ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800'
                      : 'bg-teal-700 hover:bg-teal-800 text-white'
                  }`}
                >
                  {addBook.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Adding...</>
                  ) : added ? (
                    <><Check size={14} /> Added to TBR</>
                  ) : (
                    <><BookmarkPlus size={14} /> Add to TBR</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
