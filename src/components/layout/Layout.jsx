import { Sidebar } from './Sidebar'
import { Toaster } from 'react-hot-toast'

export function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-paper-50 dark:bg-ink-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
      <Toaster
        position="bottom-right"
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
