import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { X, BookOpen } from 'lucide-react'
import { clsx } from 'clsx'

// ── Button ──────────────────────────────────────────────────────────────
export function Button({ variant = 'primary', size = 'md', className, children, ...props }) {
  const base = clsx(
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
    {
      'bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900': variant === 'primary',
      'border border-ink-300 text-ink-700 hover:bg-paper-100 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-ink-800': variant === 'secondary',
      'text-ink-600 hover:bg-paper-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100': variant === 'ghost',
      'bg-rose-600 text-white hover:bg-rose-700': variant === 'danger',
    },
    {
      'px-2.5 py-1.5 text-xs': size === 'sm',
      'px-4 py-2 text-sm': size === 'md',
      'px-5 py-2.5 text-base': size === 'lg',
    },
    className
  )
  return <button className={base} {...props}>{children}</button>
}

// ── Modal ───────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (open) {
      // iOS Safari fix: overflow:hidden alone doesn't prevent scroll.
      // position:fixed locks the page; we save/restore scrollY so it
      // doesn't jump to the top when the modal closes.
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      return () => {
        const y = Math.abs(parseInt(document.body.style.top || '0'))
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        window.scrollTo(0, y)
      }
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm z-[250]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3 }}
            style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 72px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', left: '1rem', right: '1rem', zIndex: 260 }}
            className={clsx(
              'bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-paper-200 dark:border-ink-700 overflow-hidden flex flex-col',
              {
                'max-w-md mx-auto': size === 'md',
                'max-w-xl mx-auto': size === 'lg',
                'max-w-3xl mx-auto': size === 'xl',
              }
            )}
          >
            {title ? (
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-paper-200 dark:border-ink-700">
                <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">{title}</h2>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-700 text-ink-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex-shrink-0 flex items-center justify-end px-4 pt-3">
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-700 text-ink-400 transition-colors">
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto flex-1 min-h-0 scrollbar-persistent">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────
export function Skeleton({ className }) {
  return <div className={clsx('skeleton rounded', className)} />
}

export function BookCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="book-cover w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

// ── EmptyState ───────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="mb-4 opacity-40 text-ink-400">{icon || <BookOpen size={48} />}</div>
      <h3 className="font-serif text-xl font-semibold text-ink-700 dark:text-ink-300 mb-2">{title}</h3>
      {description && <p className="text-sm text-ink-500 dark:text-ink-400 max-w-sm mb-6">{description}</p>}
      {action}
    </div>
  )
}

// ── ProgressBar ──────────────────────────────────────────────────────────
export function ProgressBar({ value, max, className, color = 'teal', gradient = false }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={clsx('w-full bg-paper-200 dark:bg-ink-700 rounded-full overflow-hidden', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={clsx('h-full rounded-full', !gradient && {
          'bg-teal-600': color === 'teal',
          'bg-amber-500': color === 'amber',
          'bg-emerald-600': color === 'emerald',
        })}
        style={gradient ? { background: 'linear-gradient(90deg, #FDE68A 0%, #F59E0B 50%, #B45309 100%)' } : undefined}
      />
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="section-label">{label}</p>
        {icon && <span className="text-xl opacity-40">{icon}</span>}
      </div>
      <p className="font-serif text-3xl font-semibold text-ink-900 dark:text-paper-50">{value ?? '—'}</p>
      {sub && <p className="text-xs text-ink-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────
export function Divider({ className }) {
  return <hr className={clsx('border-paper-200 dark:border-ink-700', className)} />
}
