import { useState, useEffect } from 'react'
import { X, BookmarkPlus, Check, ChevronDown, ChevronUp, Loader2, BookOpen, Calendar, FileText, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAddBook } from '../../hooks/useLibrary'
import { TagInput } from '../books/TagInput'
import { useUIStore } from '../../store/uiStore'

export function RecDetailModal({ book, open, onClose, inLibrary = false }) {
  const [descOpen, setDescOpen] = useState(false)
  const [added, setAdded] = useState(inLibrary)
  const [tagIds, setTagIds] = useState([])
  const addBook = useAddBook()
  const { librarySlug } = useUIStore()

  // iOS-compatible scroll lock — overflow:hidden alone doesn't work on Safari
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

  const libbySuffix = book ? encodeURIComponent(`${book.title} ${book.author}`) : ''
  const libbyUrl = librarySlug
    ? `https://libbyapp.com/search/${librarySlug}/search/query-${libbySuffix}/page-1`
    : null

  async function handleAdd() {
    if (added || addBook.isPending || !book) return
    await addBook.mutateAsync({
      book: {
        title: book.title,
        author: book.author,
        cover_url: book.cover_url || null,
        published_year: book.published_year || null,
        page_count: book.page_count || null,
        genres: book.genres || [],
        description: book.description || null,
        google_books_id: book.google_books_id || null,
        isbn: book.isbn || null,
        status: 'tbr',
      },
      tagIds,
    })
    setAdded(true)
  }

  return (
    <AnimatePresence onExitComplete={() => { setDescOpen(false); setAdded(inLibrary) }}>
      {open && book && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-ink-900/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal panel — matches BaseModal positioning exactly */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: 'calc(env(safe-area-inset-top) + 72px)',
              left: '1rem',
              right: '1rem',
              maxHeight: 'calc(100vh - env(safe-area-inset-top) - 88px)',
              zIndex: 260,
            }}
            className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-paper-200 dark:border-ink-700 overflow-hidden flex flex-col"
          >

              {/* Close */}
              <div className="flex justify-end px-4 pt-4 flex-shrink-0">
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-700 text-ink-400 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto px-5 pb-5 flex-1 min-h-0 space-y-5 overscroll-contain">

                {/* Cover + title */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-20">
                    {book.cover_url ? (
                      <img src={book.cover_url} alt={book.title} className="w-full rounded-lg shadow-book object-cover book-cover" />
                    ) : (
                      <div
                        className="w-full book-cover rounded-lg flex items-center justify-center text-lg font-serif font-bold text-white"
                        style={{ backgroundColor: `hsl(${(book.title.charCodeAt(0) * 37) % 360}, 35%, 30%)` }}
                      >
                        {book.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h2 className="font-serif text-base font-bold text-ink-900 dark:text-paper-50 leading-snug">{book.title}</h2>
                    <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">{book.author}</p>
                  </div>
                </div>

                {/* Why recommended */}
                {book.why && (
                  <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-xl px-3.5 py-3">
                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide mb-1">Why you'll love it</p>
                    <p className="text-sm text-teal-900 dark:text-teal-200 leading-relaxed">{book.why}</p>
                  </div>
                )}

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-paper-50 dark:bg-ink-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar size={11} className="text-ink-400" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Published</p>
                    </div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-300">{book.published_year || '—'}</p>
                  </div>
                  <div className="bg-paper-50 dark:bg-ink-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <FileText size={11} className="text-ink-400" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Pages</p>
                    </div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-300">
                      {book.page_count ? `${book.page_count}` : '—'}
                    </p>
                  </div>
                </div>

                {/* Description */}
                {book.description && (
                  <div>
                    <button
                      onClick={() => setDescOpen(o => !o)}
                      className="w-full flex items-center justify-between mb-2 group"
                    >
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={12} className="text-ink-400" />
                        <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">About this book</p>
                      </div>
                      <span className="text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300 transition-colors">
                        {descOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </span>
                    </button>
                    <p className={`text-sm text-ink-700 dark:text-ink-300 leading-relaxed ${descOpen ? '' : 'line-clamp-3'}`}>
                      {book.description}
                    </p>
                    {!descOpen && book.description.length > 160 && (
                      <button onClick={() => setDescOpen(true)} className="mt-1.5 text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium">
                        Show more
                      </button>
                    )}
                  </div>
                )}

                {/* Tags */}
                {!added && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">Add tags when saving</p>
                    <TagInput selectedTagIds={tagIds} onChange={setTagIds} />
                  </div>
                )}

                {/* External links */}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://www.goodreads.com/search?q=${encodeURIComponent(`${book.title} ${book.author}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="btn-ghost text-xs"
                  >
                    <ExternalLink size={11} /> Goodreads
                  </a>
                  {libbyUrl && (
                    <a href={libbyUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                      <ExternalLink size={11} /> Check Libby
                    </a>
                  )}
                </div>

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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
