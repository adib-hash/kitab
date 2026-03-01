import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { useUIStore } from './store/uiStore'
import { Layout } from './components/layout/Layout'
import { Auth } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
import { Library } from './pages/Library'
import { BookDetail } from './pages/BookDetail'
import { TBR } from './pages/TBR'
import { Stats } from './pages/Stats'
import { Rank } from './pages/Rank'
import { Settings } from './pages/Settings'
import { Discover } from './pages/Discover'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    }
  }
})

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const { initDarkMode } = useUIStore()

  useEffect(() => {
    initDarkMode()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Loading state
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-paper-50 dark:bg-ink-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">📖</div>
          <p className="text-ink-400 text-sm">Loading Kitab...</p>
        </div>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Auth session={session} />} />
          <Route path="/" element={<ProtectedRoute session={session}><Dashboard /></ProtectedRoute>} />
          <Route path="/library" element={<ProtectedRoute session={session}><Library /></ProtectedRoute>} />
          <Route path="/library/:id" element={<ProtectedRoute session={session}><BookDetail /></ProtectedRoute>} />
          <Route path="/tbr" element={<ProtectedRoute session={session}><TBR /></ProtectedRoute>} />
          <Route path="/stats" element={<ProtectedRoute session={session}><Stats /></ProtectedRoute>} />
          <Route path="/rank" element={<ProtectedRoute session={session}><Rank /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute session={session}><Settings /></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute session={session}><Discover /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
