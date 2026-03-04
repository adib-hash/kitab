import { useState } from 'react'
import { BookmarkPlus, Check, Loader2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAddBook } from '../../hooks/useLibrary'

export function RecBookCard({ book, index = 0, inLibrary = false, onClick, onDelete }) {
  const addBook = useAddBook()
  const [added, setAdded] = useState(inLibrary)

  async function handleAdd(e) {
    e.stopPropagation()
    if (added || addBook.isPending) return
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
      tagIds: [],
    })
    setAdded(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      onClick={() => onClick?.(book)}
      className="flex gap-3 p-3 rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 hover:border-teal-400/60 dark:hover:border-teal-600/60 hover:shadow-sm transition-all cursor-pointer group"
    >
      {/* Cover */}
      <div className="flex-shrink-0 w-12 relative">
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} className="w-full rounded-md shadow-sm object-cover book-cover" />
        ) : (
          <div
            className="w-full book-cover rounded-md flex items-center justify-center text-sm font-serif font-bold text-white"
            style={{ backgroundColor: `hsl(${(book.title.charCodeAt(0) * 37) % 360}, 35%, 30%)` }}
          >
            {book.title.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-serif text-sm font-semibold text-ink-900 dark:text-paper-50 leading-snug line-clamp-1 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
          {book.title}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{book.author}</p>
        {book.why && (
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-1 line-clamp-2 italic leading-relaxed">
            {book.why}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 flex-shrink-0 self-start mt-0.5">
        <button
          onClick={handleAdd}
          disabled={added}
          className={`p-1.5 rounded-lg transition-all ${
            added
              ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
              : 'text-ink-300 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 dark:hover:text-teal-400'
          }`}
          title={added ? 'In your TBR' : 'Add to TBR'}
        >
          {addBook.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : added ? (
            <Check size={14} />
          ) : (
            <BookmarkPlus size={14} />
          )}
        </button>
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded-lg text-ink-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
            title="Remove this recommendation"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </motion.div>
  )
}
