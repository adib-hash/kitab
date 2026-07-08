import { useState, useMemo } from 'react'
import { Target, BookOpen, FileText, Star, Bookmark, Maximize2, Minimize2, BookMarked, XCircle, BarChart2, CheckCircle, Clock, Users } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useLibrary } from '../hooks/useLibrary'
import { useReadingGoal, useSetReadingGoal } from '../hooks/useTags'
import { StatCard, ProgressBar, EmptyState } from '../components/ui/index.jsx'
import { computeStats } from '../lib/utils'
import { clsx } from 'clsx'

const CHART_COLORS = ['#0F766E','#0D9488','#14B8A6','#2DD4BF','#99F6E4','#047857','#065F46','#6EE7B7']

export function Stats() {
  const { data: books = [], isLoading } = useLibrary()
  const thisYear = new Date().getFullYear()
  const { data: goal } = useReadingGoal(thisYear)
  const setGoal = useSetReadingGoal()
  const [goalInput, setGoalInput] = useState('')
  const [editingGoal, setEditingGoal] = useState(false)

  // Derive available years from data
  const years = useMemo(() => {
    const ys = [...new Set(
      books
        .filter(b => b.status === 'read' && b.date_finished)
        .map(b => parseInt(b.date_finished.slice(0, 4)))
    )].sort((a, b) => b - a)
    return ys
  }, [books])

  const [selectedYear, setSelectedYear] = useState(thisYear)

  const scopedBooks = useMemo(() => {
    const readBooks = books.filter(b => b.status === 'read' && b.date_finished)
    if (selectedYear === 'all') return readBooks
    return readBooks.filter(b => parseInt(b.date_finished.slice(0, 4)) === selectedYear)
  }, [books, selectedYear])

  const stats = useMemo(() => computeStats(scopedBooks), [scopedBooks])
  const tbrCount = books.filter(b => b.status === 'tbr').length

  // Avg days to finish (date_started → date_finished)
  const avgDaysToFinish = useMemo(() => {
    const withBoth = scopedBooks.filter(b => b.date_started && b.date_finished)
    if (!withBoth.length) return null
    const total = withBoth.reduce((acc, b) => {
      const start = new Date(b.date_started)
      const end = new Date(b.date_finished)
      return acc + Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)))
    }, 0)
    return Math.round(total / withBoth.length)
  }, [scopedBooks])

  // Top author by book count
  const topAuthor = useMemo(() => {
    if (!scopedBooks.length) return null
    const counts = {}
    scopedBooks.forEach(b => {
      if (b.author) counts[b.author] = (counts[b.author] || 0) + 1
    })
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? { name: top[0], count: top[1] } : null
  }, [scopedBooks])

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-4">
      {[...Array(8)].map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
    </div>
  )

  async function saveGoal() {
    const t = parseInt(goalInput)
    if (!t || t < 1) return
    await setGoal.mutateAsync({ year: thisYear, target: t })
    setEditingGoal(false)
    setGoalInput('')
  }

  const yearLabel = selectedYear === 'all' ? 'All time' : String(selectedYear)

  return (
    <div className="space-y-6 pb-8">

      <div className="flex items-baseline gap-3">
        <h1 className="page-title">Statistics</h1>
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[...years, 'all'].map(y => {
          const isActive = selectedYear === y
          return (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={clsx(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                isActive
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white dark:bg-ink-800 border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-400 hover:border-teal-400'
              )}
            >
              {y === 'all' ? 'All time' : y}
            </button>
          )
        })}
      </div>

      {scopedBooks.length === 0 ? (
        <EmptyState
          icon={<BarChart2 size={48} />}
          title={selectedYear === 'all' ? 'No books finished yet' : `No books finished in ${selectedYear}`}
          description="Mark books as read with a finish date to see your stats."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Books Read" value={stats.totalRead} icon={<BookOpen size={18} />} sub={yearLabel} />
            <StatCard label="Pages Read" value={stats.totalPages.toLocaleString()} icon={<FileText size={18} />} sub={yearLabel} />
            <StatCard label="Avg Rating" value={stats.avgRating ? `${stats.avgRating} ★` : null} icon={<Star size={18} />} sub={yearLabel} />
            <StatCard label="On TBR" value={tbrCount} icon={<Bookmark size={18} />} sub="total" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Longest Book"
              value={stats.longest?.title ? stats.longest.title.slice(0,20) + (stats.longest.title.length > 20 ? '…' : '') : null}
              icon={<Maximize2 size={18} />}
              sub={stats.longest?.page_count ? `${stats.longest.page_count} pages` : null}
            />
            <StatCard
              label="Shortest Book"
              value={stats.shortest?.title ? stats.shortest.title.slice(0,20) + (stats.shortest.title.length > 20 ? '…' : '') : null}
              icon={<Minimize2 size={18} />}
              sub={stats.shortest?.page_count ? `${stats.shortest.page_count} pages` : null}
            />
            {avgDaysToFinish !== null && (
              <StatCard label="Avg Days to Finish" value={`${avgDaysToFinish}d`} icon={<Clock size={18} />} sub="per book" />
            )}
            {topAuthor && topAuthor.count > 1 && (
              <StatCard
                label="Top Author"
                value={topAuthor.name.split(' ').slice(-1)[0]}
                icon={<Users size={18} />}
                sub={`${topAuthor.count} books`}
              />
            )}
            <StatCard label="Currently Reading" value={books.filter(b => b.status === 'reading').length} icon={<BookMarked size={18} />} />
            <StatCard label="Did Not Finish" value={books.filter(b => b.status === 'dnf').length} icon={<XCircle size={18} />} />
          </div>

          {/* Reading goal — only shown for specific year, not "All time" */}
          {selectedYear !== 'all' && selectedYear === thisYear && (
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
                    style={{ fontSize: '16px' }}
                  />
                  <button onClick={saveGoal} className="btn-primary">Save</button>
                  <button onClick={() => setEditingGoal(false)} className="btn-ghost">Cancel</button>
                </div>
              )}
              {goal ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-ink-700 dark:text-ink-300">{stats.totalRead} of {goal.target} books</p>
                    <p className="text-sm font-semibold text-ink-900 dark:text-paper-50">
                      {Math.round((stats.totalRead / goal.target) * 100)}%
                    </p>
                  </div>
                  <ProgressBar value={stats.totalRead} max={goal.target} className="h-3" gradient />
                  {stats.totalRead >= goal.target && (
                    <p className="text-sm text-teal-700 dark:text-teal-400 mt-2 font-medium flex items-center gap-1">
                      <CheckCircle size={14} /> Goal achieved!
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-500 dark:text-ink-400">Set a reading goal to track your progress for {thisYear}.</p>
              )}
            </div>
          )}

          {/* Books per month */}
          {stats.booksPerMonth.length > 0 && (
            <div className="card p-6">
              <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-5">
                Books per Month · {yearLabel}
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.booksPerMonth} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#78716C' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#78716C' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1C1917', border: '1px solid #44403C', borderRadius: 8, fontSize: 12, color: '#FAF7F2' }}
                    formatter={(v) => [`${v} book${v > 1 ? 's' : ''}`, '']}
                  />
                  <Bar dataKey="count" fill="#0F766E" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tag breakdown */}
          {stats.tagBreakdown && stats.tagBreakdown.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="card p-6">
                <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-5">
                  Tags · {yearLabel}
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={stats.tagBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {stats.tagBreakdown.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1C1917', border: '1px solid #44403C', borderRadius: 8, fontSize: 12, color: '#FAF7F2' }}
                      itemStyle={{ color: '#FAF7F2' }}
                      labelStyle={{ color: '#FAF7F2' }}
                      formatter={(value, name) => [`${value} book${value !== 1 ? 's' : ''}`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="card p-6">
                <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-4">Tag Breakdown</h2>
                <div className="space-y-3">
                  {stats.tagBreakdown.map((tag) => (
                    <div key={tag.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-ink-700 dark:text-ink-300">{tag.name}</span>
                        <span className="font-medium text-ink-900 dark:text-paper-50">
                          {tag.count} book{tag.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <ProgressBar value={tag.count} max={stats.tagBreakdown[0].count} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
