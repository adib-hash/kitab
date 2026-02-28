import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { Toaster } from 'react-hot-toast'

export function Layout({ children }) {
  return (
    <>
      {/* ── Desktop layout: sidebar + fixed-height scrollable main ── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-paper-50 dark:bg-ink-900">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile layout: body scrolls naturally ── */}
      <div className="md:hidden bg-paper-50 dark:bg-ink-900 min-h-screen">
        <main className="px-4 py-5 pb-24">
          <div className="max-w-2xl mx-auto">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>

      <Toaster
        position="top-center"
        toastOptions={{
          className: '!font-sans !text-sm',
          style: {
            background: 'white',
            color: '#1C1917',
            border: '1px solid #E8DDD0',
            borderRadius: '12px',
          },
        }}
      />
    </>
  )
}
