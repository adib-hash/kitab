import { useState } from 'react'
import { Target } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useLibrary } from '../hooks/useLibrary'
import { useReadingGoal, useSetReadingGoal } from '../hooks/useTags'
import { StatCard, ProgressBar, EmptyState } from '../components/ui/index.jsx'
import { computeStats, pluralize } from '../lib/utils'
import { BookCover } from '../components/books/BookCover'
import { Link } from 'react-router-dom'
import { parseISO } from 'date-fns'

const CHART_COLORS = ['#0F766E','#0D9488','#14B8A6','#2DD4BF','#99F6E4','#CCFBF1','#047857','#065F46']

function isThisYear(dateStr, year) {
  if (!dateStr) return false
  try { return parseISO(dateStr).getFullYear() === year } catch { return false }
}

export function Stats() {
  const { data: books = [], isLoading } = useLibrary()
  const thisYear = new Date().getFullYear()
  const { data: goal } = useReadingGoal(thisYear)
  const setGoal = useSetReadingGoal()
  const [goalInput, setGoalInput] = useState('')
  const [editingGoal, setEditingGoal] = useState(false)

  // ── Scope everything to current year ──────────────────────────────────────
  // A book "counts" for this year if it was finished this year.
  // For books without date_finished (marked read but no date), we include them
  // if they have no date at all — they're treated as "sometime this year" only
  // if the user hasn't recorded a specific date. We'll be conservative and
  // require a date_finished in the current year.
  const yearBooks = books.filter(b =>
    b.status === 'read' && isThisYear(b.date_finished, thisYear)
  )

  // Pass year-scoped books to computeStats so all derived stats reflect this year
  const stats = computeStats(yearBooks)

  // For TBR count we still use all books (that's not a year-specific stat)
  const tbrCount = books.filter(b => b.status === 'tbr').length

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-3">
      {[...Array(8)].map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
    </div>
  )

  if (yearBooks.length === 0) return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="page-title">Statistics</h1>
        <span className="text-sm font-medium text-ink-400 dark:text-ink-500">{thisYear}</span>
      </div>
      <EmptyState
        icon="📊"
        title={`No books finished in ${thisYear} yet`}
        description="Mark books as read with a finish date this year to see your stats."
      />
    </div>
  )

  async function saveGoal() {
    const t = parseInt(goalInput)
    if (!t || t < 1) return
    await setGoal.mutateAsync({ year: thisYear, target: t })
    setEditingGoal(false)
    setGoalInput('')
  }

  return (
    <div className="space-y-8">

      {/* Header with year badge */}
      <div className="flex items-baseline gap-3">
        <h1 className="page-title">Statistics</h1>
        <span className="text-sm font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
          {thisYear}
        </span>
      </div>

      {/* Key metrics — all for this year */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Books Read" value={stats.totalRead} icon="📚" sub={String(thisYear)} />
        <StatCard label="Pages Read" value={stats.totalPages.toLocaleString()} icon="📄" sub={String(thisYear)} />
        <StatCard label="Avg Rating" value={stats.avgRating ? `${stats.avgRating} ★` : null} icon="⭐" sub={String(thisYear)} />
        <StatCard label="Avg Pace" value={stats.avgDays ? `${stats.avgDays}d` : null} icon="⏱" sub="per book" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Longest Book"
          value={stats.longest?.title ? stats.longest.title.slice(0,20) + (stats.longest.title.length > 20 ? '…' : '') : null}
          icon="📏"
          sub={stats.longest?.page_count ? `${stats.longest.page_count} pages` : null}
        />
        <StatCard
          label="Shortest Book"
          value={stats.shortest?.title ? stats.shortest.title.slice(0,20) + (stats.shortest.title.length > 20 ? '…' : '') : null}
          icon="📌"
          sub={stats.shortest?.page_count ? `${stats.shortest.page_count} pages` : null}
        />
        <StatCard label="On TBR" value={tbrCount} icon="🔖" sub="total" />
        <StatCard label="Currently Reading" value={books.filter(b => b.status === 'reading').length} icon="🔍" />
      </div>

      {/* Reading goal */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-amber-600" />
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">{thisYear} Reading Goal</h2>
          </div>
          <button onClick={() => setEditingGoal(!editingGoal)} className="btn-ghost text-xs">
            {goal ? 'Edit goal' : 'Set goal'}
          </button>
        </div>

        {editingGoal && (
          <div className="flex items-center gap-2 mb-4">
            <input
              type="number" min="1" max="365"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              placeholder={goal?.target || 'e.g. 24'}
              className="input w-32"
            />
            <button onClick={saveGoal} className="btn-primary">Save</button>
            <button onClick={() => setEditingGoal(false)} className="btn-ghost">Cancel</button>
          </div>
        )}

        {goal ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-ink-700 dark:text-ink-300">
                {stats.totalRead} of {goal.target} books
              </p>
              <p className="text-sm font-semibold text-ink-900 dark:text-paper-50">
                {Math.round((stats.totalRead / goal.target) * 100)}%
              </p>
            </div>
            <ProgressBar value={stats.totalRead} max={goal.target} className="h-3" color="amber" />
            {stats.totalRead >= goal.target && (
              <p className="text-sm text-teal-700 dark:text-teal-400 mt-2 font-medium">🎉 Goal achieved!</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-500 dark:text-ink-400">Set a reading goal to track your progress for {thisYear}.</p>
        )}
      </div>

      {/* Books per month — current year only */}
      {stats.booksPerMonth.length > 0 && (
        <div className="card p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-5">
            Books per Month · {thisYear}
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.booksPerMonth} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#78716C' }} />
              <YAxis tick={{ fontSize: 11, fill: '#78716C' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'white', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v} book${v > 1 ? 's' : ''}`, '']}
              />
              <Bar dataKey="count" fill="#0F766E" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Genre breakdown — current year only */}
      {stats.genreBreakdown.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-5">Top Genres · {thisYear}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats.genreBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
                  {stats.genreBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'white', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-6">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-4">Genre Breakdown</h2>
            <div className="space-y-2.5">
              {stats.genreBreakdown.map((g, i) => (
                <div key={g.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-ink-700 dark:text-ink-300">{g.name}</span>
                    <span className="font-medium text-ink-900 dark:text-paper-50">{g.count}</span>
                  </div>
                  <ProgressBar value={g.count} max={stats.genreBreakdown[0].count} className="h-1.5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
