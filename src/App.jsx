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
      staleTime: 1000 * 60 * 10,   // 10 min — data stays fresh longer
      gcTime:    1000 * 60 * 30,   // 30 min — keep cached data in memory
      refetchOnWindowFocus: false, // don't re-fetch just because you tabbed away
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
        <div className="flex flex-col items-center gap-6">
          {/* Stacked book spines — pure CSS, no images needed */}
          <div className="relative w-16 h-20" aria-hidden="true">
            {/* Back spine */}
            <div className="absolute bottom-0 left-2 w-10 h-16 rounded-sm"
              style={{ background: 'linear-gradient(135deg, #C4622D 0%, #E07A45 100%)',
                       transform: 'rotate(-6deg)', transformOrigin: 'bottom center',
                       boxShadow: '2px 4px 12px rgba(196,98,45,0.3)' }} />
            {/* Middle spine */}
            <div className="absolute bottom-0 left-3 w-10 h-18 rounded-sm"
              style={{ background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
                       height: 72, transform: 'rotate(-1deg)', transformOrigin: 'bottom center',
                       boxShadow: '2px 4px 12px rgba(15,118,110,0.3)' }} />
            {/* Front spine */}
            <div className="absolute bottom-0 left-5 w-10 h-20 rounded-sm"
              style={{ background: 'linear-gradient(135deg, #1A1614 0%, #3D3330 100%)',
                       boxShadow: '3px 6px 16px rgba(26,22,20,0.4)' }} />
            {/* Animated shimmer line on front spine */}
            <div className="absolute bottom-0 left-5 w-10 h-20 rounded-sm overflow-hidden">
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
                animation: 'kitab-shimmer 2s ease-in-out infinite',
              }} />
            </div>
          </div>

          {/* Wordmark */}
          <div className="flex flex-col items-center gap-1">
            <span style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: 'var(--color-ink-900, #1C1917)',
              lineHeight: 1,
            }}
            className="dark:[color:#FAF7F2]"
            >
              Kitab
            </span>
            <span style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#78716C',
            }}>
              your reading life
            </span>
          </div>

          {/* Animated ink dots */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                backgroundColor: '#0F766E',
                animation: `kitab-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>

        {/* Keyframes injected inline — no external CSS file needed at this point in boot */}
        <style>{`
          @keyframes kitab-shimmer {
            0%   { transform: translateX(-100%); }
            60%  { transform: translateX(200%); }
            100% { transform: translateX(200%); }
          }
          @keyframes kitab-pulse {
            0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
            40%            { opacity: 1;   transform: scale(1); }
          }
        `}</style>
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
