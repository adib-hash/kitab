import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Swords, StopCircle, RotateCcw, BookOpen, Loader2, ChevronLeft, CheckCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLibrary, useUpdateBook } from '../hooks/useLibrary'
import { supabase } from '../lib/supabase'
import { BookCover } from '../components/books/BookCover'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

// ── ELO ──────────────────────────────────────────────────────────────────────
const K = 32
function calcElo(winnerElo, loserElo) {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
  return {
    winnerNew: Math.round(winnerElo + K * (1 - expected)),
    loserNew: Math.round(loserElo + K * (0 - (1 - expected))),
  }
}

// ── PAIR PICKER ───────────────────────────────────────────────────────────────
function pickPair(books, seen) {
  const sorted = [...books].sort((a, b) => b.elo - a.elo)
  for (let t = 0; t < 200; t++) {
    let a, b
    if (Math.random() < 0.6 && sorted.length > 4) {
      const i = Math.floor(Math.random() * (sorted.length - 1))
      const offset = 1 + Math.floor(Math.random() * Math.min(5, sorted.length - i - 1))
      a = sorted[i]
      b = sorted[Math.min(i + offset, sorted.length - 1)]
    } else {
      const i = Math.floor(Math.random() * books.length)
      let j = Math.floor(Math.random() * books.length)
      while (j === i) j = Math.floor(Math.random() * books.length)
      a = books[i]; b = books[j]
    }
    if (!a || !b || a.id === b.id) continue
    const key = [a.id, b.id].sort().join('_')
    if (!seen.has(key)) { seen.add(key); return [a, b] }
  }
  return [books[0], books[1]]
}

// ── BATTLE CARD ───────────────────────────────────────────────────────────────
function BattleCard({ book, onClick, disabled, isWinner, isLoser }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      animate={
        isWinner ? { scale: 1.03 } :
        isLoser  ? { opacity: 0.45, scale: 0.97 } : {}
      }
      transition={{ duration: 0.2 }}
      className={`flex-1 flex flex-col items-center rounded-2xl border-2 overflow-hidden transition-colors duration-150 cursor-pointer group ${isWinner ? 'border-teal-600' : 'border-transparent'}`}
    >
      <div
        className="w-full relative bg-ink-900 flex items-center justify-center"
        style={{ height: '52vw', maxHeight: 300 }}
      >
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center font-serif font-bold text-white text-4xl bg-teal-700">
            {book.title.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="absolute inset-0 bg-teal-500/0 group-hover:bg-teal-500/10 transition-all duration-150" />
        {isWinner && (
          <div className="absolute inset-0 flex items-center justify-center bg-teal-900/30">
            <CheckCircle size={48} className="text-white drop-shadow-lg" />
          </div>
        )}
      </div>
      <div className="w-full px-3 py-3 text-center" style={{ minHeight: 64 }}>
        <p className="font-serif font-semibold text-ink-900 dark:text-paper-50 text-sm leading-snug line-clamp-2">{book.title}</p>
        <p className="text-xs text-ink-400 dark:text-ink-500 mt-0.5 truncate">{book.author}</p>
      </div>
    </motion.button>
  )
}

// ── RESULTS VIEW ──────────────────────────────────────────────────────────────
function ResultsView({ rankedBooks, matchCount, onContinue, onReset, resetting, onBack }) {
  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-300 transition-colors"
        >
          <ChevronLeft size={14} /> Back
        </button>
      </div>
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Trophy size={20} className="text-amber-500" />
          <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-paper-50">Your Rankings</h2>
        </div>
        <p className="text-xs text-ink-500 dark:text-ink-400">{matchCount} matchups completed</p>
      </div>

      <div className="space-y-2">
        {rankedBooks.map((book, i) => (
          <motion.div
            key={book.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
          <Link
            to={`/library/${book.id}`}
            className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 hover:border-teal-400 transition-colors"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              i === 0 ? 'bg-amber-400 text-amber-900' :
              i === 1 ? 'bg-slate-300 text-slate-700' :
              i === 2 ? 'bg-amber-700 text-amber-100' :
              'bg-paper-100 dark:bg-ink-700 text-ink-500 dark:text-ink-400'
            }`}>{i + 1}</div>
            <BookCover book={book} size="sm" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
              <p className="text-xs text-ink-400 truncate">{book.author}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-mono text-ink-400">{book.elo}</p>
              <p className="text-xs text-ink-300">{book.elo_wins}W / {book.elo_losses}L</p>
            </div>
          </Link>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onContinue} className="btn-primary flex-1 justify-center">
          <Swords size={15} /> Keep Ranking
        </button>
        <button
          onClick={onReset}
          disabled={resetting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-500 text-sm hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors disabled:opacity-50"
        >
          {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reset
        </button>
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function Rank() {
  const { data: books = [], isLoading } = useLibrary()
  const updateBook = useUpdateBook()
  const qc = useQueryClient()
  const [view, setView] = useState('home')
  const [seen, setSeen] = useState(new Set())
  const [pair, setPair] = useState(null)
  const [winner, setWinner] = useState(null)
  const [resetting, setResetting] = useState(false)

  const readBooks = books.filter(b => b.status === 'read')

  // Books with ELO defaults if null
  const booksWithElo = readBooks.map(b => ({
    ...b,
    elo: b.elo ?? 1500,
    elo_wins: b.elo_wins ?? 0,
    elo_losses: b.elo_losses ?? 0,
  }))

  const rankedBooks = [...booksWithElo].sort((a, b) => b.elo - a.elo)
  const matchCount = booksWithElo.reduce((s, b) => s + (b.elo_wins ?? 0), 0)

  function startRanking() {
    if (booksWithElo.length < 2) return
    const newSeen = new Set(seen)
    const nextPair = pickPair(booksWithElo, newSeen)
    setSeen(newSeen)
    setPair(nextPair)
    setWinner(null)
    setView('battle')
  }

  async function handlePick(chosenBook, otherBook) {
    setWinner(chosenBook.id)

    const { winnerNew, loserNew } = calcElo(chosenBook.elo, otherBook.elo)

    // Optimistically update pair display, then persist to Supabase
    try {
      await Promise.all([
        updateBook.mutateAsync({
          id: chosenBook.id,
          updates: { elo: winnerNew, elo_wins: (chosenBook.elo_wins ?? 0) + 1 },
        }),
        updateBook.mutateAsync({
          id: otherBook.id,
          updates: { elo: loserNew, elo_losses: (otherBook.elo_losses ?? 0) + 1 },
        }),
      ])
    } catch {
      toast.error('Failed to save result — check your connection')
    }

    setTimeout(() => {
      const updatedBooks = booksWithElo.map(b => {
        if (b.id === chosenBook.id) return { ...b, elo: winnerNew, elo_wins: (b.elo_wins ?? 0) + 1 }
        if (b.id === otherBook.id) return { ...b, elo: loserNew, elo_losses: (b.elo_losses ?? 0) + 1 }
        return b
      })
      const newSeen = new Set(seen)
      const nextPair = pickPair(updatedBooks, newSeen)
      setSeen(newSeen)
      setPair(nextPair)
      setWinner(null)
    }, 600)
  }

  async function handleReset() {
    if (!confirm('Reset all rankings? This cannot be undone.')) return
    setResetting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('books')
        .update({ elo: 1500, elo_wins: 0, elo_losses: 0 })
        .eq('user_id', user.id)
        .eq('status', 'read')
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['books'] })
      setSeen(new Set())
      setView('home')
      toast.success('Rankings reset')
    } catch {
      toast.error('Failed to reset rankings')
    } finally {
      setResetting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-ink-400" />
      </div>
    )
  }

  if (readBooks.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Rank</h1>
        <div className="card p-10 text-center space-y-3">
          <BookOpen size={36} className="mx-auto text-ink-300" />
          <p className="font-medium text-ink-700 dark:text-ink-300">Not enough books yet</p>
          <p className="text-sm text-ink-500">Mark at least 2 books as Read to start ranking.</p>
          <Link to="/library" className="btn-primary inline-flex mx-auto">Go to Library</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Rank</h1>
        {view === 'battle' && (
          <button
            onClick={() => setView('results')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-ink-500 border border-paper-200 dark:border-ink-700 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors"
          >
            <StopCircle size={14} /> Stop
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {view === 'home' && (
          <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            <div className="card p-6 text-center space-y-4">
              <Swords size={48} className="text-teal-600 mx-auto" />
              <div>
                <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-paper-50">Head-to-Head Rankings</h2>
                <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Pick the better book in each matchup. Build your definitive ranked list.</p>
              </div>
              <div className="flex items-center justify-center gap-6 text-sm text-ink-500">
                <div className="text-center">
                  <p className="font-semibold text-ink-900 dark:text-paper-50 text-lg">{readBooks.length}</p>
                  <p className="text-xs">books to rank</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-ink-900 dark:text-paper-50 text-lg">{matchCount}</p>
                  <p className="text-xs">matchups done</p>
                </div>
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <button onClick={startRanking} className="btn-primary">
                  <Swords size={15} /> {matchCount > 0 ? 'Continue Ranking' : 'Start Ranking'}
                </button>
                {matchCount > 0 && (
                  <button onClick={() => setView('results')} className="btn-secondary">
                    <Trophy size={15} /> See Rankings
                  </button>
                )}
              </div>
              {matchCount > 0 && (
                <button onClick={handleReset} disabled={resetting} className="text-xs text-ink-400 hover:text-ink-600 transition-colors">
                  Reset all rankings
                </button>
              )}
            </div>

            {matchCount > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Current Top 3</p>
                {rankedBooks.slice(0, 3).map((book, i) => (
                  <div key={book.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-amber-400 text-amber-900' :
                      i === 1 ? 'bg-slate-300 text-slate-700' :
                      'bg-amber-700 text-amber-100'
                    }`}>{i + 1}</span>
                    <BookCover book={book} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                      <p className="text-xs text-ink-400 truncate">{book.author}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {view === 'battle' && pair && (
          <motion.div key="battle" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-ink-400">Which book is better?</p>
            <div className="flex gap-2 items-stretch">
              {pair.map((book, i) => (
                <BattleCard
                  key={book.id}
                  book={book}
                  onClick={() => !winner && handlePick(book, pair[1 - i])}
                  disabled={!!winner}
                  isWinner={winner === book.id}
                  isLoser={!!winner && winner !== book.id}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-paper-200 dark:bg-ink-700" />
              <span className="text-xs font-bold text-ink-300 uppercase tracking-widest">VS</span>
              <div className="flex-1 h-px bg-paper-200 dark:bg-ink-700" />
            </div>
            <p className="text-center text-xs text-ink-400">{matchCount} matchups completed · Tap a book to choose</p>
          </motion.div>
        )}

        {view === 'results' && (
          <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ResultsView
              rankedBooks={rankedBooks}
              matchCount={matchCount}
              onContinue={startRanking}
              onReset={handleReset}
              resetting={resetting}
              onBack={() => setView('home')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
