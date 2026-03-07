import { useState, useRef } from 'react'
import { Plus, GripVertical, Shuffle, X, Check, BookOpen, Trash2 } from 'lucide-react'
import {
  DndContext, closestCenter,
  PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLibrary, useReorderTBR, useUpdateBook, useDeleteBook } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { EmptyState } from '../components/ui/index.jsx'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

const SWIPE_THRESHOLD = 65
const SWIPE_CLAMP = 100

function SortableBook({ book }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.id })
  const updateBook = useUpdateBook()
  const deleteBook = useDeleteBook()

  const [swipeX, setSwipeX] = useState(0)
  const [confirm, setConfirm] = useState(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const isSwipingH = useRef(false)

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isSwipingH.current = false
  }

  function handleTouchMove(e) {
    if (isDragging || touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (!isSwipingH.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) isSwipingH.current = true
      else if (Math.abs(dy) > 6) { touchStartX.current = null; return }
      else return
    }
    e.preventDefault()
    setSwipeX(Math.max(-SWIPE_CLAMP, Math.min(SWIPE_CLAMP, dx)))
  }

  function handleTouchEnd() {
    if (isSwipingH.current) {
      if (swipeX >= SWIPE_THRESHOLD) setConfirm('reading')
      else if (swipeX <= -SWIPE_THRESHOLD) setConfirm('delete')
    }
    setSwipeX(0)
    isSwipingH.current = false
    touchStartX.current = null
  }

  async function confirmReading() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'reading' } })
    toast.success(`Started reading "${book.title}"`)
    setConfirm(null)
  }

  async function confirmDelete() {
    await deleteBook.mutateAsync(book.id)
    toast.success(`"${book.title}" removed`)
    setConfirm(null)
  }

  if (confirm === 'reading') {
    return (
      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <BookOpen size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <p className="flex-1 text-sm font-medium text-blue-800 dark:text-blue-300 min-w-0 truncate">
          Start reading <span className="font-semibold">"{book.title}"</span>?
        </p>
        <button onClick={confirmReading} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex-shrink-0">
          <Check size={13} /> Yes
        </button>
        <button onClick={() => setConfirm(null)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    )
  }

  if (confirm === 'delete') {
    return (
      <div className="flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
        <Trash2 size={18} className="text-rose-500 flex-shrink-0" />
        <p className="flex-1 text-sm font-medium text-rose-800 dark:text-rose-300 min-w-0 truncate">
          Remove <span className="font-semibold">"{book.title}"</span>?
        </p>
        <button onClick={confirmDelete} className="flex items-center gap-1 px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-semibold hover:bg-rose-600 transition-colors flex-shrink-0">
          <Check size={13} /> Yes
        </button>
        <button onClick={() => setConfirm(null)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    )
  }

  const tintColor =
    swipeX > 12  ? `rgba(59,130,246,${Math.min(0.15, (swipeX - 12) / 120)})` :
    swipeX < -12 ? `rgba(239,68,68,${Math.min(0.15, (-swipeX - 12) / 120)})` : undefined

  return (
    <div ref={setNodeRef} style={dndStyle}>
      <div
        className="flex items-center gap-3 p-3 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700"
        style={{
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX ? 'none' : 'transform 0.2s ease',
          backgroundColor: tintColor,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          {...attributes} {...listeners}
          type="button"
          className="cursor-grab active:cursor-grabbing text-ink-300 dark:text-ink-600 hover:text-ink-500 flex-shrink-0 p-1"
          style={{ touchAction: 'none', userSelect: 'none' }}
        >
          <GripVertical size={16} />
        </button>
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
  )
}

function ShufflePickModal({ books, onClose }) {
  const [pick, setPick] = useState(() => books[Math.floor(Math.random() * books.length)])
  function pickAgain() { setPick(books[Math.floor(Math.random() * books.length)]) }
  if (!pick) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-paper-200 dark:border-ink-700 p-6 w-full max-w-xs text-center"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700 transition-colors">
          <X size={16} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 dark:text-teal-400 mb-4">Your next read</p>
        <div className="flex justify-center mb-4">
          <div className="w-24 shadow-book rounded-lg overflow-hidden">
            <BookCover book={pick} size="md" />
          </div>
        </div>
        <p className="font-serif font-bold text-ink-900 dark:text-paper-50 text-base leading-snug">{pick.title}</p>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">{pick.author}</p>
        <div className="flex flex-col items-center gap-2 mt-4">
          <button
            onClick={pickAgain}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            <Shuffle size={14} /> Pick Again
          </button>
          <Link
            to={`/library/${pick.id}`}
            onClick={onClose}
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium"
          >
            View in library →
          </Link>
        </div>
      </div>
    </div>
  )
}

export function TBR() {
  const { data: books = [], isLoading } = useLibrary()
  const reorderTBR = useReorderTBR()
  const [searchOpen, setSearchOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [shuffleOpen, setShuffleOpen] = useState(false)

  const tbrBooks = books
    .filter(b => b.status === 'tbr')
    .sort((a, b) => (a.tbr_order || 0) - (b.tbr_order || 0))

  const [localOrder, setLocalOrder] = useState(null)
  const displayBooks = localOrder
    ? localOrder.map(id => tbrBooks.find(b => b.id === id)).filter(Boolean)
    : tbrBooks

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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

  function handleSearchSelect(book) { setSelectedBook({ ...book, status: 'tbr' }); setFormOpen(true) }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">To Be Read</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            {isLoading ? '...' : `${tbrBooks.length} ${tbrBooks.length === 1 ? 'book' : 'books'} on your shelf`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tbrBooks.length > 1 && (
            <button
              onClick={() => setShuffleOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-400 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-400 transition-colors text-xs font-medium"
            >
              <Shuffle size={13} /> Shuffle Pick
            </button>
          )}
          <button onClick={() => setSearchOpen(true)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Add Book</span>
          </button>
        </div>
      </div>

      {!isLoading && tbrBooks.length > 0 && (
        <p className="text-xs text-ink-400 dark:text-ink-500 text-center">
          Swipe right to start reading · swipe left to remove
        </p>
      )}

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

      {shuffleOpen && <ShufflePickModal books={tbrBooks} onClose={() => setShuffleOpen(false)} />}

      <BookSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} onManual={() => { setSelectedBook(null); setFormOpen(true) }} />
      <BookForm open={formOpen} onClose={() => { setFormOpen(false); setSelectedBook(null) }} initialBook={selectedBook} />
    </div>
  )
}
