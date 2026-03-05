import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { GlobalSearch } from '../search/GlobalSearch'
import { Toaster } from 'react-hot-toast'

export function Layout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)

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
        {/* Mobile top bar with search */}
        <div className="sticky top-0 z-[150] flex items-center justify-between px-4 py-3 bg-paper-50/90 dark:bg-ink-900/90 backdrop-blur border-b border-paper-200 dark:border-ink-800">
          <Link to="/" className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">Kitab</Link>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-xl text-ink-500 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
          >
            <Search size={20} />
          </button>
        </div>
        <main className="px-4 py-5 pb-24" style={{ isolation: 'isolate' }}>
          <div className="max-w-2xl mx-auto">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Toaster
        position="top-center"
        toastOptions={{
          className: '!font-sans !text-sm',
          style: {
            background: '#292524',
            color: '#FAF7F2',
            border: '1px solid #44403C',
            borderRadius: '12px',
          },
        }}
      />
    </>
  )
}
