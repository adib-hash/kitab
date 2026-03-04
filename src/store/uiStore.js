import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
  persist(
    (set, get) => ({
      // Library view
      libraryView: 'grid', // 'grid' | 'list'
      librarySort: 'date_finished_desc',
      libraryFilters: { status: [], tags: [], ratingMin: null },
      librarySearch: '',

      // Sidebar
      sidebarOpen: true,

      // Dark mode
      darkMode: true,

      // Reading goal
      readingGoal: null,

      // Libby library slug (OverDrive subdomain, e.g. "sfpl")
      librarySlug: 'sfpl',

      // Actions
      setLibraryView: (view) => set({ libraryView: view }),
      setLibrarySort: (sort) => set({ librarySort: sort }),
      setLibraryFilters: (filters) => set({ libraryFilters: { ...get().libraryFilters, ...filters } }),
      clearLibraryFilters: () => set({ libraryFilters: { status: [], tags: [], ratingMin: null } }),
      setLibrarySearch: (search) => set({ librarySearch: search }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      toggleDarkMode: () => {
        const next = !get().darkMode
        set({ darkMode: next })
        if (next) document.documentElement.classList.add('dark')
        else document.documentElement.classList.remove('dark')
      },
      initDarkMode: () => {
        // Apply dark class on load; default is dark unless user has toggled it off
        if (get().darkMode) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },
      setReadingGoal: (goal) => set({ readingGoal: goal }),
      setLibrarySlug: (slug) => set({ librarySlug: slug }),
    }),
    {
      name: 'kitab-ui',
      partialize: (state) => ({
        libraryView: state.libraryView,
        librarySort: state.librarySort,
        darkMode: state.darkMode,
        readingGoal: state.readingGoal,
        sidebarOpen: state.sidebarOpen,
        librarySlug: state.librarySlug,
      }),
    }
  )
)
