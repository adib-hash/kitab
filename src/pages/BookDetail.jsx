import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, ExternalLink, AlertTriangle, ChevronDown, ChevronUp, PenLine } from 'lucide-react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { useBook, useDeleteBook, useLibrary } from '../hooks/useLibrary'
import { useHighlights, useHighlightCount, useDeleteHighlight } from '../hooks/useHighlights'
import { useUIStore } from '../store/uiStore'
import { BookCover } from '../components/books/BookCover'
import { StarRating } from '../components/books/StarRating'
import { StatusBadge } from '../components/books/StatusBadge'
import { BookCard } from '../components/books/BookCard'
import { BookForm } from '../components/books/BookForm'
import { ReviewModal } from '../components/books/ReviewModal'
import { ProgressBar, Button } from '../components/ui/index.jsx'
import { formatDate, daysBetween } from '../lib/utils'

export function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: book, isLoading } = useBook(id)
  const { data: hlCount = 0 } = useHighlightCount(id)
  const { data: allBooks = [] } = useLibrary()
  const deleteBook = useDeleteBook()
  const { librarySlug } = useUIStore()
  // Reactive dark-mode detection
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const [editOpen, setEditOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [spoilerRevealed, setSpoilerRevealed] = useState(false)
  const [descOpen, setDescOpen] = useState(false)

  // Wikipedia link — start with search fallback, upgrade via API tiers
  const wikiSearchQ = encodeURIComponent(book?.title || '')
  const [wikiUrl, setWikiUrl] = useState(`https://en.wikipedia.org/w/index.php?search=${wikiSearchQ}`)
  useEffect(() => {
    if (!book?.title) return
    const encoded = encodeURIComponent(book.title)
    const fallback = `https://en.wikipedia.org/w/index.php?search=${encoded}`

    fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=info&inprop=url&redirects=1&format=json&origin=*`)
      .then(r => r.json())
      .then(data => {
        const page = Object.values(data.query.pages)[0]
        if (page?.pageid > 0 && page?.canonicalurl) {
          setWikiUrl(page.canonicalurl)
          return
        }
        // Tier 2: fulltext search
        return fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=1&format=json&origin=*`)
          .then(r => r.json())
          .then(data => {
            const hit = data?.query?.search?.[0]
            if (hit?.title) setWikiUrl(`https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`)
            // else: stays on fallback search URL
          })
      })
      .catch(() => {})
  }, [book?.id])

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
                <p className="text-sm text-ink-800 dark:text-ink-300 mt-0.5">{book.published_year}</p>
              </div>
            )}
            {book.page_count && (
              <div>
                <p className="section-label">Pages</p>
                <p className="text-sm text-ink-800 dark:text-ink-300 mt-0.5">{book.page_count}</p>
              </div>
            )}
            {book.date_finished && (
              <div>
                <p className="section-label">Finished</p>
                <p className="text-sm text-ink-800 dark:text-ink-300 mt-0.5">{formatDate(book.date_finished)}</p>
              </div>
            )}
            {book.date_started && (
              <div>
                <p className="section-label">Started</p>
                <p className="text-sm text-ink-800 dark:text-ink-300 mt-0.5">{formatDate(book.date_started)}</p>
              </div>
            )}
            {readingDays != null && (
              <div>
                <p className="section-label">Read in</p>
                <p className="text-sm text-ink-800 dark:text-ink-300 mt-0.5">{readingDays} days</p>
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
          <div className="flex gap-3 pt-1">
            <a
              href={book.isbn
                ? `https://www.amazon.com/s?k=${encodeURIComponent(book.isbn)}&i=stripbooks`
                : `https://www.amazon.com/s?k=${encodeURIComponent((book.title || '') + ' ' + (book.author || ''))}&i=stripbooks`
              }
              target="_blank" rel="noopener noreferrer"
              className="btn-ghost text-xs"
            >
              <ExternalLink size={12} /> Amazon
            </a>
            <a
              href={wikiUrl}
              target="_blank" rel="noopener noreferrer"
              className="btn-ghost text-xs"
            >
              <ExternalLink size={12} /> Wikipedia
            </a>
            {librarySlug && (
              <a
                href={`https://libbyapp.com/search/${librarySlug}/search/query-${encodeURIComponent((book.title || '') + ' ' + (book.author || ''))}/page-1`}
                target="_blank" rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                <ExternalLink size={12} /> Check Libby
              </a>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Edit2 size={14} /> Edit
            </Button>
            <Button variant="secondary" onClick={() => setReviewModalOpen(true)}>
              <PenLine size={14} /> {book.review ? 'Edit Review' : 'Write Review'}
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={14} /> Remove
            </Button>
          </div>
        </div>
      </div>

      {/* Review */}
      {book.review ? (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">Your Review</h2>
            <div className="flex items-center gap-2">
              {book.review_spoiler && (
                <button
                  onClick={() => setSpoilerRevealed(r => !r)}
                  className="flex items-center gap-1 text-amber-600 text-xs font-medium"
                >
                  <AlertTriangle size={13} />
                  Spoilers
                  {spoilerRevealed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
              <button
                onClick={() => setReviewModalOpen(true)}
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium"
              >
                Edit
              </button>
            </div>
          </div>
          {(!book.review_spoiler || spoilerRevealed) ? (
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
      ) : (
        <div className="card p-6 flex flex-col items-center gap-3 text-center">
          <PenLine size={24} className="text-ink-300 dark:text-ink-600" />
          <p className="text-sm text-ink-500 dark:text-ink-400">No review yet.</p>
          <Button variant="secondary" size="sm" onClick={() => setReviewModalOpen(true)}>
            Write a Review
          </Button>
        </div>
      )}

      {/* Description */}
      {book.description && (
        <div className="card p-6">
          <button
            onClick={() => setDescOpen(o => !o)}
            className="w-full flex items-center justify-between mb-3 group"
          >
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">About this book</h2>
            <span className="text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300 transition-colors">
              {descOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </button>
          <p className={"text-sm text-ink-700 dark:text-ink-300 leading-relaxed " + (descOpen ? "" : "line-clamp-3")}>
            {book.description}
          </p>
          {!descOpen && book.description.length > 200 && (
            <button
              onClick={() => setDescOpen(true)}
              className="mt-2 text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium"
            >
              Show more
            </button>
          )}
        </div>
      )}

      {/* Kindle Highlights */}
      <HighlightsSection bookId={id} count={hlCount} isDark={isDark} />

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
        onOpenReview={() => { setEditOpen(false); setReviewModalOpen(true) }}
      />

      <ReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        book={book}
      />
    </motion.div>
  )
}

// ── Highlights section for BookDetail ─────────────────────────────────────
function HighlightsSection({ bookId, count, isDark }) {
  const [open, setOpen] = useState(false)
  const { data: highlights = [], isLoading } = useHighlights(open ? bookId : null)
  const deleteHighlight = useDeleteHighlight()

  if (count === 0) return null

  return (
    <div className="card p-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group"
      >
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          ✏️ Kindle Highlights
          <span className="text-sm font-normal text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
            {count}
          </span>
        </h2>
        <span className="text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300 transition-colors text-sm">
          {open ? '▲ Hide' : '▼ Show'}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)
          ) : (
            highlights.map(h => (
              <div key={h.id} style={{
                borderRadius: '0.75rem',
                borderLeft: '4px solid #14b8a6',
                background: isDark ? '#1e293b' : '#fafaf9',
                padding: '1rem',
                position: 'relative',
              }}>
                <button
                  onClick={() => deleteHighlight.mutate(h.id)}
                  title="Delete highlight"
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    padding: '0.25rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: isDark ? '#475569' : '#d4ccc8',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f43f5e'}
                  onMouseLeave={e => e.currentTarget.style.color = isDark ? '#475569' : '#d4ccc8'}
                >
                  <Trash2 size={13} />
                </button>
                <p style={{
                  fontSize: '0.875rem',
                  color: isDark ? '#f1f5f9' : '#1c1917',
                  lineHeight: '1.625',
                  fontStyle: 'italic',
                  paddingRight: '1.5rem',
                }}>
                  "{h.text}"
                </p>
                {h.note && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: isDark ? '#94a3b8' : '#78716c',
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: `1px solid ${isDark ? '#334155' : '#e7e5e4'}`,
                    fontStyle: 'normal',
                  }}>
                    {h.note}
                  </p>
                )}
                {h.location && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: isDark ? '#94a3b8' : '#a8a29e',
                    marginTop: '0.25rem',
                  }}>Loc. {h.location}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
