import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { GlobalSearch } from '../search/GlobalSearch'
import toast, { Toaster, ToastBar, useToasterStore } from 'react-hot-toast'
import { Capacitor } from '@capacitor/core'

// react-hot-toast pauses a toast's countdown on mouseenter and resumes on
// mouseleave. On iPhone a tap on the toast sends the enter but never the leave,
// so the toast paused forever and stuck on screen. This dismisses any toast
// still visible 1.5 s past its normal lifetime, whatever paused it.
const TOAST_DEFAULT_MS = { success: 2000, error: 4000, blank: 4000, custom: 4000 }
function ToastWatchdog() {
  const { toasts } = useToasterStore()
  useEffect(() => {
    const timers = toasts
      .filter(t => t.visible && t.type !== 'loading' && t.duration !== Infinity)
      .map(t => {
        const lifetime = (t.duration ?? TOAST_DEFAULT_MS[t.type] ?? 4000) + 1500
        return setTimeout(() => toast.dismiss(t.id), Math.max(0, t.createdAt + lifetime - Date.now()))
      })
    return () => timers.forEach(clearTimeout)
  }, [toasts])
  return null
}

export function Layout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Navigate to book detail when a highlight-of-the-day notification is tapped
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle
    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      handle = LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const bookId = notification?.extra?.bookId
        if (bookId) navigate(`/library/${bookId}`, { state: { openHighlights: true } })
      })
    }).catch(() => {})
    return () => { handle?.then?.(h => h.remove()).catch(() => {}) }
  }, [navigate])

  return (
    <>
      {/* ── Desktop layout ── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-paper-50 dark:bg-ink-900">
        <Sidebar onSearch={() => setSearchOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile layout ── */}
      <div className="md:hidden bg-paper-50 dark:bg-ink-900 min-h-screen">
        {/* Mobile top bar with search — paddingTop accounts for iOS notch/status bar */}
        <div
          className="sticky top-0 z-[150] flex items-center justify-between px-4 pb-3 bg-paper-50/90 dark:bg-ink-900/90 backdrop-blur border-b border-paper-200 dark:border-ink-800"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
        >
          <Link to="/" className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">Kitab</Link>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search your library"
            className="p-2 rounded-xl text-ink-500 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
          >
            <Search size={20} />
          </button>
        </div>
        <main className="px-4 py-5" style={{ isolation: 'isolate', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-2xl mx-auto">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Toaster
        position="top-center"
        containerStyle={{
          // Clear the sticky header (safe-area + header height) and sit above everything
          top: 'calc(env(safe-area-inset-top) + 72px)',
          zIndex: 9999,
        }}
        toastOptions={{
          className: '!font-sans !text-sm',
          style: {
            background: '#292524',
            color: '#FAF7F2',
            border: '1px solid #44403C',
            borderRadius: '12px',
          },
        }}
      >
        {t => (
          // Tap a toast to dismiss it. Taps on a button inside (e.g. "Edit") still work.
          <div onClick={e => { if (!e.target.closest('button')) toast.dismiss(t.id) }} className="cursor-pointer">
            <ToastBar toast={t} />
          </div>
        )}
      </Toaster>
      <ToastWatchdog />
    </>
  )
}
