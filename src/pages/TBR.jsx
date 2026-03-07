import { useState, useRef } from 'react'
import { Plus, GripVertical, Shuffle } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLibrary, useReorderTBR, useUpdateBook, useDeleteBook } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { EmptyState } from '../components/ui/index.jsx'
import { QuickActionsSheet } from '../components/ui/QuickActionsSheet'
import { useLongPress } from '../hooks/useLongPress'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

const SWIPE_ACTIVATE = 70   // px — show background tint
const SWIPE_CONFIRM  = 110  // px — trigger confirm banner on release

// ── SortableBook ──────────────────────────────────────────────────────────────
function SortableBook({ book }) {
  const {
    attributes, listeners, setNodeRef: setSortableRef,
    transform, transition, isDragging
  } = useSortable({ id: book.id })

  const updateBook = useUpdateBook()
  const deleteBook = useDeleteBook()

  // Refs for gesture tracking (no re-renders per pixel)
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const startX   = useRef(null)
  const startY   = useRef(null)
  const currentX = useRef(0)
  const axis     = useRef(null)   // 'h' | 'v' | null

  // Minimal React state — only for visible overlays
  const [swipeDir,   setSwipeDir]   = useState(null)   // 'right' | 'left' | null
  const [confirming, setConfirming] = useState(null)   // 'right' | 'left' | null
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

  const longPress = useLongPress(() => setQuickActionsOpen(true))

  function setRef(el) {
    setSortableRef(el)
    outerRef.current = el
  }

  function setInnerX(x, animated = false) {
    if (!innerRef.current) return
    innerRef.current.style.transition = animated ? 'transform 0.25s ease' : ''
    innerRef.current.style.transform  = `translateX(${x}px)`
    if (animated) setTimeout(() => { if (innerRef.current) innerRef.current.style.transition = '' }, 260)
  }

  function onTouchStart(e) {
    if (confirming) return
    if (e.target.closest('[data-drag-handle]')) return
    startX.current   = e.touches[0].clientX
    startY.current   = e.touches[0].clientY
    axis.current     = null
    currentX.current = 0
    longPress.onTouchStart(e)
  }

  function onTouchMove(e) {
    if (confirming || startX.current === null) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current

    if (!axis.current) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6)
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      return
    }

    if (axis.current === 'h') {
      e.preventDefault()
      longPress.onTouchEnd()
      const clamped = Math.max(-140, Math.min(140, dx))
      currentX.current = clamped
      setInnerX(clamped)
      const dir = clamped > SWIPE_ACTIVATE ? 'right' : clamped < -SWIPE_ACTIVATE ? 'left' : null
      setSwipeDir(prev => prev !== dir ? dir : prev)
    } else {
      longPress.onTouchMove(e)
    }
  }

  function onTouchEnd() {
    longPress.onTouchEnd()
    if (axis.current !== 'h') return
    const x = currentX.current
    startX.current   = null
    currentX.current = 0
    axis.current     = null

    if (x > SWIPE_CONFIRM) {
      setInnerX(SWIPE_CONFIRM, true)
      setConfirming('right')
    } else if (x < -SWIPE_CONFIRM) {
      setInnerX(-SWIPE_CONFIRM, true)
      setConfirming('left')
    } else {
      setInnerX(0, true)
      setSwipeDir(null)
    }
  }

  // Right: Start Reading
  async function confirmRight() {
    resetSwipe()
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'reading' } })
    toast.success(`Started reading "${book.title}"`)
  }

  // Left: Delete from library
  async function confirmLeft() {
    resetSwipe()
    await deleteBook.mutateAsync(book.id)
    // toast is fired by useDeleteBook itself ("Book removed from library")
  }

  function cancelAction() { resetSwipe() }

  function resetSwipe() {
    setInnerX(0, true)
    setSwipeDir(null)
    setConfirming(null)
  }

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex:  isDragging ? 50 : 'auto',
  }

  const isRight = swipeDir === 'right' || confirming === 'right'
  const isLeft  = swipeDir === 'left'  || confirming === 'left'

  return (
    <>
      <div ref={setRef} style={sortableStyle} className="relative rounded-xl overflow-hidden touch-pan-y select-none">

        {/* ── Swipe background (fixed; card slides over it) ─────────────────── */}
        <div className={`absolute inset-0 flex items-center px-5 rounded-xl transition-colors duration-150 ${
          isRight ? 'bg-teal-600' : isLeft ? 'bg-rose-600' : 'bg-paper-200 dark:bg-ink-700'
        }`}>
          {isRight && (
            <span className="text-white text-xs font-bold">📖 Start Reading</span>
          )}
          {isLeft && (
            <span className="text-white text-xs font-bold ml-auto">🗑 Remove</span>
          )}
        </div>

        {/* ── Inner card (slides to reveal background) ──────────────────────── */}
        <div
          ref={innerRef}
          className="relative flex items-center gap-3 p-3 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-xl"
          style={{ WebkitTouchCallout: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onContextMenu={longPress.onContextMenu}
        >
          {/* Drag handle */}
          <button
            data-drag-handle
            {...attributes}
            {...listeners}
            onClick={e => e.preventDefault()}
            className="cursor-grab active:cursor-grabbing text-ink-300 dark:text-ink-600 hover:text-ink-500 touch-none flex-shrink-0 p-1"
          >
            <GripVertical size={16} />
          </button>

          {/* Cover + title → book detail */}
          <Link to={`/library/${book.id}`} className="flex items-center gap-3 flex-1 min-w-0 group">
            <BookCover book={book} size="sm" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-ink-900 dark:text-paper-50 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate leading-snug">
                {book.title}
              </p>
              <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Confirm banner (outside overflow:hidden so it renders below card) ── */}
      {confirming && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-b-xl -mt-1 ${
          confirming === 'right' ? 'bg-teal-600' : 'bg-rose-600'
        }`}>
          <span className="text-white text-xs font-semibold">
            {confirming === 'right'
              ? '📖 Start reading this book?'
              : '🗑 Remove from library entirely?'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={cancelAction}
              className="text-white/70 text-xs px-2.5 py-1 rounded-lg border border-white/30 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={confirming === 'right' ? confirmRight : confirmLeft}
              className="text-white text-xs px-2.5 py-1 rounded-lg bg-white/25 hover:bg-white/35 font-semibold"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      <QuickActionsSheet
        book={book}
        open={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
      />
    </>
  )
}

// ── Shuffle modal ─────────────────────────────────────────────────────────────
function ShufflePickModal({ book, onClose }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-ink-800 rounded-2xl shadow-2xl p-6 max-w-xs w-full text-center">
        <p className="text-xs font-semibold text-ink-400 dark:text-ink-500 uppercase tracking-widest mb-3">
          Your Next Read
        </p>
        <div className="flex justify-center mb-4">
          <BookCover book={book} size="lg" />
        </div>
        <p className="font-serif font-semibold text-lg text-ink-900 dark:text-paper-50 leading-snug">{book.title}</p>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-5">{book.author}</p>
        <Link
          to={`/library/${book.id}`}
          className="text-sm text-teal-600 dark:text-teal-400 hover:underline font-medium"
          onClick={onClose}
        >
          View in library →
        </Link>
        <button
          onClick={onClose}
          className="mt-4 block w-full text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 py-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── TBR Page ──────────────────────────────────────────────────────────────────
export function TBR() {
  const { data: books = [], isLoading } = useLibrary()
  const reorderTBR = useReorderTBR()
  const [searchOpen, setSearchOpen]     = useState(false)
  const [formOpen, setFormOpen]         = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [shufflePick, setShufflePick]   = useState(null)

  const tbrBooks = books
    .filter(b => b.status === 'tbr')
    .sort((a, b) => (a.tbr_order || 0) - (b.tbr_order || 0))

  const [localOrder, setLocalOrder] = useState(null)
  const displayBooks = localOrder
    ? localOrder.map(id => tbrBooks.find(b => b.id === id)).filter(Boolean)
    : tbrBooks

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const ids = displayBooks.map(b => b.id)
    const newOrder = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    setLocalOrder(newOrder)
    reorderTBR.mutate(newOrder)
  }

  function handleShuffle() {
    if (displayBooks.length < 2) return
    setShufflePick(displayBooks[Math.floor(Math.random() * displayBooks.length)])
  }

  function handleSearchSelect(book) {
    setSelectedBook({ ...book, status: 'tbr' })
    setFormOpen(true)
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
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
              onClick={handleShuffle}
              className="p-2 rounded-xl border border-paper-200 dark:border-ink-600 text-ink-500 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
              title="Pick a random book"
            >
              <Shuffle size={18} />
            </button>
          )}
          <button onClick={() => setSearchOpen(true)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Add Book</span>
          </button>
        </div>
      </div>

      {/* Swipe hint */}
      {tbrBooks.length > 1 && (
        <p className="text-xs text-ink-400 dark:text-ink-500 text-center">
          Swipe right to start · swipe left to remove · hold for options
        </p>
      )}

      {/* List */}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayBooks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {displayBooks.map(book => <SortableBook key={book.id} book={book} />)}
            </div>
          </SortableContext>
        </DndContext>
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
      {shufflePick && <ShufflePickModal book={shufflePick} onClose={() => setShufflePick(null)} />}
    </div>
  )
}
