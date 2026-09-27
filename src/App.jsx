import { lazy, Suspense, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { supabase } from './lib/supabase'
import { useUIStore } from './store/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { startQueueReplay } from './lib/offlineQueue'

// localStorage-based persister — survives app restarts, works on both web and native.
//
// PersistQueryClientProvider calls persistClient on EVERY query-cache event
// (fetch start, success, new observer…), which on a page load is dozens of
// synchronous JSON.stringify + localStorage.setItem calls of the whole library.
// Writes are throttled to the trailing edge of a 1 s window; the latest
// snapshot always wins. A pending write is flushed when the tab is hidden,
// since iOS can background the app without giving us the 1 s.
const RQ_CACHE_KEY = 'kitab-rq-cache'
const PERSIST_THROTTLE_MS = 1000
let persistTimer = null
let pendingClient = null

function flushPersist() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
  if (!pendingClient) return
  try { localStorage.setItem(RQ_CACHE_KEY, JSON.stringify(pendingClient)) } catch {}
  pendingClient = null
}

const localStoragePersister = {
  persistClient: async (client) => {
    pendingClient = client
    if (!persistTimer) persistTimer = setTimeout(flushPersist, PERSIST_THROTTLE_MS)
  },
  restoreClient: async () => {
    try {
      const data = localStorage.getItem(RQ_CACHE_KEY)
      return data ? JSON.parse(data) : undefined
    } catch { return undefined }
  },
  removeClient: async () => {
    // Cancel any queued write too, or a snapshot of the previous user's cache
    // could land after sign-out.
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    pendingClient = null
    try { localStorage.removeItem(RQ_CACHE_KEY) } catch {}
  },
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersist()
  })
}
import { Layout } from './components/layout/Layout'
import { Auth } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
// Every other page is loaded on first visit. Dashboard stays eager because it
// is the landing route; the rest each pull in something heavy (recharts,
// react-markdown, dnd-kit, papaparse) that the landing page doesn't need.
// Pages are named exports, hence the .then() mapping.
const Library    = lazy(() => import('./pages/Library').then(m => ({ default: m.Library })))
const BookDetail = lazy(() => import('./pages/BookDetail').then(m => ({ default: m.BookDetail })))
const TBR        = lazy(() => import('./pages/TBR').then(m => ({ default: m.TBR })))
const Stats      = lazy(() => import('./pages/Stats').then(m => ({ default: m.Stats })))
const Rank       = lazy(() => import('./pages/Rank').then(m => ({ default: m.Rank })))
const Settings   = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Discover   = lazy(() => import('./pages/Discover').then(m => ({ default: m.Discover })))
const Highlights = lazy(() => import('./pages/Highlights').then(m => ({ default: m.Highlights })))
import { Modal, Button } from './components/ui/index.jsx'
import { ReviewModal } from './components/books/ReviewModal'
import { BookSearchModal } from './components/books/BookSearch'
import { BookForm } from './components/books/BookForm'
import { SharePreviewModal } from './components/books/SharePreviewModal'
import { App as CapacitorApp } from '@capacitor/app'

// How long the persisted cache is kept, on disk and in memory. TanStack's
// persister requires gcTime >= maxAge: entries garbage-collected from memory
// are dropped from the next persisted snapshot, so a shorter gcTime silently
// capped the on-disk cache at 24 h for anything not currently on screen.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst', // serve cache immediately when offline, don't pause
      retry: 1,
      staleTime: 1000 * 60 * 10,
      gcTime: CACHE_TTL_MS,
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
})

startQueueReplay(queryClient)

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={20} className="animate-spin text-ink-400" />
    </div>
  )
}

// The Suspense boundary sits inside Layout so the sidebar / bottom nav stay
// put while a page chunk loads; only the content area shows the spinner.
function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return (
    <Layout>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </Layout>
  )
}

function ReviewPrompt() {
  const { reviewPromptBook, clearReviewPromptBook } = useUIStore(useShallow(s => ({ reviewPromptBook: s.reviewPromptBook, clearReviewPromptBook: s.clearReviewPromptBook })))
  const [reviewOpen, setReviewOpen] = useState(false)
  if (!reviewPromptBook) return null
  return (
    <>
      <Modal open onClose={clearReviewPromptBook} size="md">
        <div className="p-6 space-y-4 text-center">
          <p className="font-serif text-lg text-ink-900 dark:text-paper-50">Want to write a review?</p>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            You just finished{' '}
            <span className="font-medium text-ink-900 dark:text-paper-50">{reviewPromptBook.title}</span>.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => { clearReviewPromptBook(); setReviewOpen(true) }}>
              Write Review
            </Button>
            <Button variant="ghost" onClick={clearReviewPromptBook}>Maybe Later</Button>
          </div>
        </div>
      </Modal>
      {reviewOpen && (
        <ReviewModal
          open
          onClose={() => setReviewOpen(false)}
          book={reviewPromptBook}
        />
      )}
    </>
  )
}

// Widgets link to kitab://library/<id> and kitab://stats. Only kitab://add
// (the share extension) was handled before, so tapping a widget just opened
// the app on whatever screen it was last on.
function DeepLinks() {
  const navigate = useNavigate()
  useEffect(() => {
    const handle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const m = url.match(/^kitab:\/\/(library|stats|highlights)(?:\/([^/?#]+))?/)
      if (!m) return
      if (m[1] === 'library' && m[2]) navigate(`/library/${m[2]}`)
      else navigate(`/${m[1]}`)
    })
    return () => { handle.then(h => h.remove()).catch(() => {}) }
  }, [navigate])
  return null
}

function OfflineBanner() {
  const { isOnline } = useNetworkStatus()
  if (isOnline) return null
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9990] flex items-center justify-center py-1.5 text-xs font-medium text-white"
      style={{ background: '#78716C', paddingTop: 'calc(env(safe-area-inset-top) + 0.375rem)' }}
    >
      Offline — viewing cached data
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [sharedUrl, setSharedUrl] = useState('')
  const [showSharePreview, setShowSharePreview] = useState(false)
  const [showShareSearch, setShowShareSearch] = useState(false)
  const [sharePreviewBook, setSharePreviewBook] = useState(null)
  const [showShareForm, setShowShareForm] = useState(false)
  const initDarkMode = useUIStore(s => s.initDarkMode)

  useEffect(() => {
    initDarkMode()
    // Session timeout: if getSession() hangs (e.g. no network), treat as logged out after 5s
    const timeout = setTimeout(() => {
      setSession(prev => prev === undefined ? null : prev)
    }, 5000)
    supabase.auth.getSession()
      .then(({ data: { session } }) => { clearTimeout(timeout); setSession(session) })
      .catch(() => { clearTimeout(timeout); setSession(null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Query keys aren't scoped per user, so without this the next account to
        // sign in on the same device would see the previous account's library
        // (in memory and from the persisted cache) until it went stale.
        queryClient.clear()
        localStoragePersister.removeClient()
      }
      setSession(session)
    })
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  // Handle deep links from the iOS Share Extension (kitab://add?url=...)
  useEffect(() => {
    const handle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (url.startsWith('kitab://add')) {
        try {
          const params = new URL(url)
          const incoming = params.searchParams.get('url') || ''
          setSharedUrl(incoming)
          setShowSharePreview(true)
        } catch {}
      }
    })
    return () => { handle.then(h => h.remove()).catch(() => {}) }
  }, [])

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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: localStoragePersister, maxAge: CACHE_TTL_MS }}
    >
      <BrowserRouter>
        <OfflineBanner />
        {session && <DeepLinks />}
        <Routes>
          <Route path="/login" element={<Auth session={session} />} />
          <Route path="/" element={<ProtectedRoute session={session}><Dashboard /></ProtectedRoute>} />
          <Route path="/library" element={<ProtectedRoute session={session}><Library /></ProtectedRoute>} />
          <Route path="/library/:id" element={<ProtectedRoute session={session}><BookDetail /></ProtectedRoute>} />
          <Route path="/tbr" element={<ProtectedRoute session={session}><TBR /></ProtectedRoute>} />
          <Route path="/stats" element={<ProtectedRoute session={session}><Stats /></ProtectedRoute>} />
          <Route path="/rank" element={<ProtectedRoute session={session}><Rank /></ProtectedRoute>} />
          <Route path="/highlights" element={<ProtectedRoute session={session}><Highlights /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute session={session}><Settings /></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute session={session}><Discover /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ReviewPrompt />

        {/* Share Extension add-book flow */}
        <SharePreviewModal
          open={showSharePreview}
          sharedUrl={sharedUrl}
          onClose={() => { setShowSharePreview(false); setSharedUrl('') }}
          onEditDetails={(book) => { setSharePreviewBook(book); setShowSharePreview(false); setShowShareForm(true) }}
          onFallback={() => { setShowSharePreview(false); setShowShareSearch(true) }}
        />
        <BookSearchModal
          open={showShareSearch}
          onClose={() => { setShowShareSearch(false); setSharedUrl('') }}
          onSelect={(book) => { setSharePreviewBook(book); setShowShareSearch(false); setShowShareForm(true) }}
          onManual={() => { setSharePreviewBook(null); setShowShareSearch(false); setShowShareForm(true) }}
          sharedUrl={sharedUrl}
        />
        <BookForm
          open={showShareForm}
          onClose={() => { setShowShareForm(false); setSharePreviewBook(null); setSharedUrl('') }}
          initialBook={sharePreviewBook}
        />
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}
