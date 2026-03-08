import { useState } from 'react'
import { Target } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useLibrary } from '../hooks/useLibrary'
import { useReadingGoal, useSetReadingGoal } from '../hooks/useTags'
import { StatCard, ProgressBar, EmptyState } from '../components/ui/index.jsx'
import { computeStats } from '../lib/utils'
import { Link } from 'react-router-dom'

const CHART_COLORS = ['#0F766E','#0D9488','#14B8A6','#2DD4BF','#99F6E4','#047857','#065F46','#6EE7B7']

function isThisYear(dateStr, year) {
  if (!dateStr) return false
  return parseInt(dateStr.slice(0, 4)) === year
}

export function Stats() {
  const { data: books = [], isLoading } = useLibrary()
  const thisYear = new Date().getFullYear()
  const { data: goal } = useReadingGoal(thisYear)
  const setGoal = useSetReadingGoal()
  const [goalInput, setGoalInput] = useState('')
  const [editingGoal, setEditingGoal] = useState(false)

  // Scope everything to current year
  const yearBooks = books.filter(b =>
    b.status === 'read' && isThisYear(b.date_finished, thisYear)
  )
  const stats = computeStats(yearBooks)
  const tbrCount = books.filter(b => b.status === 'tbr').length

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-4">
      {[...Array(8)].map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
    </div>
  )

  if (yearBooks.length === 0) return (
    <div className="space-y-6 pb-8">
      <div className="flex items-baseline gap-3">
        <h1 className="page-title">Statistics</h1>
        <span className="text-sm font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">{thisYear}</span>
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
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h1 className="page-title">Statistics</h1>
        <span className="text-sm font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
          {thisYear}
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Books Read" value={stats.totalRead} icon="📚" sub={String(thisYear)} />
        <StatCard label="Pages Read" value={stats.totalPages.toLocaleString()} icon="📄" sub={String(thisYear)} />
        <StatCard label="Avg Rating" value={stats.avgRating ? `${stats.avgRating} ★` : null} icon="⭐" sub={String(thisYear)} />
        <StatCard label="On TBR" value={tbrCount} icon="🔖" sub="total" />
      </div>
      <div className="grid grid-cols-2 gap-4">
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
        <StatCard label="Currently Reading" value={books.filter(b => b.status === 'reading').length} icon="🔍" />
        <StatCard label="Did Not Finish" value={books.filter(b => b.status === 'dnf').length} icon="📭" />
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

      {/* Books per month */}
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
                contentStyle={{ background: '#1C1917', border: '1px solid #44403C', borderRadius: 8, fontSize: 12, color: '#FAF7F2' }}
                formatter={(v) => [`${v} book${v > 1 ? 's' : ''}`, '']}
              />
              <Bar dataKey="count" fill="#0F766E" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tags breakdown */}
      {stats.tagBreakdown.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-5">
              Tags · {thisYear}
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.tagBreakdown}
                  dataKey="count"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={75}
                  label={({ name }) => name.length > 12 ? name.slice(0, 11) + '…' : name}
                  labelLine={false}
                >
                  {stats.tagBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#FAF7F2', border: '1px solid #D6D3D1', borderRadius: 8, fontSize: 12, color: '#1C1917' }}
                  formatter={(v, name) => [`${v} book${v !== 1 ? 's' : ''}`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-6">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-4">
              Tag Breakdown
            </h2>
            <div className="space-y-3">
              {stats.tagBreakdown.map((tag, i) => (
                <div key={tag.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-ink-700 dark:text-ink-300">{tag.name}</span>
                    <span className="font-medium text-ink-900 dark:text-paper-50">
                      {tag.count} book{tag.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ProgressBar
                    value={tag.count}
                    max={stats.tagBreakdown[0].count}
                    className="h-1.5"
                    color={i === 0 ? 'teal' : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
