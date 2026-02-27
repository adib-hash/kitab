import { Link } from 'react-router-dom'
import { BookCover } from './BookCover'
import { StarRating } from './StarRating'
import { StatusBadge } from './StatusBadge'
import { formatDate } from '../../lib/utils'

export function BookRow({ book }) {
  return (
    <Link
      to={`/library/${book.id}`}
      className="group flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-800/60 transition-colors"
    >
      <BookCover book={book} size="sm" className="flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
          {book.title}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
      </div>

      <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end min-w-0 max-w-[200px]">
        {book.tags?.slice(0, 3).map(tag => (
          <span key={tag.id} className="tag-pill">{tag.name}</span>
        ))}
      </div>

      <div className="hidden md:block w-28 text-right">
        {book.date_finished && (
          <p className="text-xs text-ink-500">{formatDate(book.date_finished)}</p>
        )}
        {book.published_year && (
          <p className="text-xs text-ink-400">{book.published_year}</p>
        )}
      </div>

      <div className="w-28 flex justify-end">
        {book.rating ? (
          <StarRating value={book.rating} readOnly size="sm" />
        ) : (
          <StatusBadge status={book.status} />
        )}
      </div>
    </Link>
  )
}
