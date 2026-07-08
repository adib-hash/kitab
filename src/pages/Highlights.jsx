import { useState, useMemo, useCallback } from 'react'
import { Quote, Search, X } from 'lucide-react'
import { useAllHighlights, useDeleteHighlight } from '../hooks/useHighlights'
import { useLibrary } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { EmptyState } from '../components/ui/index.jsx'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useState(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  })
  // Use useCallback to wrap the setter properly
  return debounced
}

export function Highlights() {
  const { data: highlights = [], isLoading } = useAllHighlights()
  const { data: books = [] } = useLibrary()
  const deleteHighlight = useDeleteHighlight()

  const [rawQuery, setRawQuery] = useState('')
  const [selectedBookId, setSelectedBookId] = useState('all')
  const [queryDisplay, setQueryDisplay] = useState('')

  // Simple debounce via useCallback pattern
  const handleQueryChange = useCallback((val) => {
    setQueryDisplay(val)
    const timer = setTimeout(() => setRawQuery(val), 200)
    return () => clearTimeout(timer)
  }, [])

  // Books that have highlights
  const booksWithHighlights = useMemo(() => {
    const bookIds = [...new Set(highlights.map(h => h.book_id).filter(Boolean))]
    return books.filter(b => bookIds.includes(b.id))
  }, [highlights, books])

  const filtered = useMemo(() => {
    let result = highlights
    if (selectedBookId !== 'all') result = result.filter(h => h.book_id === selectedBookId)
    if (rawQuery.trim()) {
      const q = rawQuery.toLowerCase()
      result = result.filter(h =>
        h.text?.toLowerCase().includes(q) ||
        h.note?.toLowerCase().includes(q) ||
        h.books?.title?.toLowerCase().includes(q)
      )
    }
    return result
  }, [highlights, selectedBookId, rawQuery])

  // Group by book
  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(h => {
      const key = h.book_id || '__unmatched__'
      if (!groups[key]) groups[key] = { book: h.books, highlights: [] }
      groups[key].highlights.push(h)
    })
    return Object.values(groups)
  }, [filtered])

  async function handleCopy(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="page-title">Highlights</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={queryDisplay}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search highlights..."
            className="input pl-9 w-full"
            style={{ fontSize: '16px' }}
          />
          {queryDisplay && (
            <button
              onClick={() => { setQueryDisplay(''); setRawQuery('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={selectedBookId}
          onChange={e => setSelectedBookId(e.target.value)}
          className="input sm:w-48"
          style={{ fontSize: '16px' }}
        >
          <option value="all">All books</option>
          {booksWithHighlights.map(b => (
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {filtered.length} {filtered.length === 1 ? 'highlight' : 'highlights'}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 skeleton rounded w-48" />
              <div className="h-20 skeleton rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Quote size={48} />}
          title={highlights.length === 0 ? 'No highlights yet' : 'No matches'}
          description={highlights.length === 0
            ? 'Sync your Kindle highlights to see them here.'
            : 'Try a different search or book filter.'}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group, gi) => (
            <div key={gi}>
              {/* Group header */}
              {group.book && (
                <Link
                  to={`/library/${group.book.id}`}
                  className="flex items-center gap-2.5 mb-3 group"
                >
                  <BookCover book={group.book} size="sm" className="flex-shrink-0 rounded-md overflow-hidden" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900 dark:text-paper-50 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate">
                      {group.book.title}
                    </p>
                    {group.book.author && (
                      <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{group.book.author}</p>
                    )}
                  </div>
                  <span className="ml-auto flex-shrink-0 text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
                    {group.highlights.length}
                  </span>
                </Link>
              )}
              {!group.book && (
                <p className="text-xs font-semibold text-ink-400 dark:text-ink-500 uppercase tracking-wide mb-3">
                  Unmatched highlights
                </p>
              )}

              {/* Highlights in group */}
              <div className="space-y-2 pl-1">
                {group.highlights.map(h => (
                  <div key={h.id} className="rounded-xl border-l-4 border-teal-500 bg-paper-50 dark:bg-ink-800 p-4 relative group/hl">
                    <p className="text-sm text-ink-900 dark:text-paper-50 leading-relaxed italic pr-16">
                      "{h.text}"
                    </p>
                    {h.note && (
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-2 pt-2 border-t border-paper-200 dark:border-ink-700">
                        {h.note}
                      </p>
                    )}
                    {h.location && (
                      <p className="text-xs text-ink-400 mt-1">Loc. {h.location}</p>
                    )}

                    {/* Actions */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/hl:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(h.text)}
                        className="p-1.5 rounded-md text-ink-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                        title="Copy"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteHighlight.mutate(h.id)}
                        className="p-1.5 rounded-md text-ink-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        title="Delete"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                          <path d="M10 11v6M14 11v6"></path>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
