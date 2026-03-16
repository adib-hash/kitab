import { useState, useEffect } from 'react'
import { X, BookOpen, BookMarked, Star, Tag, FileText, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUpdateBook } from '../../hooks/useLibrary'
import { useUIStore } from '../../store/uiStore'
import { StarRating } from '../books/StarRating'
import { BookForm } from '../books/BookForm'
import { ReviewModal } from '../books/ReviewModal'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = [
  { value: 'reading', label: 'Currently Reading', icon: BookOpen,     color: 'text-teal-600 dark:text-teal-400' },
  { value: 'tbr',     label: 'To Be Read',         icon: BookMarked,   color: 'text-blue-500 dark:text-blue-400' },
  { value: 'read',    label: 'Finished',            icon: CheckCircle,  color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'dnf',     label: 'Did Not Finish',      icon: XCircle,      color: 'text-rose-500 dark:text-rose-400' },
]

export function QuickActionsSheet({ book, open, onClose }) {
  const updateBook = useUpdateBook()
  const { setReviewPromptBook } = useUIStore()
  const [ratingOpen, setRatingOpen]   = useState(false)
  const [statusOpen, setStatusOpen]   = useState(false)
  const [formOpen, setFormOpen]       = useState(false)
  const [reviewOpen, setReviewOpen]   = useState(false)

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!book) return null

  async function handleRate(value) {
    await updateBook.mutateAsync({ id: book.id, updates: { rating: value } })
    toast.success(`Rated "${book.title}"`)
    onClose()
  }

  async function handleStatusChange(newStatus) {
    const updates = { status: newStatus }
    // Auto-set date_finished when marking as read (YYYY-MM-01 — month+year only, no day)
    if (newStatus === 'read' && !book.date_finished) {
      const n = new Date()
      updates.date_finished = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`
    }
    await updateBook.mutateAsync({ id: book.id, updates })
    const label = STATUS_OPTIONS.find(s => s.value === newStatus)?.label ?? newStatus
    toast.success(`"${book.title}" → ${label}`)
    onClose()
    // Prompt to write a review only if finishing a book with no review yet
    if (newStatus === 'read' && !book.review) {
      setReviewPromptBook({ id: book.id, title: book.title })
    }
  }

  function openForm() {
    setFormOpen(true)
    onClose()
  }

  function openReview() {
    setReviewOpen(true)
    onClose()
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === book.status)

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[300] bg-black/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
            />

            {/* Sheet */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[310] bg-white dark:bg-ink-900 rounded-t-2xl shadow-2xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-paper-300 dark:bg-ink-600" />
              </div>

              {/* Book header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-paper-100 dark:border-ink-700">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800 text-ink-400"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-2 py-2">

                {/* ── Status section ───────────────────────────────────────── */}
                <button
                  onClick={() => { setStatusOpen(s => !s); setRatingOpen(false) }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                >
                  {currentStatus && (
                    <currentStatus.icon size={18} className={`flex-shrink-0 ${currentStatus.color}`} />
                  )}
                  <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                    Status: {currentStatus?.label ?? book.status}
                  </span>
                  {statusOpen
                    ? <ChevronUp size={15} className="text-ink-400 flex-shrink-0" />
                    : <ChevronDown size={15} className="text-ink-400 flex-shrink-0" />
                  }
                </button>

                {/* Status options */}
                <AnimatePresence>
                  {statusOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mx-4 mb-2 rounded-xl overflow-hidden border border-paper-100 dark:border-ink-700 divide-y divide-paper-100 dark:divide-ink-700">
                        {STATUS_OPTIONS.map(opt => {
                          const isActive = book.status === opt.value
                          return (
                            <button
                              key={opt.value}
                              onClick={() => !isActive && handleStatusChange(opt.value)}
                              disabled={isActive}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                                isActive
                                  ? 'bg-paper-50 dark:bg-ink-800 cursor-default'
                                  : 'hover:bg-paper-50 dark:hover:bg-ink-800 active:bg-paper-100'
                              }`}
                            >
                              <opt.icon size={16} className={`flex-shrink-0 ${opt.color}`} />
                              <span className="flex-1 text-left font-medium text-ink-800 dark:text-paper-100">
                                {opt.label}
                              </span>
                              {isActive && (
                                <span className="text-[10px] font-semibold text-ink-400 dark:text-ink-500 uppercase tracking-wide">
                                  Current
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Tags ──────────────────────────────────────────────────── */}
                <button
                  onClick={openForm}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                >
                  <Tag size={18} className="flex-shrink-0 text-ink-500 dark:text-ink-400" />
                  <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                    {book.tags?.length ? 'Edit Tags' : 'Add Tags'}
                  </span>
                </button>

                {/* ── Review ────────────────────────────────────────────────── */}
                <button
                  onClick={openReview}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                >
                  <FileText size={18} className="flex-shrink-0 text-ink-500 dark:text-ink-400" />
                  <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                    {book.review ? 'Edit Review' : 'Write Review'}
                  </span>
                </button>

                {/* ── Rate ──────────────────────────────────────────────────── */}
                <button
                  onClick={() => { setRatingOpen(r => !r); setStatusOpen(false) }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                >
                  <Star size={18} className="flex-shrink-0 text-ink-500 dark:text-ink-400" />
                  <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                    {book.rating ? `Rating: ${book.rating}★` : 'Rate this book'}
                  </span>
                </button>

                <AnimatePresence>
                  {ratingOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden px-5 pb-3"
                    >
                      <StarRating value={book.rating} onChange={handleRate} size="lg" />
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>

              {/* iOS safe area */}
              <div style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {formOpen && (
        <BookForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          initialBook={book}
          onOpenReview={() => { setFormOpen(false); setReviewOpen(true) }}
        />
      )}

      {reviewOpen && (
        <ReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          book={book}
        />
      )}
    </>
  )
}
