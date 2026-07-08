# Kitab — Claude Code Handoff Document

> This document is written for Claude Code running in the terminal. Reflects the actual codebase as of v2.8.0.

---

## 1. What is Kitab?

Kitab (Arabic/Urdu for "book") is a personal reading tracker web app + iOS native app built by Adib. It is intentionally a personal tool — not a product for others — built iteratively with Claude as an active development partner.

**Live URL:** https://kitab.ihsan.build  
**Current version:** v2.8.0  
**Stack:** React + Vite, Supabase (auth + DB), Tailwind CSS v3, Vercel, Capacitor iOS

---

## 2. Repository & Deployment

| Thing | Value |
|---|---|
| Local repo | `~/Documents/claude\ code/kitab` (lowercase 'c' in 'code') |
| Vercel project | Auto-deploys on `git push` to main |
| Supabase project | Managed via Supabase dashboard / MCP |
| Domain | `kitab.ihsan.build` (Namecheap DNS → Vercel) |

**Deploy workflow:**
```bash
git add src/ CHANGELOG.md
git commit -m "feat: description"
git push
# Then for iOS:
npm run build && npx cap sync ios
```

---

## 3. Project Structure

```
~/Documents/claude code/kitab/
├── api/
│   ├── recommend.js             # Vercel serverless: Claude recommendations
│   └── readwise-sync.js         # Vercel serverless: Readwise v2 API proxy
├── src/
│   ├── components/
│   │   ├── books/
│   │   │   ├── BookCard.jsx     # Grid card; status dot top-left for non-read books
│   │   │   ├── BookCover.jsx    # Cover image with SVG fallback spine
│   │   │   ├── BookForm.jsx     # Add/edit modal; tbr_note field when status=tbr
│   │   │   ├── BookSearch.jsx   # Google Books search modal
│   │   │   ├── BookRow.jsx      # List-view row for Library
│   │   │   ├── ReviewModal.jsx  # Standalone review editor
│   │   │   ├── StarRating.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   └── TagInput.jsx
│   │   ├── library/
│   │   │   └── LibraryFilters.jsx  # Status + ratingMin + tags filter panel
│   │   ├── layout/
│   │   │   ├── Layout.jsx       # App shell — sidebar + bottom nav
│   │   │   ├── Sidebar.jsx      # Desktop nav (includes Highlights link)
│   │   │   └── BottomNav.jsx    # Mobile bottom nav (5 tabs)
│   │   ├── search/
│   │   │   └── GlobalSearch.jsx  # ⌘K full-library search overlay
│   │   └── ui/
│   │       ├── index.jsx         # Button, Modal, StatCard, ProgressBar, EmptyState, BookCardSkeleton
│   │       └── QuickActionsSheet.jsx  # Long-press sheet (status, rating, tags, review)
│   ├── hooks/
│   │   ├── useBodyScrollLock.js # Shared scroll-lock hook (used by Modal, QuickActionsSheet, GlobalSearch)
│   │   ├── useLibrary.js        # CRUD for books table (useBook, useAddBook, useUpdateBook, useDeleteBook, useReorderTBR)
│   │   ├── useTags.js           # Tags CRUD + useReadingGoal + useSetReadingGoal
│   │   ├── useHighlights.js     # useAllHighlights, useHighlights, useHighlightCount, useDeleteHighlight
│   │   ├── useKindleSyncFlow.js # iOS Kindle highlights sync orchestration
│   │   ├── useDiscoverRecs.js   # LLM recommendation fetching
│   │   └── useLongPress.js      # Long press gesture hook
│   ├── lib/
│   │   ├── supabase.js          # Supabase client
│   │   ├── googleBooks.js       # Google Books API search
│   │   ├── utils.js             # computeStats(), formatDate(), daysBetween(), pluralize()
│   │   ├── haptics.js           # Capacitor haptics wrappers (impactLight/Medium, notifySuccess/Warning)
│   │   ├── offlineQueue.js      # Offline write queue
│   │   ├── notifications.js     # Local notifications (iOS)
│   │   └── widgetBridge.js      # iOS widget data sync
│   ├── pages/
│   │   ├── Auth.jsx
│   │   ├── Dashboard.jsx        # Today's highlight (date-seeded), reading goal, stats, anniversary card
│   │   ├── Library.jsx          # Grid/list view, filters, inline sort select
│   │   ├── BookDetail.jsx       # Full book page at /library/:id; styled delete confirm modal; wiki_url cache
│   │   ├── Highlights.jsx       # All highlights at /highlights; search + book filter + grouped view
│   │   ├── Stats.jsx            # Year selector (dynamic from data + "All time") + avgDaysToFinish + topAuthor
│   │   ├── TBR.jsx              # Drag-to-reorder; swipe right=start, left=remove; tbr_note shown
│   │   ├── Discover.jsx         # LLM recommendations (3 sections)
│   │   ├── Rank.jsx             # ELO pairwise ranking; tag filter chips
│   │   └── Settings.jsx         # Tags, import/export, Readwise sync, library overview
│   ├── store/
│   │   └── uiStore.js           # Zustand: darkMode, libraryView, librarySort, libraryFilters (incl. ratingMin), librarySearch
│   └── App.jsx                  # Routes + ProtectedRoute; includes /highlights
├── CHANGELOG.md
└── index.html
```

---

## 4. Supabase Schema

### `books` table
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| title | text | |
| author | text | |
| status | text | `'tbr'`, `'reading'`, `'read'`, `'dnf'` |
| rating | int | 1–5, nullable |
| review | text | Markdown |
| review_spoiler | bool | |
| page_count | int | nullable |
| current_page | int | nullable |
| date_finished | text | `YYYY-MM-01` (month+year only) |
| date_started | text | Legacy |
| published_year | int | nullable |
| description | text | nullable |
| cover_url | text | nullable |
| google_books_id | text | nullable |
| tbr_order | int | nullable (drag-to-reorder) |
| tbr_note | text | nullable — "Why this book?" free text (max 120 chars in UI) |
| wiki_url | text | nullable — cached Wikipedia URL (avoids repeat API calls) |
| elo | int | nullable — ELO rank score (default 1500 in UI) |
| elo_wins | int | nullable |
| elo_losses | int | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `tags` + `book_tags` + `reading_goals` + `highlights` — see existing schema

---

## 5. Key Architectural Decisions

### Tailwind dark mode
`dark:` classes are fully safe with Vite + Tailwind v3 JIT — classes included in build as long as they appear literally in source files. Do NOT use inline styles or MutationObserver to work around dark mode. Write `dark:text-paper-50`, `dark:bg-ink-800`, etc. directly.

### Scroll lock
All overlays (Modal, QuickActionsSheet, GlobalSearch) use the `useBodyScrollLock(active)` hook from `src/hooks/useBodyScrollLock.js`. It uses `position: fixed` + scroll save/restore — never `overflow: hidden`.

### Date storage
`date_finished` stored as `YYYY-MM-01`. Never use `new Date(dateStr)` — use `parseInt(dateStr.slice(0, 4))` for year.

### Wikipedia caching
BookDetail resolves Wikipedia URL via API, then saves to `book.wiki_url` via `updateBook.mutate()`. On subsequent loads it skips the API call if `book.wiki_url` is populated.

### ratingMin filter
`libraryFilters.ratingMin` is in the Zustand store. LibraryFilters.jsx shows "Any / 3+ / 4+ / 4.5+" pills. Library.jsx filters by `(b.rating || 0) >= ratingMin`.

---

## 6. Version Convention

Every deploy must:
1. Update `CHANGELOG.md` — prepend new entry following existing format
2. Update version string in `src/pages/Settings.jsx` — appears once as `Kitab · vX.X.X`
3. Commit and push

---

## 7. iOS Capacitor Notes

- Sync after code changes: `npm run build && npx cap sync ios`, then rebuild in Xcode
- Inputs must have `style={{ fontSize: '16px' }}` (iOS auto-zoom prevention)
- `useBodyScrollLock` handles scroll lock — never `overflow: hidden`
- Haptics: `impactLight/Medium`, `notifySuccess/Warning` from `src/lib/haptics.js`
- `@capacitor/haptics` fire-and-forget — no-ops on web

---

## 8. API Keys & External Services

All secrets in Vercel environment variables — never hardcoded.

| Variable | Used in | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/recommend.js` | Claude recommendations |
| `VITE_SUPABASE_URL` | Frontend | Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase client |

Readwise token: stored in `localStorage` as `rw_token` — user-provided.
