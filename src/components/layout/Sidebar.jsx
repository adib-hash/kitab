import { Link, useLocation } from 'react-router-dom'
import { BookOpen, List, BarChart2, Swords, Settings, Moon, Sun, ChevronLeft, BookMarked, Home, Search, Compass } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTags } from '../../hooks/useTags'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Dashboard' },
  { path: '/library', icon: BookOpen, label: 'Library' },
  { path: '/tbr', icon: BookMarked, label: 'To Be Read' },
  { path: '/stats', icon: BarChart2, label: 'Statistics' },
  { path: '/rank', icon: Swords, label: 'Rank' },
  { path: '/discover', icon: Compass, label: 'Discover' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

function NavItem({ item, collapsed }) {
  const location = useLocation()
  const active = item.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(item.path)

  return (
    <Link
      to={item.path}
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group',
        active
          ? 'bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 font-medium'
          : 'text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-ink-100'
      )}
    >
      <item.icon size={18} className={active ? 'text-teal-700 dark:text-teal-400' : 'text-ink-500 dark:text-ink-500 group-hover:text-ink-700'} />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="text-sm whitespace-nowrap overflow-hidden"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )
}

export function Sidebar({ onSearch }) {
  const { sidebarOpen, toggleSidebar, darkMode, toggleDarkMode, setLibraryFilters, clearLibraryFilters } = useUIStore()
  const { data: tags = [] } = useTags()
  const collapsed = !sidebarOpen

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex-shrink-0 h-screen sticky top-0 flex flex-col bg-white dark:bg-ink-900 border-r border-paper-200 dark:border-ink-700 overflow-hidden"
    >
      {/* Logo */}
      <div className={clsx('flex items-center px-4 py-5 border-b border-paper-200 dark:border-ink-700', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <BookOpen size={22} className="text-teal-600 dark:text-teal-400" />
            <Link to="/" className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 hover:text-teal-700 dark:hover:text-teal-400 transition-colors">Kitab</Link>
          </div>
        )}
        {collapsed && <BookOpen size={22} className="text-teal-600 dark:text-teal-400" />}
        {!collapsed && (
          <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800 text-ink-400 transition-colors">
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Search button */}
      <div className="px-2 pt-2">
        <button
          onClick={onSearch}
          className={clsx(
            "flex items-center gap-3 px-3 py-2 rounded-xl w-full transition-colors",
            "text-ink-500 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 border border-paper-200 dark:border-ink-700",
            collapsed ? "justify-center" : ""
          )}
        >
          <Search size={16} className="flex-shrink-0" />
          {!collapsed && (
            <span className="flex-1 text-sm text-left">Search...</span>
          )}
          {!collapsed && (
            <kbd className="text-[10px] text-ink-400 border border-paper-200 dark:border-ink-600 rounded px-1 font-mono">⌘K</kbd>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.path} item={item} collapsed={collapsed} />
        ))}

        {/* Tag quick filters - only when expanded */}
        {!collapsed && tags.length > 0 && (
          <div className="pt-4 pb-2">
            <p className="section-label px-3 mb-2">Tags</p>
            <div className="space-y-0.5">
              {tags.slice(0, 12).map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setLibraryFilters({ tags: [tag.id] })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors text-left"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#0F766E' }} />
                  <span className="truncate">{tag.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom controls */}
      <div className="px-2 py-3 border-t border-paper-200 dark:border-ink-700 space-y-0.5">
        {collapsed && (
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 rounded-xl text-ink-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
          >
            <ChevronLeft size={16} className="rotate-180" />
          </button>
        )}
        <button
          onClick={toggleDarkMode}
          className={clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800',
            collapsed ? 'w-full justify-center' : 'w-full'
          )}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span className="text-sm">{darkMode ? 'Light mode' : 'Dark mode'}</span>}
        </button>
      </div>
    </motion.aside>
  )
}
