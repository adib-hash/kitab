import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Quote, Search, X, Shuffle, Copy, Trash2, ChevronLeft, ChevronRight, ArrowUpRight, LayoutList, GalleryHorizontal, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useAllHighlights, useDeleteHighlight } from '../hooks/useHighlights'
import { useDebounce } from '../hooks/useDebounce'
import { BookCover } from '../components/books/BookCover'
import { EmptyState } from '../components/ui/index.jsx'
import { pickDailyHighlight } from '../lib/dailyHighlight'
import { impactLight } from '../lib/haptics'
import { JournalFeed, AddToJournal } from '../components/journal/Journal'
import { useAllNotes } from '../hooks/useNotes'

const EMPTY = []

// Kindle locations arrive as strings ("1234", "Loc. 1,234", "Page 12").
const locNumber = loc => {
  const m = String(loc ?? '').replace(/,/g, '').match(/\d+/)
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER
}

// Quote size steps down as passages get longer, so a one-liner feels like a
// pull quote and a long paragraph still fits the card without clipping.
function quoteSize(text = '') {
  const n = text.length
  if (n <= 90) return 'text-[26px] leading-[1.35]'
  if (n <= 180) return 'text-[22px] leading-[1.45]'
  if (n <= 360) return 'text-[19px] leading-[1.55]'
  return 'text-[17px] leading-[1.6]'
}

async function copyHighlight(h) {
  const who = [h.books?.title, h.books?.author].filter(Boolean).join(' · ')
  try {
    await navigator.clipboard.writeText(`“${h.text.trim()}”${who ? `\n— ${who}` : ''}`)
    toast.success('Copied')
  } catch {
    toast.error("Couldn't copy. Long-press the text to select it instead.")
  }
}

export function Highlights() {
  const { data: highlights = EMPTY, isLoading } = useAllHighlights()
  const deleteHighlight = useDeleteHighlight()

  const [section, setSection] = useState('passages') // 'passages' | 'journal'
  const [addOpen, setAddOpen] = useState(false)
  const { data: notes = EMPTY } = useAllNotes()
  const [view, setView] = useState('cards')        // 'cards' | 'list'
  const [bookId, setBookId] = useState('all')
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = useDebounce(query, 200).trim().toLowerCase()
  const [todayOverride, setTodayOverride] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Books that have highlights, most-highlighted first
  const books = useMemo(() => {
    const map = new Map()
    highlights.forEach(h => {
      if (!h.books) return
      const e = map.get(h.book_id) || { ...h.books, count: 0 }
      e.count++
      map.set(h.book_id, e)
    })
    return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
  }, [highlights])

  // Deck order: by book, then position in the book. Shuffle reorders randomly.
  const ordered = useMemo(() => {
    let list = bookId === 'all' ? highlights : highlights.filter(h => h.book_id === bookId)
    if (q) {
      list = list.filter(h =>
        h.text?.toLowerCase().includes(q) ||
        h.note?.toLowerCase().includes(q) ||
        h.books?.title?.toLowerCase().includes(q) ||
        h.books?.author?.toLowerCase().includes(q)
      )
    }
    const sorted = [...list].sort((a, b) =>
      (a.books?.title || '').localeCompare(b.books?.title || '') || locNumber(a.location) - locNumber(b.location)
    )
    if (!shuffleSeed) return sorted
    // Seeded Fisher–Yates so the order is stable until Shuffle is tapped again
    let s = shuffleSeed
    const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]]
    }
    return sorted
  }, [highlights, bookId, q, shuffleSeed])

  const today = todayOverride || pickDailyHighlight(highlights)

  function shuffleToday() {
    if (highlights.length < 2) return
    let next
    do { next = highlights[Math.floor(Math.random() * highlights.length)] } while (next.id === today?.id)
    setTodayOverride(next)
    impactLight()
  }

  function selectBook(id) {
    setBookId(id)
    setShuffleSeed(0)
    impactLight()
  }

  function remove(h) {
    deleteHighlight.mutate(h.id)
    setConfirmDelete(null)
  }

  // Searching is a scanning task, so results always show as a list.
  const effectiveView = q ? 'list' : view
  const selectedBook = bookId === 'all' ? null : books.find(b => b.id === bookId)

  if (isLoading) {
    return (
      <div className="space-y-5 pb-8">
        <h1 className="page-title">Highlights</h1>
        <div className="h-40 skeleton rounded-2xl" />
        <div className="flex gap-3">{[...Array(5)].map((_, i) => <div key={i} className="w-16 book-cover skeleton rounded-md" />)}</div>
        <div className="h-80 skeleton rounded-2xl" />
      </div>
    )
  }

  if (highlights.length === 0) {
    return (
      <div className="space-y-4 pb-8">
        <h1 className="page-title">Highlights</h1>
        <EmptyState icon={<Quote size={48} />} title="No highlights yet"
          description="Sync your Kindle highlights, or save a passage from a paper book."
          action={<button onClick={() => setAddOpen(true)} className="btn-primary"><Plus size={16} /> Add a passage or note</button>} />
        <AddToJournal open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Highlights</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5 tabular-nums">
            {highlights.length} passages{notes.length ? ` · ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : ''} from {books.length} {books.length === 1 ? 'book' : 'books'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setAddOpen(true)} aria-label="Add a note or passage"
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-teal-700 text-white hover:bg-teal-800 transition-colors">
            <Plus size={18} />
          </button>
          <button
            onClick={() => { setSearchOpen(o => !o); if (searchOpen) setQuery('') }}
            aria-label={searchOpen ? 'Close search' : 'Search highlights'}
            aria-pressed={searchOpen}
            className={clsx('h-9 w-9 flex items-center justify-center rounded-lg border transition-colors', section === 'journal' && 'hidden',
              searchOpen ? 'border-teal-500 text-teal-700 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400'
                : 'border-paper-200 dark:border-ink-600 text-ink-500 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800')}
          >
            <Search size={16} />
          </button>
          <div className={clsx('flex items-center border border-paper-200 dark:border-ink-600 rounded-lg overflow-hidden', section === 'journal' && 'hidden')}>
            {[['cards', GalleryHorizontal, 'Card view'], ['list', LayoutList, 'List view']].map(([v, Icon, label]) => (
              <button key={v} onClick={() => setView(v)} aria-label={label} aria-pressed={view === v}
                className={clsx('h-9 w-9 flex items-center justify-center transition-colors',
                  view === v ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                    : 'text-ink-500 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800')}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section switch */}
      <div role="tablist" aria-label="Highlights sections" className="flex rounded-xl bg-paper-100 dark:bg-ink-800 p-1">
        {[['passages', 'Highlights'], ['journal', 'Journal']].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={section === v} onClick={() => { setSection(v); impactLight() }}
            className={clsx('flex-1 py-2 rounded-lg text-base font-medium transition-colors',
              section === v ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-paper-50 shadow-sm' : 'text-ink-500 dark:text-ink-400')}>
            {l}
          </button>
        ))}
      </div>

      {searchOpen && section === 'passages' && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search passages, notes, books…"
            className="input pl-9 pr-9"
            style={{ fontSize: '16px' }}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Today */}
      {section === 'passages' && !q && today && (
        <section className="relative overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-6 pt-5">
          <div aria-hidden="true" className="absolute -top-6 -left-1 font-serif text-[120px] leading-none text-teal-500/10 select-none pointer-events-none">“</div>
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <span className="section-label">{todayOverride ? 'Another one' : 'Today'}</span>
              <div className="flex gap-1">
                <button onClick={shuffleToday} aria-label="Show another highlight" className="p-2 rounded-lg text-ink-400 dark:text-ink-500 hover:text-teal-600 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"><Shuffle size={16} /></button>
                <button onClick={() => copyHighlight(today)} aria-label="Copy highlight" className="p-2 rounded-lg text-ink-400 dark:text-ink-500 hover:text-teal-600 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"><Copy size={16} /></button>
              </div>
            </div>
            <p className={clsx('font-serif italic text-ink-900 dark:text-paper-50 text-balance', quoteSize(today.text))}>“{today.text.trim()}”</p>
            {today.books && (
              <Link to={`/library/${today.book_id}`} className="flex items-center gap-3 group w-fit">
                <BookCover book={today.books} size="sm" className="flex-shrink-0 !w-9" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-teal-700 dark:text-teal-400 group-hover:underline">{today.books.title}</span>
                  {today.books.author && <span className="block text-sm text-ink-500 dark:text-ink-400">{today.books.author}</span>}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Book shelf */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">{selectedBook ? selectedBook.title : 'All books'}</h2>
          {selectedBook && (
            <Link to={`/library/${selectedBook.id}`} className="text-sm text-teal-700 dark:text-teal-400 font-medium flex items-center gap-1 hover:underline">
              Open book <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 pb-1 pt-1">
          <ShelfItem active={bookId === 'all'} onClick={() => selectBook('all')} label="All" count={highlights.length}>
            <div className="w-full book-cover rounded-md bg-teal-700 dark:bg-teal-800 flex items-center justify-center shadow-book">
              <Quote size={22} className="text-white/80" />
            </div>
          </ShelfItem>
          {books.map(b => (
            <ShelfItem key={b.id} active={bookId === b.id} onClick={() => selectBook(b.id)} label={b.title} count={b.count}>
              <BookCover book={b} size="full" className="shadow-book" />
            </ShelfItem>
          ))}
        </div>
      </section>

      {/* Journal, deck or list */}
      {section === 'journal' ? (
        <JournalFeed bookId={bookId} />
      ) : ordered.length === 0 ? (
        <EmptyState icon={<Search size={40} />} title="No matches" description="Try a different word, or clear the book filter." />
      ) : effectiveView === 'cards' ? (
        <Deck
          items={ordered}
          resetKey={`${bookId}|${shuffleSeed}`}
          onShuffle={() => { setShuffleSeed(Math.floor(Math.random() * 1e6) + 1); impactLight() }}
          shuffled={!!shuffleSeed}
          onCopy={copyHighlight}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          onDelete={remove}
          showBook={bookId === 'all'}
        />
      ) : (
        <HighlightList
          items={ordered}
          grouped={bookId === 'all' && !shuffleSeed}
          query={q}
          onCopy={copyHighlight}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          onDelete={remove}
        />
      )}
      <AddToJournal open={addOpen} onClose={() => setAddOpen(false)} defaultBookId={bookId === 'all' ? null : bookId} />
    </div>
  )
}

function ShelfItem({ active, onClick, label, count, children }) {
  return (
    <button onClick={onClick} aria-pressed={active} aria-label={`${label}, ${count} highlights`}
      className="relative flex-shrink-0 w-[68px] text-left group focus:outline-none">
      <div className={clsx('rounded-md transition-all duration-150',
        active ? 'ring-2 ring-teal-500 ring-offset-2 ring-offset-paper-50 dark:ring-offset-ink-900 -translate-y-0.5' : 'opacity-80 group-hover:opacity-100')}>
        {children}
      </div>
      <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1.5 rounded-full bg-ink-900 dark:bg-paper-50 text-paper-50 dark:text-ink-900 text-sm font-semibold leading-none flex items-center justify-center tabular-nums shadow">
        {count}
      </span>
    </button>
  )
}

function Deck({ items, resetKey, onShuffle, shuffled, onCopy, confirmDelete, setConfirmDelete, onDelete, showBook }) {
  const scroller = useRef(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    scroller.current?.scrollTo({ left: 0 })
  }, [resetKey])

  // Keep the index in range when an item is deleted
  useEffect(() => { if (index > items.length - 1) setIndex(Math.max(0, items.length - 1)) }, [items.length, index])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIndex(prev => (prev === i ? prev : i))
  }, [])

  const go = useCallback((delta) => {
    const el = scroller.current
    if (!el) return
    const next = Math.min(items.length - 1, Math.max(0, index + delta))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }, [index, items.length])

  useEffect(() => {
    function onKey(e) {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  return (
    <section className="space-y-3" aria-roledescription="carousel" aria-label="Highlights">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 md:mx-0 overscroll-x-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((h, i) => (
          <div key={h.id} className="w-full flex-shrink-0 snap-center px-4 md:px-0" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            <article className="h-[min(30rem,62vh)] flex flex-col rounded-2xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-card overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-7 pb-4 flex">
                <div className="my-auto w-full space-y-4">
                  <p className={clsx('font-serif italic text-ink-900 dark:text-paper-50', quoteSize(h.text))}>“{h.text.trim()}”</p>
                  {h.note && (
                    <p className="text-base text-ink-600 dark:text-ink-300 border-l-2 border-amber-400 pl-3">
                      <span className="block text-sm font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-500 mb-0.5">Your note</span>
                      {h.note}
                    </p>
                  )}
                </div>
              </div>
              <footer className="flex items-center gap-3 px-4 py-3 border-t border-paper-100 dark:border-ink-700">
                {showBook && h.books ? (
                  <Link to={`/library/${h.book_id}`} className="flex items-center gap-2.5 min-w-0 flex-1 group">
                    <BookCover book={h.books} size="sm" className="flex-shrink-0 !w-8" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400">{h.books.title}</span>
                      <span className="block text-sm text-ink-500 dark:text-ink-400 truncate">{h.location ? `Loc. ${h.location}` : h.page ? `p. ${h.page}` : h.books.author}</span>
                    </span>
                  </Link>
                ) : (
                  <span className="flex-1 text-sm text-ink-500 dark:text-ink-400 tabular-nums">{h.location ? `Location ${h.location}` : h.page ? `Page ${h.page}` : ''}</span>
                )}
                {confirmDelete === h.id ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setConfirmDelete(null)} className="text-sm px-2.5 py-1.5 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-700">Keep</button>
                    <button onClick={() => onDelete(h)} className="text-sm px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-medium">Delete</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => onCopy(h)} aria-label="Copy highlight" className="p-2 rounded-lg text-ink-400 hover:text-teal-600 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"><Copy size={16} /></button>
                    <button onClick={() => setConfirmDelete(h.id)} aria-label="Delete highlight" className="p-2 rounded-lg text-ink-400 hover:text-rose-500 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"><Trash2 size={16} /></button>
                  </div>
                )}
              </footer>
            </article>
          </div>
        ))}
      </div>

      {/* Deck controls */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous highlight"
          className="h-10 w-10 flex items-center justify-center rounded-full border border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 disabled:opacity-30 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
          <span className="text-sm text-ink-500 dark:text-ink-400 tabular-nums" aria-live="polite">{index + 1} of {items.length}</span>
          <div className="h-1 w-full max-w-[12rem] rounded-full bg-paper-200 dark:bg-ink-700 overflow-hidden">
            <div className="h-full bg-teal-600 dark:bg-teal-500 rounded-full transition-[width] duration-200" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
          </div>
        </div>
        <button onClick={() => go(1)} disabled={index >= items.length - 1} aria-label="Next highlight"
          className="h-10 w-10 flex items-center justify-center rounded-full border border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 disabled:opacity-30 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex justify-center">
        <button onClick={onShuffle} className={clsx('inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors',
          shuffled ? 'border-teal-500 text-teal-700 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400' : 'border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-300 hover:bg-paper-50 dark:hover:bg-ink-800')}>
          <Shuffle size={14} /> {shuffled ? 'Shuffle again' : 'Shuffle'}
        </button>
      </div>
    </section>
  )
}

function highlightMatch(text, q) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark className="bg-amber-100 dark:bg-amber-500/25 text-inherit rounded px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

function HighlightList({ items, grouped, query, onCopy, confirmDelete, setConfirmDelete, onDelete }) {
  const groups = useMemo(() => {
    if (!grouped) return [{ key: 'all', book: null, items }]
    const map = new Map()
    items.forEach(h => {
      const key = h.book_id || 'unmatched'
      if (!map.has(key)) map.set(key, { key, book: h.books, items: [] })
      map.get(key).items.push(h)
    })
    return [...map.values()]
  }, [items, grouped])

  return (
    <div className="space-y-8">
      {query && <p className="text-sm text-ink-500 dark:text-ink-400 tabular-nums">{items.length} {items.length === 1 ? 'match' : 'matches'}</p>}
      {groups.map(g => (
        <section key={g.key} className="space-y-3">
          {g.book && (
            <Link to={`/library/${g.book.id}`} className="flex items-center gap-3 group sticky top-[calc(env(safe-area-inset-top)+64px)] md:top-0 z-10 bg-paper-50/95 dark:bg-ink-900/95 backdrop-blur py-2 -my-2">
              <BookCover book={g.book} size="sm" className="flex-shrink-0 !w-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-serif font-semibold text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400">{g.book.title}</span>
                {g.book.author && <span className="block text-sm text-ink-500 dark:text-ink-400 truncate">{g.book.author}</span>}
              </span>
              <span className="text-sm text-ink-500 dark:text-ink-400 tabular-nums">{g.items.length}</span>
            </Link>
          )}
          <ol className="space-y-3">
            {g.items.map(h => (
              <li key={h.id} className="group/hl relative rounded-xl bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 px-5 py-4">
                <p className="font-serif italic text-[17px] leading-relaxed text-ink-900 dark:text-paper-50 pr-8">“{highlightMatch(h.text.trim(), query)}”</p>
                {h.note && <p className="mt-2 text-base text-ink-600 dark:text-ink-300 border-l-2 border-amber-400 pl-3">{highlightMatch(h.note, query)}</p>}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-500 dark:text-ink-400 truncate">
                    {!grouped && h.books?.title ? `${h.books.title}${h.location ? ` · Loc. ${h.location}` : ''}` : (h.location ? `Location ${h.location}` : '')}
                  </span>
                  {confirmDelete === h.id ? (
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => setConfirmDelete(null)} className="text-sm px-2.5 py-1 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-700">Keep</button>
                      <button onClick={() => onDelete(h)} className="text-sm px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium">Delete</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 md:opacity-0 md:group-hover/hl:opacity-100 transition-opacity">
                      <button onClick={() => onCopy(h)} aria-label="Copy highlight" className="p-1.5 rounded-md text-ink-400 hover:text-teal-600"><Copy size={15} /></button>
                      <button onClick={() => setConfirmDelete(h.id)} aria-label="Delete highlight" className="p-1.5 rounded-md text-ink-400 hover:text-rose-500"><Trash2 size={15} /></button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
