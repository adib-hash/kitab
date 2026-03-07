import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookCover } from './BookCover'
import { StarRating } from './StarRating'
import { StatusBadge } from './StatusBadge'
import { QuickActionsSheet } from '../ui/QuickActionsSheet'
import { BookForm } from './BookForm'
import { useLongPress } from '../../hooks/useLongPress'

export function BookCard({ book, index = 0 }) {
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formTab, setFormTab] = useState('details')

  const longPress = useLongPress(() => setSheetOpen(true))

  function handleClick() {
    // Don't navigate if the long-press sheet just opened
    if (!sheetOpen) navigate(`/library/${book.id}`)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03, duration: 0.3 }}
        {...longPress}
        onClick={handleClick}
        className="group flex flex-col gap-2.5 cursor-pointer"
        style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
      >
        <div className="relative overflow-hidden rounded-lg shadow-book group-hover:shadow-book-hover transition-all duration-200 group-hover:-translate-y-1">
          <BookCover book={book} size="full" className="w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-2.5">
            <StatusBadge status={book.status} />
          </div>
        </div>
        <div>
          <p className="font-serif text-sm font-semibold text-ink-900 dark:text-paper-50 leading-snug line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
            {book.title}
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400 truncate mt-0.5">{book.author}</p>
          {book.rating && (
            <div className="mt-1">
              <StarRating value={book.rating} readOnly size="sm" />
            </div>
          )}
        </div>
      </motion.div>

      <QuickActionsSheet
        book={book}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpenForm={(tab) => { setFormTab(tab); setFormOpen(true) }}
      />
      <BookForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initialBook={book}
        editingId={book.id}
        editingTags={book.tags}
        defaultTab={formTab}
      />
    </>
  )
}
