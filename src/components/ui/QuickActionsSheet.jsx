import { useState, useEffect } from 'react'
import { X, BookOpen, BookMarked, Star, Tag, FileText, CheckCircle, XCircle, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUpdateBook } from '../../hooks/useLibrary'
import { useUIStore } from '../../store/uiStore'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { StarRating } from '../books/StarRating'
import { BookForm } from '../books/BookForm'
import { ReviewModal } from '../books/ReviewModal'
import toast from 'react-hot-toast'
import { impactMedium, notifySuccess, notifyWarning } from '../../lib/haptics'
import { STATUS } from '../../lib/utils'

const STATUS_ICONS = { reading: BookOpen, tbr: BookMarked, read: CheckCircle, dnf: XCircle }
const STATUS_OPTIONS = ['reading', 'tbr', 'read', 'dnf'].map(value => ({
  value, label: STATUS[value].label, icon: STATUS_ICONS[value], color: STATUS[value].text,
}))

export function QuickActionsSheet({ book, open, onClose, onOpenForm, onOpenReview }) {
  const updateBook = useUpdateBook()
  const setReviewPromptBook = useUIStore(s => s.setReviewPromptBook)
  const [ratingOpen, setRatingOpen]   = useState(false)
  const [statusOpen, setStatusOpen]   = useState(false)
  const [formOpen, setFormOpen]       = useState(false)
  const [reviewOpen, setReviewOpen]   = useState(false)

  const now = new Date()
  const [datePicking, setDatePicking] = useState(false)
  const [finishMonth, setFinishMonth] = useState(String(now.getMonth() + 1))
  const [finishYear, setFinishYear]   = useState(String(now.getFullYear()))

  useBodyScrollLock(open)

  useEffect(() => {
    if (open) impactMedium()
  }, [open])

  useEffect(() => {
    if (!open) {
      setDatePicking(false)
      setFinishMonth(String(new Date().getMonth() + 1))
      setFinishYear(String(new Date().getFullYear()))
    }
  }, [open])

  if (!book) return null

  async function handleRate(value) {
    await updateBook.mutateAsync({ id: book.id, updates: { rating: value } })
    notifySuccess()
    toast.success(`Rated "${book.title}"`)
    onClose()
  }

  async function handleStatusChange(newStatus) {
    if (newStatus === 'read' && !book.date_finished) {
      setStatusOpen(false)
      setDatePicking(true)
      return
    }
    const updates = { status: newStatus }
    await updateBook.mutateAsync({ id: book.id, updates })
    if (newStatus === 'dnf') {
      notifyWarning()
    } else {
      notifySuccess()
    }
    const messages = {
      reading: `Now reading "${book.title}" — enjoy!`,
      read: `Finished "${book.title}"!`,
      tbr: `"${book.title}" added to your reading list`,
      dnf: `"${book.title}" marked as did not finish`,
    }
    toast.success(messages[newStatus] ?? `"${book.title}" marked as ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label ?? newStatus}`)
    onClose()
    if (newStatus === 'read' && !book.review) {
      setReviewPromptBook({ id: book.id, title: book.title })
    }
  }

  async function confirmFinished() {
    const dateStr = `${finishYear}-${String(finishMonth).padStart(2, '0')}-01`
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'read', date_finished: dateStr } })
    toast.success(`Finished "${book.title}"!`)
    setDatePicking(false)
    onClose()
    if (!book.review) setReviewPromptBook({ id: book.id, title: book.title })
  }

  async function skipFinishedDate() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'read' } })
    toast.success(`Finished "${book.title}"!`)
    setDatePicking(false)
    onClose()
    if (!book.review) setReviewPromptBook({ id: book.id, title: book.title })
  }

  // When the caller owns a BookForm / ReviewModal (BookCard does), hand off to
  // it so the sheet can be unmounted while closed; otherwise use our own.
  function openForm() {
    onClose()
    if (onOpenForm) return onOpenForm('details')
    setFormOpen(true)
  }

  function openReview() {
    onClose()
    if (onOpenReview) return onOpenReview()
    setReviewOpen(true)
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === book.status)

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[300] bg-black/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={onClose}
            />

            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[310] bg-white dark:bg-ink-900 rounded-t-2xl shadow-2xl"
              style={{ maxHeight: '90vh', overflowY: 'auto' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-paper-300 dark:bg-ink-600" />
              </div>

              <div className="flex items-center gap-3 px-5 py-3 border-b border-paper-100 dark:border-ink-700">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800 text-ink-400"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-2 py-2">

                {datePicking && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink-800 dark:text-paper-100 mb-1">When did you finish?</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400 mb-3">Defaults to this month — change if needed.</p>
                    <div className="flex gap-2 mb-4">
                      <select
                        value={finishMonth}
                        onChange={e => setFinishMonth(e.target.value)}
                        className="input flex-1"
                        style={{ fontSize: '16px' }}
                      >
                        {["January","February","March","April","May","June","July","August","September","October","November","December"]
                          .map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
                      </select>
                      <select
                        value={finishYear}
                        onChange={e => setFinishYear(e.target.value)}
                        className="input w-24"
                        style={{ fontSize: '16px' }}
                      >
                        {Array.from({length: 6}, (_, i) => now.getFullYear() - i)
                          .map(y => <option key={y} value={String(y)}>{y}</option>)}
                      </select>
                    </div>
                    <button onClick={confirmFinished} disabled={updateBook.isPending} className="btn-primary w-full mb-2">
                      {updateBook.isPending ? 'Saving…' : 'Confirm'}
                    </button>
                    <button onClick={skipFinishedDate} className="w-full text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 py-1 text-center transition-colors">
                      Skip — don't set a date
                    </button>
                  </motion.div>
                )}

                {!datePicking && (
                  <>
                    {/* Status row and its options form one panel when open, so the
                        highlighted row and the list below it read as one object
                        instead of two overlapping boxes. */}
                    <div className={statusOpen ? 'rounded-xl bg-paper-50 dark:bg-ink-800 overflow-hidden mb-1' : ''}>
                    <button
                      onClick={() => { setStatusOpen(s => !s); setRatingOpen(false) }}
                      aria-expanded={statusOpen}
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

                    {statusOpen && (
                      <div className="border-t border-paper-200 dark:border-ink-700">
                        {STATUS_OPTIONS.map(opt => {
                          const isActive = book.status === opt.value
                          return (
                            <button
                              key={opt.value}
                              onClick={() => !isActive && handleStatusChange(opt.value)}
                              disabled={isActive}
                              aria-current={isActive}
                              className={`w-full flex items-center gap-3 pl-12 pr-4 py-3 text-sm transition-colors ${
                                isActive ? 'cursor-default' : 'active:bg-paper-100 dark:active:bg-ink-700'
                              }`}
                            >
                              <opt.icon size={16} className={`flex-shrink-0 ${opt.color}`} />
                              <span className="flex-1 text-left font-medium text-ink-800 dark:text-paper-100">
                                {opt.label}
                              </span>
                              {isActive && <Check size={16} className="text-teal-600 dark:text-teal-400 flex-shrink-0" aria-hidden="true" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    </div>

                    <button
                      onClick={openForm}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                    >
                      <Tag size={18} className="flex-shrink-0 text-ink-500 dark:text-ink-400" />
                      <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                        {book.tags?.length ? 'Edit Tags' : 'Add Tags'}
                      </span>
                    </button>

                    <button
                      onClick={openReview}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                    >
                      <FileText size={18} className="flex-shrink-0 text-ink-500 dark:text-ink-400" />
                      <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                        {book.review ? 'Edit Review' : 'Write Review'}
                      </span>
                    </button>

                    <button
                      onClick={() => { setRatingOpen(r => !r); setStatusOpen(false) }}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors active:bg-paper-100 dark:active:bg-ink-700"
                    >
                      <Star size={18} className="flex-shrink-0 text-ink-500 dark:text-ink-400" />
                      <span className="flex-1 text-left text-sm font-medium text-ink-800 dark:text-paper-100">
                        {book.rating ? `Rating: ${book.rating} / 5` : 'Rate this book'}
                      </span>
                    </button>

                    {ratingOpen && (
                      <div className="px-5 pb-3">
                        <StarRating value={book.rating} onChange={handleRate} size="lg" />
                      </div>
                    )}
                  </>
                )}

              </div>

              <div style={{ paddingBottom: datePicking ? 'max(env(safe-area-inset-bottom), 80px)' : 'max(env(safe-area-inset-bottom), 16px)' }} />
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
