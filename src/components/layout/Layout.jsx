import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { Toaster } from 'react-hot-toast'

export function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-paper-50 dark:bg-ink-900">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-5 md:px-6 md:py-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Bottom nav — mobile only */}
      <BottomNav />

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
    </div>
  )
}
