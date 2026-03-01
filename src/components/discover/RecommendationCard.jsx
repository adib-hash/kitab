import { useState } from 'react'
import { BookmarkPlus, Check, Star, Loader2 } from 'lucide-react'
import { useAddBook } from '../../hooks/useLibrary'
import { motion } from 'framer-motion'

export function RecommendationCard({ book, index = 0, inLibrary = false }) {
  const addBook = useAddBook()
  const [added, setAdded] = useState(inLibrary)

  async function handleAdd(e) {
    e.preventDefault()
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="flex flex-col gap-2.5 group"
    >
      {/* Cover */}
      <div className="relative overflow-hidden rounded-lg shadow-book group-hover:shadow-book-hover transition-all duration-200 group-hover:-translate-y-0.5">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="w-full object-cover book-cover"
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
        ) : null}
        {/* Fallback */}
        <div
          className="book-cover w-full flex items-center justify-center rounded-lg text-2xl font-serif font-bold text-white"
          style={{
            backgroundColor: `hsl(${(book.title.charCodeAt(0) * 37) % 360}, 35%, 30%)`,
            display: book.cover_url ? 'none' : 'flex',
          }}
        >
          {book.title.slice(0, 2).toUpperCase()}
        </div>

        {/* Add to TBR button overlay */}
        <button
          onClick={handleAdd}
          disabled={added}
          className={`absolute bottom-2 right-2 p-1.5 rounded-lg transition-all duration-200 ${
            added
              ? 'bg-teal-600 text-white opacity-100'
              : 'bg-ink-900/80 text-white opacity-0 group-hover:opacity-100 hover:bg-teal-700'
          }`}
          title={added ? 'In your TBR' : 'Add to TBR'}
        >
          {addBook.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : added ? (
            <Check size={13} />
          ) : (
            <BookmarkPlus size={13} />
          )}
        </button>

        {/* Award badge */}
        {book.award && (
          <div className="absolute top-2 left-2 bg-amber-500/90 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            ✦ {book.award.split(' ')[0]}
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        <p className="font-serif text-sm font-semibold text-ink-900 dark:text-paper-50 leading-snug line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
          {book.title}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400 truncate mt-0.5">{book.author}</p>
        {book.community_rating && (
          <div className="flex items-center gap-1 mt-0.5">
            <Star size={10} className="text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-ink-400">{book.community_rating}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
