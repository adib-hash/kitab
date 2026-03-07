import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Tag, FileText, BookMarked, BookOpen, Star } from 'lucide-react'
import { StarRating } from '../books/StarRating'
import { useUpdateBook } from '../../hooks/useLibrary'
import toast from 'react-hot-toast'

export function QuickActionsSheet({ book, open, onClose, onOpenForm }) {
  const updateBook = useUpdateBook()
  const [ratingOpen, setRatingOpen] = useState(false)

  if (!book) return null

  async function handleRate(value) {
    await updateBook.mutateAsync({ id: book.id, updates: { rating: value } })
    toast.success(`Rated "${book.title}"`)
    setRatingOpen(false)
    onClose()
  }

  async function handleMove() {
    const newStatus = book.status === 'tbr' ? 'reading' : 'tbr'
    const label = book.status === 'tbr' ? 'Moved to Currently Reading' : 'Moved to TBR'
    await updateBook.mutateAsync({ id: book.id, updates: { status: newStatus } })
    toast.success(label)
    onClose()
  }

  const actions = [
    {
      icon: <Tag size={18} />,
      label: 'Add / Edit Tags',
      key: 'tags',
      onClick: () => { onOpenForm('details'); onClose() },
    },
    {
      icon: <FileText size={18} />,
      label: book.review ? 'Edit Review' : 'Write Review',
      key: 'review',
      onClick: () => { onOpenForm('review'); onClose() },
    },
    {
      icon: <Star size={18} />,
      label: book.rating ? `Rating: ${book.rating}★` : 'Rate this book',
      key: 'rate',
      onClick: () => setRatingOpen(r => !r),
    },
    ...(book.status === 'tbr' ? [{
      icon: <BookOpen size={18} />,
      label: 'Move to Currently Reading',
      key: 'move-reading',
      onClick: handleMove,
    }] : []),
    ...(book.status !== 'tbr' ? [{
      icon: <BookMarked size={18} />,
      label: 'Move to TBR',
      key: 'move-tbr',
      onClick: handleMove,
    }] : []),
  ]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-ink-800 rounded-t-2xl shadow-2xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-paper-300 dark:bg-ink-600" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-paper-100 dark:border-ink-700">
              <div className="flex-1 min-w-0">
                <p className="font-serif font-semibold text-sm text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
              </div>
              <button onClick={onClose} className="ml-3 p-1.5 rounded-lg text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-2 pt-1 pb-1">
              {actions.map(action => (
                <div key={action.key}>
                  <button
                    onClick={action.onClick}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-left hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"
                  >
                    <span className="text-teal-600 dark:text-teal-400 flex-shrink-0">{action.icon}</span>
                    <span className="text-sm font-medium text-ink-800 dark:text-paper-100">{action.label}</span>
                  </button>
                  <AnimatePresence>
                    {action.key === 'rate' && ratingOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="flex justify-center pb-3 pt-1">
                          <StarRating value={book.rating} onChange={handleRate} size="lg" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
