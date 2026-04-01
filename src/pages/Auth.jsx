import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Loader2 } from 'lucide-react'

export function Auth({ session }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'magic'
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMessage('Check your email for a magic link!')
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created! Check your email to verify.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

 async function handleGoogle() {
    const isNative = window.Capacitor?.isNativePlatform();
    
    if (isNative) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'com.kitab.app://login',
          skipBrowserRedirect: true,
        }
      });
      if (data?.url) {
        const { Browser } = await import('@capacitor/browser');
        
        // Listen for the app to reopen via the custom URL scheme
        const handleUrl = async (event) => {
          if (event.url?.startsWith('com.kitab.app://')) {
            const url = new URL(event.url.replace('com.kitab.app://', 'https://placeholder/'));
            // Extract tokens from the URL fragment
            const params = new URLSearchParams(event.url.split('#')[1] || event.url.split('?')[1] || '');
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            if (access_token) {
              await supabase.auth.setSession({ access_token, refresh_token });
            }
            await Browser.close();
          }
        };
        
        const { App } = await import('@capacitor/app');
        App.addListener('appUrlOpen', handleUrl);
        
        await Browser.open({ url: data.url });
      }
    } else {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` }
      });
    }
  }

  return (
    <div className="min-h-screen bg-paper-50 dark:bg-ink-900 flex items-center justify-center p-4">
      {/* Background texture */}
      <div className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #1C1917 40px, #1C1917 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #1C1917 40px, #1C1917 41px)'
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-700 rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl">📖</span>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-ink-900 dark:text-paper-50">Kitab</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Your personal reading life</p>
        </div>

        <div className="card p-6 space-y-4">
          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-paper-200 dark:border-ink-600 rounded-xl text-sm font-medium text-ink-700 dark:text-ink-300 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          <p className="text-[11px] text-ink-400 dark:text-ink-500 text-center -mt-1">
            Sign-in is secured by Supabase, our authentication provider
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-paper-200 dark:bg-ink-700" />
            <span className="text-xs text-ink-400">or</span>
            <div className="flex-1 h-px bg-paper-200 dark:bg-ink-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="section-label block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>

            {mode !== 'magic' && (
              <div>
                <label className="section-label block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={mode !== 'magic'}
                  minLength={6}
                  className="input"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && <p className="text-xs text-rose-600">{error}</p>}
            {message && <p className="text-xs text-teal-700">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : (
                mode === 'magic' ? 'Send Magic Link' :
                mode === 'signup' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs text-ink-500">
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="hover:text-teal-700 transition-colors">
              {mode === 'login' ? 'Create account' : 'Sign in instead'}
            </button>
            <button onClick={() => setMode(mode === 'magic' ? 'login' : 'magic')} className="hover:text-teal-700 transition-colors">
              {mode === 'magic' ? 'Use password' : 'Magic link'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
