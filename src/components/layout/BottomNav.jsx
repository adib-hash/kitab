import { Link, useLocation } from 'react-router-dom'
import { Home, BookOpen, BookMarked, Compass, Swords } from 'lucide-react'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/library', icon: BookOpen, label: 'Library' },
  { path: '/tbr', icon: BookMarked, label: 'TBR' },
  { path: '/discover', icon: Compass, label: 'Discover' },
  { path: '/rank', icon: Swords, label: 'Rank' },
]

export function BottomNav() {
  const location = useLocation()

  function handleNavTap(e, itemPath, isActive) {
    if (isActive) {
      // Already on this page — scroll to top instead of navigating
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[200] bg-white dark:bg-ink-900 border-t border-paper-200 dark:border-ink-700 flex items-stretch md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV_ITEMS.map(item => {
        const active = item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path)
        return (
          <Link
            key={item.path}
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            to={item.path}
            onClick={e => handleNavTap(e, item.path, active)}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors',
              active
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-ink-400 dark:text-ink-500'
            )}
          >
            <item.icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
