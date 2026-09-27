// The Commonplace Book: notes and typed highlights alongside Kindle highlights.
//
// BookJournal   — the timeline on a book page
// JournalFeed   — every book's entries, newest first, on the Highlights tab
// AddToJournal  — pick a book, then write a note or a passage
import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Copy, Trash2, MessageSquarePlus, Pencil, CloudOff, ChevronDown, CheckCircle2, PenLine, BookOpen } from 'lucide-react'
import { useHighlights, useAllHighlights, useAddTypedHighlight, useDeleteHighlight } from '../../hooks/useHighlights'
import { useBookNotes, useAllNotes, useAddNote, useUpdateNote, useDeleteNote } from '../../hooks/useNotes'
import { useLibrary } from '../../hooks/useLibrary'
import { newId } from '../../lib/outbox'
import { formatDateShort } from '../../lib/utils'
import { BookCover } from '../books/BookCover'
import { Modal } from '../ui/index.jsx'

const EMPTY = []

// ── helpers ─────────────────────────────────────────────────────────────────
const bookRef = b => (b ? { id: b.id, title: b.title, author: b.author, cover_url: b.cover_url } : null)
const whenOf = h => h.highlighted_at || h.synced_at || h.created_at
const day = ts => (ts ? format(new Date(ts), 'yyyy-MM-dd') : '')
const fmtDay = ts => (ts ? format(new Date(ts), 'd MMM yyyy') : '')
const locNum = h => (h.location ?? h.page ?? Number.MAX_SAFE_INTEGER)
const where = h => (h.location ? `Loc. ${h.location}` : h.page ? `p. ${h.page}` : '')

async function copyText(text, who) {
  try {
    await navigator.clipboard.writeText(`“${text.trim()}”${who ? `\n— ${who}` : ''}`)
    toast.success('Copied', { id: 'copied' })
  } catch {
    toast.error("Couldn't copy. Long-press the text to select it instead.")
  }
}

function autosize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 320)}px`
}

// ── Composer ────────────────────────────────────────────────────────────────
export function Composer({ book, highlightId = null, allowPassage = true, autoFocus = false, onDone, compact = false }) {
  const [mode, setMode] = useState('note') // 'note' | 'passage'
  const [text, setText] = useState('')
  const [page, setPage] = useState('')
  const ref = useRef(null)
  const addNote = useAddNote()
  const addHighlight = useAddTypedHighlight()
  const busy = addNote.isPending || addHighlight.isPending

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  function submit(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || !book) return
    const pageNum = parseInt(page, 10) > 0 ? parseInt(page, 10) : null
    const now = new Date().toISOString()
    if (mode === 'passage' && !highlightId) {
      addHighlight.mutate({
        book: bookRef(book),
        row: {
          id: newId(), book_id: book.id, text: body, page: pageNum, source: 'manual',
          book_title: book.title, book_author: book.author || null, highlighted_at: now, synced_at: now,
        },
      })
    } else {
      addNote.mutate({
        book: bookRef(book),
        row: { id: newId(), book_id: book.id, highlight_id: highlightId, body, page: pageNum, created_at: now },
      })
    }
    setText(''); setPage('')
    if (ref.current) ref.current.style.height = ''
    onDone?.()
  }

  const placeholder = highlightId
    ? 'What does this bring to mind?'
    : mode === 'passage' ? 'Paste or type the passage. On iPhone, Live Text copies it straight off the page.' : 'A thought, a question, something to remember…'

  return (
    <form onSubmit={submit} className={clsx('space-y-2.5', !compact && 'rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-3')}>
      {allowPassage && !highlightId && (
        <div role="tablist" className="inline-flex rounded-lg bg-paper-100 dark:bg-ink-900 p-0.5">
          {[['note', 'Note'], ['passage', 'Passage']].map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={mode === v} onClick={() => setMode(v)}
              className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                mode === v ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-paper-50 shadow-sm' : 'text-ink-500 dark:text-ink-400')}>
              {l}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={text}
        onChange={e => { setText(e.target.value); autosize(e.target) }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e) }}
        rows={compact ? 2 : 3}
        maxLength={5000}
        placeholder={placeholder}
        aria-label={mode === 'passage' ? 'Passage' : 'Note'}
        className={clsx('w-full resize-none rounded-lg px-3 py-2 bg-paper-50 dark:bg-ink-900 border border-paper-200 dark:border-ink-600 text-ink-900 dark:text-paper-50 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-teal-500',
          mode === 'passage' && 'font-serif italic')}
        style={{ fontSize: '16px' }}
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
          Page
          <input
            value={page}
            onChange={e => setPage(e.target.value.replace(/\D/g, '').slice(0, 5))}
            inputMode="numeric"
            placeholder="—"
            aria-label="Page (optional)"
            className="w-16 rounded-lg px-2 py-1 bg-paper-50 dark:bg-ink-900 border border-paper-200 dark:border-ink-600 text-ink-900 dark:text-paper-50 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
            style={{ fontSize: '16px' }}
          />
        </label>
        <span className="flex-1" />
        {onDone && highlightId && (
          <button type="button" onClick={onDone} className="text-xs px-3 py-1.5 rounded-lg text-ink-500 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700">Cancel</button>
        )}
        <button type="submit" disabled={!text.trim() || busy} className="btn-primary !py-1.5 disabled:opacity-40">
          {mode === 'passage' && !highlightId ? 'Save passage' : 'Save note'}
        </button>
      </div>
    </form>
  )
}

// ── Entries ─────────────────────────────────────────────────────────────────
function PendingMark({ item }) {
  if (!item._pending) return null
  return <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><CloudOff size={13} /> Waiting to sync</span>
}

function ConfirmDelete({ onKeep, onDelete, label = 'Delete' }) {
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" onClick={onKeep} className="text-xs px-2.5 py-1 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-700">Keep</button>
      <button type="button" onClick={onDelete} className="text-xs px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium">{label}</button>
    </span>
  )
}

const iconBtn = 'p-1.5 rounded-md text-ink-400 dark:text-ink-500 hover:text-teal-600 hover:bg-paper-100 dark:hover:bg-ink-700 transition-colors'

export function NoteEntry({ note, bookId, quote }) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [body, setBody] = useState(note.body)
  const update = useUpdateNote()
  const del = useDeleteNote()

  function save() {
    const b = body.trim()
    if (!b) return
    update.mutate({ id: note.id, bookId: bookId || note.book_id, body: b, page: note.page })
    setEditing(false)
  }

  return (
    <div className="rounded-xl border-l-[3px] border-amber-400 bg-amber-50/60 dark:bg-amber-500/[0.07] px-4 py-3 space-y-2">
      {quote && <p className="text-xs font-serif italic text-ink-500 dark:text-ink-400 line-clamp-2">“{quote}”</p>}
      {editing ? (
        <div className="space-y-2">
          <textarea value={body} onChange={e => { setBody(e.target.value); autosize(e.target) }} ref={autosize} autoFocus
            className="w-full resize-none rounded-lg px-3 py-2 bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-600 text-ink-900 dark:text-paper-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
            style={{ fontSize: '16px' }} aria-label="Edit note" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setBody(note.body) }} className="text-xs px-3 py-1.5 rounded-lg text-ink-500 hover:bg-paper-100 dark:hover:bg-ink-700">Cancel</button>
            <button type="button" onClick={save} className="btn-primary !py-1.5">Save</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-800 dark:text-paper-100 whitespace-pre-wrap leading-relaxed">{note.body}</p>
      )}
      {!editing && (
        <div className="flex items-center gap-3 justify-between">
          <span className="flex items-center gap-3 text-xs text-ink-500 dark:text-ink-400 tabular-nums">
            <span>{fmtDay(note.created_at)}{note.page ? ` · p. ${note.page}` : ''}</span>
            <PendingMark item={note} />
          </span>
          {confirm ? (
            <ConfirmDelete onKeep={() => setConfirm(false)} onDelete={() => del.mutate({ id: note.id, bookId: bookId || note.book_id })} />
          ) : !note._pending && (
            <span className="flex items-center gap-0.5">
              <button type="button" onClick={() => setEditing(true)} aria-label="Edit note" className={iconBtn}><Pencil size={15} /></button>
              <button type="button" onClick={() => setConfirm(true)} aria-label="Delete note" className={clsx(iconBtn, 'hover:!text-rose-500')}><Trash2 size={15} /></button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function HighlightEntry({ h, book, notes = EMPTY, showDate = true }) {
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const del = useDeleteHighlight()
  const who = [book?.title, book?.author].filter(Boolean).join(' · ')

  return (
    <div className="space-y-2">
      <div className="group/hl rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 border-l-[3px] border-l-teal-500 px-4 py-3 space-y-2">
        <p className="font-serif italic text-[15px] leading-relaxed text-ink-900 dark:text-paper-50">“{h.text.trim()}”</p>
        {h.note && (
          <p className="text-sm text-ink-600 dark:text-ink-300"><span className="text-xs font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-500 mr-1.5">Kindle note</span>{h.note}</p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-3 text-xs text-ink-500 dark:text-ink-400 tabular-nums">
            <span>{h.source === 'manual' ? 'Typed' : 'Kindle'}{where(h) ? ` · ${where(h)}` : ''}{showDate ? ` · ${fmtDay(whenOf(h))}` : ''}</span>
            <PendingMark item={h} />
          </span>
          {confirm ? (
            <ConfirmDelete onKeep={() => setConfirm(false)} onDelete={() => { del.mutate(h.id); setConfirm(false) }} />
          ) : !h._pending && (
            <span className="flex items-center gap-0.5">
              <button type="button" onClick={() => setAdding(a => !a)} aria-label="Add a note to this highlight" aria-expanded={adding} className={iconBtn}><MessageSquarePlus size={15} /></button>
              <button type="button" onClick={() => copyText(h.text, who)} aria-label="Copy highlight" className={iconBtn}><Copy size={15} /></button>
              <button type="button" onClick={() => setConfirm(true)} aria-label="Delete highlight" className={clsx(iconBtn, 'hover:!text-rose-500')}><Trash2 size={15} /></button>
            </span>
          )}
        </div>
      </div>
      {(notes.length > 0 || adding) && (
        <div className="ml-4 pl-3 border-l border-paper-200 dark:border-ink-700 space-y-2">
          {notes.map(n => <NoteEntry key={n.id} note={n} bookId={h.book_id} />)}
          {adding && <Composer book={book} highlightId={h.id} compact autoFocus onDone={() => setAdding(false)} />}
        </div>
      )}
    </div>
  )
}

/** A Kindle sync's worth of highlights for one book, collapsed after three. */
function KindleCluster({ items, book, notesByHighlight, header }) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, 3)
  return (
    <div className="space-y-2.5">
      {header}
      {shown.map(h => <HighlightEntry key={h.id} h={h} book={book} notes={notesByHighlight.get(h.id)} showDate={false} />)}
      {items.length > 3 && (
        <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-medium text-teal-700 dark:text-teal-400 flex items-center gap-1">
          <ChevronDown size={15} className={clsx('transition-transform', open && 'rotate-180')} />
          {open ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

// ── Timeline builder ────────────────────────────────────────────────────────
/**
 * Merge highlights and notes into dated entries, newest first. Kindle
 * highlights arrive in bulk, so each sync day per book becomes one cluster
 * ordered by location. Notes attached to a highlight sit under it.
 */
function buildEntries(highlights, notes, bookOf) {
  const notesByHighlight = new Map()
  const loose = []
  for (const n of notes) {
    if (n.highlight_id) {
      if (!notesByHighlight.has(n.highlight_id)) notesByHighlight.set(n.highlight_id, [])
      notesByHighlight.get(n.highlight_id).push(n)
    } else loose.push(n)
  }
  for (const list of notesByHighlight.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at))

  const entries = loose.map(n => ({ kind: 'note', key: `n:${n.id}`, when: n.created_at, bookId: n.book_id, item: n }))
  const clusters = new Map()
  for (const h of highlights) {
    if (h.source === 'manual') {
      entries.push({ kind: 'highlight', key: `h:${h.id}`, when: whenOf(h), bookId: h.book_id, item: h })
    } else {
      const k = `${h.book_id}|${day(whenOf(h))}`
      if (!clusters.has(k)) clusters.set(k, { kind: 'cluster', key: `c:${k}`, when: whenOf(h), bookId: h.book_id, items: [] })
      const c = clusters.get(k)
      c.items.push(h)
      if (whenOf(h) > c.when) c.when = whenOf(h)
    }
  }
  for (const c of clusters.values()) {
    c.items.sort((a, b) => locNum(a) - locNum(b))
    entries.push(c)
  }
  // Notes on a highlight that isn't in view (another book filter, deleted) still show, with their quote.
  const shownIds = new Set(highlights.map(h => h.id))
  for (const [hid, list] of notesByHighlight) {
    if (!shownIds.has(hid)) list.forEach(n => entries.push({ kind: 'note', key: `n:${n.id}`, when: n.created_at, bookId: n.book_id, item: n }))
  }
  entries.sort((a, b) => String(b.when).localeCompare(String(a.when)))
  return { entries, notesByHighlight, bookOf }
}

// ── Book page ───────────────────────────────────────────────────────────────
export function BookJournal({ book, focus = false }) {
  const { data: highlights = EMPTY, isLoading: hlLoading } = useHighlights(book.id)
  const { data: notes = EMPTY, isLoading: notesLoading } = useBookNotes(book.id)
  const sectionRef = useRef(null)

  useEffect(() => {
    if (focus) setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [focus])

  const { entries, notesByHighlight } = useMemo(() => buildEntries(highlights, notes), [highlights, notes])
  const finished = book.status === 'read' && book.date_finished
  const count = highlights.length + notes.length

  return (
    <section ref={sectionRef} className="space-y-4 scroll-mt-20" aria-labelledby="journal-h">
      <div className="flex items-baseline justify-between">
        <h2 id="journal-h" className="font-serif text-xl font-semibold text-ink-900 dark:text-paper-50">Journal</h2>
        {count > 0 && <span className="text-xs text-ink-500 dark:text-ink-400 tabular-nums">{highlights.length} {highlights.length === 1 ? 'highlight' : 'highlights'} · {notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>}
      </div>

      <Composer book={book} />

      {(hlLoading || notesLoading) ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}</div>
      ) : entries.length === 0 && !book.review ? (
        <p className="text-sm text-ink-500 dark:text-ink-400 py-2">Nothing here yet. Notes and passages you save, and Kindle highlights once synced, collect here.</p>
      ) : (
        <ol className="space-y-5">
          {entries.map(e => (
            <li key={e.key}>
              {e.kind === 'note' && <NoteEntry note={e.item} bookId={book.id} quote={e.item.highlight_id ? highlights.find(h => h.id === e.item.highlight_id)?.text : null} />}
              {e.kind === 'highlight' && <HighlightEntry h={e.item} book={book} notes={notesByHighlight.get(e.item.id)} />}
              {e.kind === 'cluster' && (
                <KindleCluster items={e.items} book={book} notesByHighlight={notesByHighlight}
                  header={<p className="text-xs text-ink-500 dark:text-ink-400">{e.items.length} Kindle {e.items.length === 1 ? 'highlight' : 'highlights'} · synced {fmtDay(e.when)}</p>} />
              )}
            </li>
          ))}
          {book.review && (
            <li className="rounded-xl bg-paper-100 dark:bg-ink-800/60 px-4 py-3 flex items-start gap-3">
              <PenLine size={16} className="text-ink-400 mt-1 flex-shrink-0" />
              <p className="text-sm text-ink-700 dark:text-ink-300 line-clamp-3"><span className="font-semibold text-ink-900 dark:text-paper-50">Your review · </span>{book.review}</p>
            </li>
          )}
          {finished && (
            <li className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
              <CheckCircle2 size={16} className="text-emerald-500" /> Finished {formatDateShort(book.date_finished)}
            </li>
          )}
        </ol>
      )}
    </section>
  )
}

// ── Cross-book feed ─────────────────────────────────────────────────────────
export function JournalFeed({ bookId = 'all' }) {
  const { data: highlights = EMPTY, isLoading: a } = useAllHighlights()
  const { data: notes = EMPTY, isLoading: b } = useAllNotes()

  const books = useMemo(() => {
    const m = new Map()
    highlights.forEach(h => h.books && m.set(h.book_id, h.books))
    notes.forEach(n => n.books && m.set(n.book_id, n.books))
    return m
  }, [highlights, notes])
  const hlById = useMemo(() => new Map(highlights.map(h => [h.id, h])), [highlights])

  const months = useMemo(() => {
    const hs = bookId === 'all' ? highlights : highlights.filter(h => h.book_id === bookId)
    const ns = bookId === 'all' ? notes : notes.filter(n => n.book_id === bookId)
    const { entries, notesByHighlight } = buildEntries(hs, ns)
    const groups = []
    for (const e of entries) {
      const label = format(new Date(e.when), 'MMMM yyyy')
      if (groups[groups.length - 1]?.label !== label) groups.push({ label, entries: [] })
      groups[groups.length - 1].entries.push(e)
    }
    return { groups, notesByHighlight }
  }, [highlights, notes, bookId])

  if (a || b) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}</div>
  if (!months.groups.length) {
    return <p className="text-sm text-ink-500 dark:text-ink-400 py-6 text-center">No journal entries yet. Tap the plus button to write a note or save a passage.</p>
  }

  const BookLine = ({ id, suffix }) => {
    const bk = books.get(id)
    if (!bk) return null
    return (
      <Link to={`/library/${id}`} className="flex items-center gap-2.5 group w-fit max-w-full">
        <BookCover book={bk} size="sm" className="flex-shrink-0 !w-7" />
        <span className="min-w-0 text-xs">
          <span className="font-semibold text-ink-900 dark:text-paper-50 group-hover:text-teal-700 dark:group-hover:text-teal-400">{bk.title}</span>
          {suffix && <span className="text-ink-500 dark:text-ink-400"> · {suffix}</span>}
        </span>
      </Link>
    )
  }

  return (
    <div className="space-y-8">
      {months.groups.map(g => (
        <section key={g.label} className="space-y-4">
          <h3 className="section-label">{g.label}</h3>
          <ol className="space-y-6">
            {g.entries.map(e => (
              <li key={e.key} className="space-y-2">
                {e.kind === 'note' && (<>
                  <BookLine id={e.bookId} suffix={e.item.highlight_id ? 'note on a highlight' : 'note'} />
                  <NoteEntry note={e.item} quote={e.item.highlight_id ? hlById.get(e.item.highlight_id)?.text : null} />
                </>)}
                {e.kind === 'highlight' && (<>
                  <BookLine id={e.bookId} suffix="passage" />
                  <HighlightEntry h={e.item} book={books.get(e.bookId)} notes={months.notesByHighlight.get(e.item.id)} />
                </>)}
                {e.kind === 'cluster' && (
                  <KindleCluster items={e.items} book={books.get(e.bookId)} notesByHighlight={months.notesByHighlight}
                    header={<BookLine id={e.bookId} suffix={`${e.items.length} from Kindle · ${fmtDay(e.when)}`} />} />
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

// ── Add from anywhere ───────────────────────────────────────────────────────
export function AddToJournal({ open, onClose, defaultBookId = null }) {
  const { data: library = EMPTY } = useLibrary()
  const options = useMemo(() => {
    const rank = { reading: 0, read: 1, dnf: 2, tbr: 3 }
    return [...library].sort((a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.date_finished || '').localeCompare(a.date_finished || '') || a.title.localeCompare(b.title))
  }, [library])
  const [bookId, setBookId] = useState(defaultBookId || '')
  useEffect(() => {
    if (!open) return
    setBookId(defaultBookId || options.find(b => b.status === 'reading')?.id || options[0]?.id || '')
  }, [open, defaultBookId, options])
  const book = options.find(b => b.id === bookId)

  return (
    <Modal open={open} onClose={onClose} title="Add to your journal" size="md">
      <div className="p-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="section-label">Book</span>
          <select value={bookId} onChange={e => setBookId(e.target.value)} className="input" style={{ fontSize: '16px' }}>
            {options.map(b => <option key={b.id} value={b.id}>{b.title}{b.author ? ` · ${b.author}` : ''}</option>)}
          </select>
        </label>
        {book ? <Composer key={book.id} book={book} onDone={onClose} /> : (
          <p className="text-sm text-ink-500 dark:text-ink-400 flex items-center gap-2"><BookOpen size={16} /> Add a book to your library first.</p>
        )}
      </div>
    </Modal>
  )
}
