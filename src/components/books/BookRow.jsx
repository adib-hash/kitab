import { memo } from 'react'
import { Link } from 'react-router-dom'
import { BookCover } from './BookCover'
import { StarRating } from './StarRating'
import { StatusBadge } from './StatusBadge'

export const BookRow = memo(function BookRow({ book }) {
  return (
    <Link
      to={`/library/${book.id}`}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-paper-50 dark:hover:bg-ink-800/60 transition-colors"
    >
      <BookCover book={book} size="sm" className="flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
          {book.title}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
        {/* Tags on mobile */}
        {book.tags?.length > 0 && (
          <div className="flex gap-1 mt-1 sm:hidden">
            {book.tags.slice(0, 2).map(tag => (
              <span key={tag.id} className="tag-pill">{tag.name}</span>
            ))}
          </div>
        )}
      </div>

      {/* Tags — tablet+ */}
      <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end min-w-0 max-w-[160px]">
        {book.tags?.slice(0, 3).map(tag => (
          <span key={tag.id} className="tag-pill">{tag.name}</span>
        ))}
      </div>

      <div className="flex-shrink-0">
        {book.rating ? (
          <StarRating value={book.rating} readOnly size="sm" />
        ) : (
          <StatusBadge status={book.status} />
        )}
      </div>
    </Link>
  )
})
