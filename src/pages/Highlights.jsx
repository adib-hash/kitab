import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Quote, Search, X, Shuffle, Copy, Trash2, ArrowUpRight, LayoutList, BookOpen, Plus, MoreHorizontal } from 'lucide-react'
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

// Chosen once per app launch, so "All books" opens on a fresh random page every
// time Kitab is opened, but stays put while you move around the app.
const SESSION_SEED = Math.floor(Math.random() * 1e9) + 1

function seededShuffle(list, seed) {
  const out = [...list]
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Passages are set like a printed page, so type steps down with length.
// EB Garamond has a small x-height, hence sizes a notch above the old deck.
const PAGE_FONT = "'EB Garamond', 'Iowan Old Style', Palatino, Georgia, serif"
function pageSize(text = '') {
  const n = text.length
  if (n <= 90) return 'text-[25px] leading-[1.4]'
  if (n <= 180) return 'text-[22px] leading-[1.45]'
  if (n <= 360) return 'text-[19px] leading-[1.5]'
  return 'text-[17px] leading-[1.55]'
}

// Kindle locations arrive as strings ("1234", "Loc. 1,234", "Page 12").
const locNumber = loc => {
  const m = String(loc ?? '').replace(/,/g, '').match(/\d+/)
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER
}

// Quote size steps down as passages get longer, so a one-liner feels like a
// pull quote and a long paragraph still fits the card without clipping.
function quoteSize(text = '') {
  const n = text.length
  if (n <= 90) return 'text-[22px] leading-[1.35]'
  if (n <= 180) return 'text-[19px] leading-[1.45]'
  if (n <= 360) return 'text-[17px] leading-[1.55]'
  return 'text-[15px] leading-[1.6]'
}

// Shelf heading steps down for long titles before it has to truncate.
function headingSize(title = '') {
  const n = title.length
  if (n <= 24) return 'text-lg'
  if (n <= 36) return 'text-base'
  return 'text-sm'
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

  // Reading order: by book, then position in the book.
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
    return [...list].sort((a, b) =>
      (a.books?.title || '').localeCompare(b.books?.title || '') || (locNumber(a.location ?? a.page) - locNumber(b.location ?? b.page))
    )
  }, [highlights, bookId, q])

  // Pages: all books in a random order (new each app launch); a single book in
  // reading order, so paging through it feels like rereading it.
  const pages = useMemo(
    () => (bookId === 'all' ? seededShuffle(ordered, SESSION_SEED) : ordered),
    [ordered, bookId]
  )

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
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 tabular-nums">
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
            {[['cards', BookOpen, 'Page view'], ['list', LayoutList, 'List view']].map(([v, Icon, label]) => (
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
            className={clsx('flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
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
            <p className={clsx('selectable font-serif italic text-ink-900 dark:text-paper-50 text-balance', quoteSize(today.text))}>“{today.text.trim()}”</p>
            {today.books && (
              <Link to={`/library/${today.book_id}`} className="flex items-center gap-3 group w-fit">
                <BookCover book={today.books} size="sm" className="flex-shrink-0 !w-9" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-teal-700 dark:text-teal-400 group-hover:underline">{today.books.title}</span>
                  {today.books.author && <span className="block text-xs text-ink-500 dark:text-ink-400">{today.books.author}</span>}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Book shelf */}
      <section className="space-y-2">
        {/* Fixed-height, single line: a long title steps its size down and then
            truncates, so choosing a book never pushes the shelf and pages down. */}
        <div className="flex items-center justify-between gap-3 h-7">
          <h2
            title={selectedBook?.title}
            className={clsx('font-serif font-semibold text-ink-900 dark:text-paper-50 truncate min-w-0',
              headingSize(selectedBook ? selectedBook.title : 'All books'))}
          >
            {selectedBook ? selectedBook.title : 'All books'}
          </h2>
          {selectedBook && (
            <Link to={`/library/${selectedBook.id}`} className="flex-shrink-0 text-xs text-teal-700 dark:text-teal-400 font-medium flex items-center gap-1 hover:underline">
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
        <BookPages
          items={pages}
          resetKey={bookId}
          onCopy={copyHighlight}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          onDelete={remove}
          showBook={bookId === 'all'}
        />
      ) : (
        <HighlightList
          items={ordered}
          grouped={bookId === 'all'}
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
      className="relative flex-shrink-0 w-[60px] text-left group focus:outline-none">
      <div className={clsx('rounded-md transition-all duration-150',
        active ? 'ring-2 ring-teal-500 ring-offset-2 ring-offset-paper-50 dark:ring-offset-ink-900 -translate-y-0.5' : 'opacity-80 group-hover:opacity-100')}>
        {children}
      </div>
      <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-ink-900 dark:bg-paper-50 text-paper-50 dark:text-ink-900 text-xs font-semibold leading-none flex items-center justify-center tabular-nums shadow">
        {count}
      </span>
    </button>
  )
}

function BookPages({ items, resetKey, onCopy, confirmDelete, setConfirmDelete, onDelete, showBook }) {
  const scroller = useRef(null)
  const [index, setIndex] = useState(0)
  const [menuFor, setMenuFor] = useState(null)
  const [turned, setTurned] = useState(false)

  useEffect(() => {
    setIndex(0)
    setMenuFor(null)
    scroller.current?.scrollTo({ left: 0 })
  }, [resetKey])

  useEffect(() => { if (index > items.length - 1) setIndex(Math.max(0, items.length - 1)) }, [items.length, index])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIndex(prev => (prev === i ? prev : i))
    if (i > 0) setTurned(true)
    setMenuFor(null)
  }, [])

  const go = useCallback((delta) => {
    const el = scroller.current
    if (!el) return
    const next = Math.min(items.length - 1, Math.max(0, index + delta))
    if (next !== index) impactLight()
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }, [index, items.length])

  useEffect(() => {
    function onKey(e) {
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  // Like an e-reader: tap the outer edge of a page to turn it.
  function onPageTap(e) {
    if (e.target.closest('button, a')) return
    if (menuFor) { setMenuFor(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    if (x > 0.75) go(1)
    else if (x < 0.25) go(-1)
  }

  return (
    <section aria-roledescription="carousel" aria-label="Highlights, one per page">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 md:mx-0 overscroll-x-contain pt-1 pb-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((h, i) => {
          const folio = h.location ?? h.page
          const deleting = confirmDelete === h.id
          return (
            <div key={h.id} className="w-full flex-shrink-0 snap-center px-5 md:px-2" aria-roledescription="page" aria-label={`Page ${i + 1} of ${items.length}`}>
              <article onClick={onPageTap} className="book-page relative h-[min(32rem,64vh)] flex flex-col">
                {/* Running head */}
                <header className="relative flex items-center justify-center px-12 pt-4 pb-1">
                  {showBook && h.books ? (
                    <Link to={`/library/${h.book_id}`} className="running-head truncate text-[13px]">{h.books.title}</Link>
                  ) : (
                    <span className="running-head text-[13px]">&nbsp;</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setMenuFor(m => (m === h.id ? null : h.id))}
                    aria-label="Highlight options"
                    aria-expanded={menuFor === h.id}
                    className="absolute right-2 top-2.5 p-2 rounded-full page-muted hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuFor === h.id && (
                    <div role="menu" className="absolute right-3 top-11 z-10 w-44 rounded-xl bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 shadow-xl py-1 text-sm">
                      <button role="menuitem" type="button" onClick={() => { onCopy(h); setMenuFor(null) }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-ink-800 dark:text-paper-100 active:bg-paper-100 dark:active:bg-ink-700"><Copy size={15} /> Copy</button>
                      {h.book_id && <Link role="menuitem" to={`/library/${h.book_id}`} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-ink-800 dark:text-paper-100 active:bg-paper-100 dark:active:bg-ink-700"><ArrowUpRight size={15} /> Open book</Link>}
                      <button role="menuitem" type="button" onClick={() => { setConfirmDelete(h.id); setMenuFor(null) }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-rose-600 dark:text-rose-400 active:bg-paper-100 dark:active:bg-ink-700"><Trash2 size={15} /> Delete</button>
                    </div>
                  )}
                </header>

                {/* The passage */}
                <div className="flex-1 min-h-0 overflow-y-auto px-7 flex">
                  <div className="my-auto w-full py-3">
                    <p className={clsx('page-ink selectable', pageSize(h.text))} style={{ fontFamily: PAGE_FONT, textWrap: 'pretty' }}>{h.text.trim()}</p>
                    {showBook && h.books?.author && (
                      <p className="page-muted mt-5 text-right italic text-[15px]" style={{ fontFamily: PAGE_FONT }}>{h.books.author}</p>
                    )}
                    {h.note && (
                      <p className="mt-5 border-l-2 border-amber-500/70 pl-3 text-sm italic page-muted">{h.note}</p>
                    )}
                  </div>
                </div>

                {/* Folio */}
                <footer className="h-12 flex items-center justify-center px-6">
                  {deleting ? (
                    <span className="flex items-center gap-2 text-sm">
                      <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg page-muted hover:bg-black/5 dark:hover:bg-white/5">Keep</button>
                      <button type="button" onClick={() => onDelete(h)} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium">Delete this highlight</button>
                    </span>
                  ) : (
                    <span className="page-muted text-[15px] tabular-nums" style={{ fontFamily: PAGE_FONT }}>{folio ?? '·'}</span>
                  )}
                </footer>
              </article>
            </div>
          )
        })}
      </div>
      <p className={clsx('text-center text-xs text-ink-400 dark:text-ink-500 transition-opacity duration-300', turned && 'opacity-0')} aria-hidden={turned}>
        Swipe to turn the page
      </p>
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
      {query && <p className="text-xs text-ink-500 dark:text-ink-400 tabular-nums">{items.length} {items.length === 1 ? 'match' : 'matches'}</p>}
      {groups.map(g => (
        <section key={g.key} className="space-y-3">
          {g.book && (
            <Link to={`/library/${g.book.id}`} className="flex items-center gap-3 group sticky top-[calc(env(safe-area-inset-top)+64px)] md:top-0 z-10 bg-paper-50/95 dark:bg-ink-900/95 backdrop-blur py-2 -my-2">
              <BookCover book={g.book} size="sm" className="flex-shrink-0 !w-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-serif font-semibold text-ink-900 dark:text-paper-50 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400">{g.book.title}</span>
                {g.book.author && <span className="block text-xs text-ink-500 dark:text-ink-400 truncate">{g.book.author}</span>}
              </span>
              <span className="text-xs text-ink-500 dark:text-ink-400 tabular-nums">{g.items.length}</span>
            </Link>
          )}
          <ol className="space-y-3">
            {g.items.map(h => (
              <li key={h.id} className="group/hl relative rounded-xl bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 px-5 py-4">
                <p className="selectable font-serif italic text-[15px] leading-relaxed text-ink-900 dark:text-paper-50 pr-8">“{highlightMatch(h.text.trim(), query)}”</p>
                {h.note && <p className="mt-2 text-sm text-ink-600 dark:text-ink-300 border-l-2 border-amber-400 pl-3">{highlightMatch(h.note, query)}</p>}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-500 dark:text-ink-400 truncate">
                    {!grouped && h.books?.title ? `${h.books.title}${h.location ? ` · Loc. ${h.location}` : ''}` : (h.location ? `Location ${h.location}` : '')}
                  </span>
                  {confirmDelete === h.id ? (
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => setConfirmDelete(null)} className="text-xs px-2.5 py-1 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-700">Keep</button>
                      <button onClick={() => onDelete(h)} className="text-xs px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium">Delete</button>
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
