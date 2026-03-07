import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, GripVertical, Shuffle } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLibrary, useReorderTBR, useUpdateBook } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { QuickActionsSheet } from '../components/ui/QuickActionsSheet'
import { EmptyState } from '../components/ui/index.jsx'
import { Link } from 'react-router-dom'
import { useLongPress } from '../hooks/useLongPress'
import toast from 'react-hot-toast'

const SWIPE_THRESHOLD = 65
const SWIPE_CLAMP = 110
const LONG_PRESS_MOVE_PX = 8

// ── Sortable book row with swipe + long press ─────────────────────────────
function SortableBook({ book }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.id })
  const updateBook = useUpdateBook()

  // Swipe state
  const [swipeX, setSwipeX]     = useState(0)
  const [confirm, setConfirm]   = useState(null) // 'reading' | 'delete' | null
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const swipeAxis   = useRef(null) // 'h' | 'v' | null

  // Long press state
  const [qaOpen, setQaOpen] = useState(false)
  const [qfOpen, setQfOpen] = useState(false)
  const [qfTab, setQfTab]   = useState('details')

  // Long press hook — cancelled automatically if finger moves > 8px
  const longPress = useLongPress(() => setQaOpen(true))

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  // ── Swipe handlers ────────────────────────────────────────────────────
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    swipeAxis.current = null
  }

  function handleTouchMove(e) {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    const adx = Math.abs(dx), ady = Math.abs(dy)

    if (!swipeAxis.current && (adx > LONG_PRESS_MOVE_PX || ady > LONG_PRESS_MOVE_PX)) {
      swipeAxis.current = adx > ady ? 'h' : 'v'
    }
    if (swipeAxis.current === 'h') {
      e.preventDefault()
      const clamped = Math.max(-SWIPE_CLAMP, Math.min(SWIPE_CLAMP, dx))
      setSwipeX(clamped)
    }
  }

  function handleTouchEnd() {
    if (swipeAxis.current === 'h') {
      if (swipeX > SWIPE_THRESHOLD) setConfirm('reading')
      else if (swipeX < -SWIPE_THRESHOLD) setConfirm('delete')
      else setSwipeX(0)
    }
    touchStartX.current = null
    touchStartY.current = null
    swipeAxis.current = null
    setSwipeX(0)
  }

  async function confirmReading() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'reading' } })
    toast.success(`Started reading "${book.title}"`)
    setConfirm(null)
  }

  async function confirmDelete() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'read', date_finished: new Date().toISOString().slice(0, 10) } })
    toast.success(`Marked "${book.title}" as read`)
    setConfirm(null)
  }

  function cancelConfirm() { setConfirm(null) }

  const tintColor =
    swipeX > 12  ? `rgba(20,184,166,${Math.min(0.18, (swipeX - 12) / 120)})` :
    swipeX < -12 ? `rgba(239,68,68,${Math.min(0.18, (-swipeX - 12) / 120)})` : undefined

  // ── Confirm overlays ──────────────────────────────────────────────────
  if (confirm === 'reading') {
    return (
      <div className="flex items-center gap-3 p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl border border-teal-200 dark:border-teal-700">
        <BookCover book={book} size="sm" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
          <p className="text-xs text-teal-700 dark:text-teal-400 mt-0.5">Start reading this?</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={confirmReading} className="px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">Yes</button>
          <button onClick={cancelConfirm} className="px-3 py-1.5 bg-paper-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 text-xs font-semibold rounded-lg transition-colors">No</button>
        </div>
      </div>
    )
  }

  if (confirm === 'delete') {
    return (
      <div className="flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-900/30 rounded-xl border border-rose-200 dark:border-rose-700">
        <BookCover book={book} size="sm" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">Mark as read?</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={confirmDelete} className="px-3 py-1.5 bg-rose-500 text-white text-xs font-semibold rounded-lg hover:bg-rose-600 transition-colors">Done ✓</button>
          <button onClick={cancelConfirm} className="px-3 py-1.5 bg-paper-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 text-xs font-semibold rounded-lg transition-colors">No</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div ref={setNodeRef} style={dndStyle}>
        <div
          className="flex items-center gap-3 p-3 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700 select-none"
          style={{ backgroundColor: tintColor, WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'pan-y' }}
          onTouchStart={e => { longPress.onTouchStart(e); handleTouchStart(e) }}
          onTouchMove={e => { longPress.onTouchMove(e); handleTouchMove(e) }}
          onTouchEnd={e => { longPress.onTouchEnd(e); handleTouchEnd(e) }}
          onContextMenu={longPress.onContextMenu}
        >
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            onClick={e => e.preventDefault()}
            className="cursor-grab active:cursor-grabbing text-ink-300 dark:text-ink-600 hover:text-ink-500 dark:hover:text-ink-400 touch-none flex-shrink-0 p-1"
          >
            <GripVertical size={16} />
          </button>

          {/* Cover + title */}
          <Link
            to={`/library/${book.id}`}
            className="flex items-center gap-3 flex-1 min-w-0 group"
            onClick={e => { if (qaOpen) e.preventDefault() }}
          >
            <BookCover book={book} size="sm" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-ink-900 dark:text-paper-50 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate leading-snug">
                {book.title}
              </p>
              <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
            </div>
          </Link>

          {/* Swipe hint labels */}
          {swipeX > 20 && (
            <span className="absolute left-14 text-xs font-semibold text-teal-600 dark:text-teal-400 pointer-events-none">Reading →</span>
          )}
          {swipeX < -20 && (
            <span className="absolute right-4 text-xs font-semibold text-rose-500 pointer-events-none">← Done</span>
          )}
        </div>
      </div>

      <QuickActionsSheet
        book={book}
        open={qaOpen}
        onClose={() => setQaOpen(false)}
        onOpenForm={(tab) => { setQfTab(tab); setQfOpen(true) }}
      />
      <BookForm
        open={qfOpen}
        onClose={() => setQfOpen(false)}
        initialBook={book}
        editingId={book.id}
        editingTags={book.tags}
        defaultTab={qfTab}
      />
    </>
  )
}

// ── Shuffle pick modal ────────────────────────────────────────────────────────
function ShufflePickModal({ books, open, onClose }) {
  const [pick, setPick] = useState(() => books[Math.floor(Math.random() * books.length)])

  function pickAgain() {
    let next
    do { next = books[Math.floor(Math.random() * books.length)] } while (books.length > 1 && next?.id === pick?.id)
    setPick(next)
  }

  if (!pick) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white dark:bg-ink-800 rounded-2xl shadow-2xl p-6 max-w-sm mx-auto"
          >
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-4 text-center">Your Next Read</h2>
            <div className="flex flex-col items-center gap-4">
              {pick.cover_url && (
                <img src={pick.cover_url} alt={pick.title} className="w-24 rounded-lg shadow-book" />
              )}
              <div className="text-center">
                <p className="font-serif font-semibold text-ink-900 dark:text-paper-50">{pick.title}</p>
                <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">{pick.author}</p>
              </div>
              <Link
                to={`/library/${pick.id}`}
                onClick={onClose}
                className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                View in library →
              </Link>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={pickAgain}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-paper-200 dark:border-ink-600 text-sm font-medium text-ink-700 dark:text-ink-300 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"
              >
                <Shuffle size={14} /> Pick Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Main TBR page ─────────────────────────────────────────────────────────────
export function TBR() {
  const { data: books = [], isLoading } = useLibrary()
  const reorderTBR = useReorderTBR()
  const [searchOpen, setSearchOpen]   = useState(false)
  const [formOpen, setFormOpen]       = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [shuffleOpen, setShuffleOpen] = useState(false)
  const [localOrder, setLocalOrder]   = useState(null)

  const tbrBooks = books
    .filter(b => b.status === 'tbr')
    .sort((a, b) => (a.tbr_order || 0) - (b.tbr_order || 0))

  const displayBooks = localOrder
    ? localOrder.map(id => tbrBooks.find(b => b.id === id)).filter(Boolean)
    : tbrBooks

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = displayBooks.map(b => b.id)
    const newOrder = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    setLocalOrder(newOrder)
    reorderTBR.mutate(newOrder)
  }

  function handleSearchSelect(book) {
    setSelectedBook({ ...book, status: 'tbr' })
    setFormOpen(true)
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">To Be Read</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            {isLoading ? '...' : `${tbrBooks.length} ${tbrBooks.length === 1 ? 'book' : 'books'} on your shelf`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tbrBooks.length >= 2 && (
            <button
              onClick={() => setShuffleOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-paper-200 dark:border-ink-600 text-sm text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"
            >
              <Shuffle size={14} /> Shuffle
            </button>
          )}
          <button onClick={() => setSearchOpen(true)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Add Book</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
        </div>
      ) : tbrBooks.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Your reading list is empty"
          description="Add books you want to read — then drag to prioritize."
          action={
            <button onClick={() => setSearchOpen(true)} className="btn-primary">
              <Plus size={16} /> Add Your First Book
            </button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-ink-400 dark:text-ink-500 text-center">
            Swipe right to start reading · swipe left to mark done · hold to quick edit
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayBooks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {displayBooks.map(book => <SortableBook key={book.id} book={book} />)}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <BookSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
        onManual={() => { setSelectedBook(null); setFormOpen(true) }}
      />
      <BookForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedBook(null) }}
        initialBook={selectedBook}
      />
      {shuffleOpen && (
        <ShufflePickModal
          books={tbrBooks}
          open={shuffleOpen}
          onClose={() => setShuffleOpen(false)}
        />
      )}
    </div>
  )
}
