import { useState } from 'react'
import { X, BookOpen, BookMarked, Star, Tag, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUpdateBook } from '../../hooks/useLibrary'
import { StarRating } from '../books/StarRating'
import { BookForm } from '../books/BookForm'
import toast from 'react-hot-toast'

export function QuickActionsSheet({ book, open, onClose }) {
  const updateBook = useUpdateBook()
  const [ratingOpen, setRatingOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formTab, setFormTab] = useState('details')

  if (!book) return null

  async function handleRate(value) {
    await updateBook.mutateAsync({ id: book.id, updates: { rating: value } })
    toast.success(`Rated "${book.title}"`)
    onClose()
  }

  async function moveToReading() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'reading' } })
    toast.success(`Started reading "${book.title}"`)
    onClose()
  }

  async function moveToTBR() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'tbr' } })
    toast.success(`Moved "${book.title}" to TBR`)
    onClose()
  }

  function openForm(tab) {
    setFormTab(tab)
    setFormOpen(true)
  }

  const actions = [
    { icon: Tag, label: book.tags?.length ? 'Edit Tags' : 'Add Tags', action: () => openForm('details') },
    { icon: FileText, label: book.review ? 'Edit Review' : 'Write Review', action: () => openForm('review') },
    { icon: Star, label: book.rating ? `Rating: ${book.rating}★` : 'Rate this book', action: () => setRatingOpen(r => !r) },
    book.status !== 'reading' && { icon: BookOpen, label: 'Move to Currently Reading', action: moveToReading },
    book.status !== 'tbr' && { icon: BookMarked, label: 'Move to TBR', action: moveToTBR },
  ].filter(Boolean)

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[300] bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
            />
            {/* Sheet */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[310] bg-white dark:bg-ink-800 rounded-t-2xl shadow-2xl"
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
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-700 text-ink-400">
                  <X size={16} />
                </button>
              </div>

              {/* Actions */}
              <div className="px-2 py-2">
                {actions.map((item, i) => (
                  <div key={i}>
                    <button
                      onClick={item.action}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-ink-800 dark:text-ink-200 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors text-left"
                    >
                      <item.icon size={17} className="text-ink-500 dark:text-ink-400 flex-shrink-0" />
                      {item.label}
                    </button>
                    {/* Inline star rating */}
                    {item.icon === Star && ratingOpen && (
                      <div className="px-4 pb-3">
                        <StarRating value={book.rating} onChange={handleRate} size="lg" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Safe area */}
              <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} className="pb-4" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* BookForm opened via quick action */}
      {formOpen && (
        <BookForm
          open={formOpen}
          onClose={() => { setFormOpen(false); onClose() }}
          initialBook={book}
          defaultTab={formTab}
        />
      )}
    </>
  )
}
