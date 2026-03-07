import { useState, useRef, useCallback } from 'react'
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
import { useLibrary, useReorderTBR, useUpdateBook } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { EmptyState } from '../components/ui/index.jsx'
import { QuickActionsSheet } from '../components/ui/QuickActionsSheet'
import { useLongPress } from '../hooks/useLongPress'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

// ── Swipe thresholds ──────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 80   // px to trigger confirm overlay
const SWIPE_MAX = 120        // max visual travel

// ── SortableBook ──────────────────────────────────────────────────────────────
function SortableBook({ book }) {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: book.id })
  const updateBook = useUpdateBook()

  // Refs for imperative swipe animation (avoids re-render on every touchmove px)
  const rowRef = useRef(null)
  const swipeStartX = useRef(null)
  const swipeCurrentX = useRef(0)
  const axisLocked = useRef(null)    // 'h' | 'v' | null
  const startY = useRef(null)

  const [swipeDir, setSwipeDir] = useState(null)   // 'right' | 'left' | null (for overlay only)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

  const longPress = useLongPress(() => setQuickActionsOpen(true))

  // ── Combine sortable ref + row ref ────────────────────────────────────────
  function setRef(el) {
    setSortableRef(el)
    rowRef.current = el
  }

  // ── Touch handlers ────────────────────────────────────────────────────────
  function onTouchStart(e) {
    // Don't interfere with drag handle
    if (e.target.closest('[data-drag-handle]')) return
    swipeStartX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    axisLocked.current = null
    swipeCurrentX.current = 0
    longPress.onTouchStart(e)
  }

  function onTouchMove(e) {
    if (swipeStartX.current === null) return
    const dx = e.touches[0].clientX - swipeStartX.current
    const dy = e.touches[0].clientY - startY.current

    // Lock axis on first significant movement
    if (!axisLocked.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisLocked.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
    }

    if (axisLocked.current === 'h') {
      e.preventDefault()
      longPress.onTouchEnd()   // cancel long press if swiping
      const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx))
      swipeCurrentX.current = clamped
      // Write directly to DOM — no React state, no re-render
      if (rowRef.current) {
        rowRef.current.style.transform = `translateX(${clamped}px)`
      }
      // Only update state at threshold boundary (for overlay colors)
      const newDir = dx > SWIPE_THRESHOLD ? 'right' : dx < -SWIPE_THRESHOLD ? 'left' : null
      setSwipeDir(prev => prev !== newDir ? newDir : prev)
    } else if (axisLocked.current === 'v') {
      longPress.onTouchMove(e)
    }
  }

  async function onTouchEnd(e) {
    longPress.onTouchEnd()
    if (axisLocked.current !== 'h') return

    const x = swipeCurrentX.current
    // Snap back smoothly
    if (rowRef.current) {
      rowRef.current.style.transition = 'transform 0.25s ease'
      rowRef.current.style.transform = 'translateX(0)'
      // Clear transition after animation completes
      setTimeout(() => {
        if (rowRef.current) rowRef.current.style.transition = ''
      }, 260)
    }

    setSwipeDir(null)
    swipeStartX.current = null
    swipeCurrentX.current = 0
    axisLocked.current = null

    if (x > SWIPE_THRESHOLD) {
      await updateBook.mutateAsync({ id: book.id, updates: { status: 'reading' } })
      toast.success(`Started reading "${book.title}"`)
    } else if (x < -SWIPE_THRESHOLD) {
      await updateBook.mutateAsync({
        id: book.id,
        updates: { status: 'read', date_finished: new Date().toISOString().slice(0, 10) }
      })
      toast.success(`Marked "${book.title}" as read`)
    }
  }

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <>
      <div
        ref={setRef}
        style={sortableStyle}
        className="relative rounded-xl overflow-hidden touch-pan-y"
      >
        {/* Swipe background: green (right) or red (left) */}
        <div className={`absolute inset-0 flex items-center px-5 transition-opacity duration-100 ${
          swipeDir === 'right'
            ? 'bg-teal-600 justify-start opacity-100'
            : swipeDir === 'left'
            ? 'bg-rose-500 justify-end opacity-100'
            : 'opacity-0'
        }`}>
          {swipeDir === 'right' && <span className="text-white text-xs font-semibold">📖 Start Reading</span>}
          {swipeDir === 'left'  && <span className="text-white text-xs font-semibold">✓ Done</span>}
        </div>

        {/* Book row */}
        <div
          className="relative flex items-center gap-3 p-3 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-xl"
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
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

          {/* Cover + title → navigate to detail */}
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

      {/* Quick Actions sheet */}
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Card */}
      <div className="relative bg-white dark:bg-ink-800 rounded-2xl shadow-2xl p-6 max-w-xs w-full text-center">
        <p className="text-xs font-semibold text-ink-400 dark:text-ink-500 uppercase tracking-widest mb-3">
          Your Next Read
        </p>
        <div className="flex justify-center mb-4">
          <BookCover book={book} size="lg" />
        </div>
        <p className="font-serif font-semibold text-lg text-ink-900 dark:text-paper-50">{book.title}</p>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">{book.author}</p>
        <Link
          to={`/library/${book.id}`}
          className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
          onClick={onClose}
        >
          View in library →
        </Link>
        <button
          onClick={onClose}
          className="mt-4 block w-full text-center text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── TBR page ──────────────────────────────────────────────────────────────────
export function TBR() {
  const { data: books = [], isLoading } = useLibrary()
  const reorderTBR = useReorderTBR()
  const [searchOpen, setSearchOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [shufflePick, setShufflePick] = useState(null)

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
    const pick = displayBooks[Math.floor(Math.random() * displayBooks.length)]
    setShufflePick(pick)
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
              title="Shuffle pick"
            >
              <Shuffle size={18} />
            </button>
          )}
          <button onClick={() => setSearchOpen(true)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Add Book</span>
          </button>
        </div>
      </div>

      {/* Hint */}
      {tbrBooks.length > 0 && (
        <p className="text-xs text-ink-400 dark:text-ink-500 text-center">
          Swipe right to start reading · swipe left to mark done · hold for more options
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

      {/* Modals */}
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
