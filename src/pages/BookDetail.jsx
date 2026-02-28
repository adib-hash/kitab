import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, ExternalLink, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { useBook, useDeleteBook, useLibrary } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { StarRating } from '../components/books/StarRating'
import { StatusBadge } from '../components/books/StatusBadge'
import { BookCard } from '../components/books/BookCard'
import { BookForm } from '../components/books/BookForm'
import { ProgressBar, Button } from '../components/ui/index.jsx'
import { formatDate, daysBetween } from '../lib/utils'

export function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: book, isLoading } = useBook(id)
  const { data: allBooks = [] } = useLibrary()
  const deleteBook = useDeleteBook()
  const [editOpen, setEditOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-paper-200 rounded w-32" />
        <div className="flex gap-8">
          <div className="w-48 h-72 bg-paper-200 rounded-lg" />
          <div className="flex-1 space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-5 bg-paper-200 rounded w-3/4" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!book) return <div className="text-center py-20 text-ink-500">Book not found.</div>

  const readingDays = daysBetween(book.date_started, book.date_finished)

  // Similar books: same author or overlapping tags
  const bookTagIds = book.tags?.map(t => t.id) || []
  const similar = allBooks.filter(b =>
    b.id !== book.id && (
      b.author === book.author ||
      (bookTagIds.length > 0 && b.tags?.some(t => bookTagIds.includes(t.id)))
    )
  ).slice(0, 4)

  async function handleDelete() {
    if (!confirm(`Remove "${book.title}" from your library?`)) return
    await deleteBook.mutateAsync(book.id)
    navigate('/library')
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-4xl">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="btn-ghost -ml-1">
        <ArrowLeft size={16} /> Back
      </button>

      {/* Main content */}
      <div className="flex flex-col sm:flex-row gap-8">
        {/* Cover */}
        <div className="flex-shrink-0">
          <BookCover book={book} size="xl" className="shadow-book-hover" />

          {/* Progress bar for currently reading */}
          {book.status === 'reading' && book.page_count && book.current_page && (
            <div className="mt-3">
              <ProgressBar value={book.current_page} max={book.page_count} className="h-2" />
              <p className="text-xs text-ink-500 mt-1 text-center">
                Page {book.current_page} of {book.page_count}
              </p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink-900 dark:text-paper-50 leading-tight">{book.title}</h1>
            {book.author && <p className="text-ink-600 dark:text-ink-400 text-lg mt-1">by {book.author}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={book.status} />
            {book.rating && <StarRating value={book.rating} readOnly size="md" />}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {book.published_year && (
              <div>
                <p className="section-label">Published</p>
                <p className="text-sm text-ink-800 dark:text-ink-200 dark:text-ink-200 mt-0.5">{book.published_year}</p>
              </div>
            )}
            {book.page_count && (
              <div>
                <p className="section-label">Pages</p>
                <p className="text-sm text-ink-800 dark:text-ink-200 dark:text-ink-200 mt-0.5">{book.page_count}</p>
              </div>
            )}
            {book.date_finished && (
              <div>
                <p className="section-label">Finished</p>
                <p className="text-sm text-ink-800 dark:text-ink-200 dark:text-ink-200 mt-0.5">{formatDate(book.date_finished)}</p>
              </div>
            )}
            {book.date_started && (
              <div>
                <p className="section-label">Started</p>
                <p className="text-sm text-ink-800 dark:text-ink-200 dark:text-ink-200 mt-0.5">{formatDate(book.date_started)}</p>
              </div>
            )}
            {readingDays != null && (
              <div>
                <p className="section-label">Read in</p>
                <p className="text-sm text-ink-800 dark:text-ink-200 dark:text-ink-200 mt-0.5">{readingDays} days</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {book.tags?.length > 0 && (
            <div>
              <p className="section-label mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {book.tags.map(tag => (
                  <span key={tag.id} className="tag-pill">{tag.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* External links */}
          <div className="flex flex-wrap gap-2 pt-1">
            {book.google_books_id && (
              <a
                href={`https://books.google.com/books?id=${book.google_books_id}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                <ExternalLink size={12} /> Google Books
              </a>
            )}
            <a
              href={`https://www.goodreads.com/search?q=${encodeURIComponent(book.title + ' ' + (book.author || ''))}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-ghost text-xs"
            >
              <ExternalLink size={12} /> Goodreads
            </a>
            {book.isbn && (
              <a
                href={`https://www.worldcat.org/isbn/${book.isbn}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                <ExternalLink size={12} /> Worldcat
              </a>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Edit2 size={14} /> Edit
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={14} /> Remove
            </Button>
          </div>
        </div>
      </div>

      {/* Review */}
      {book.review && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">Your Review</h2>
            {book.review_spoiler && (
              <button
                onClick={() => setReviewOpen(!reviewOpen)}
                className="flex items-center gap-1 text-amber-600 text-xs font-medium"
              >
                <AlertTriangle size={13} />
                Spoilers
                {reviewOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </div>
          {(!book.review_spoiler || reviewOpen) ? (
            <div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
              <ReactMarkdown>{book.review}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-ink-400 italic">Review hidden — click to reveal</p>
          )}
          {book.updated_at && (
            <p className="text-xs text-ink-400 mt-3">Updated {formatDate(book.updated_at)}</p>
          )}
        </div>
      )}

      {/* Description */}
      {book.description && (
        <div className="card p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-3">About this book</h2>
          <p className="text-sm text-ink-700 dark:text-ink-300 leading-relaxed line-clamp-6">{book.description}</p>
        </div>
      )}

      {/* Similar books */}
      {similar.length > 0 && (
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-paper-50 mb-4">
            More from your library
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {similar.map((b, i) => <BookCard key={b.id} book={b} index={i} />)}
          </div>
        </div>
      )}

      <BookForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialBook={book}
        editingId={book.id}
        editingTags={book.tags}
      />
    </motion.div>
  )
}
