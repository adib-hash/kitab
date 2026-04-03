# Kitab — Claude Code Handoff Document

> This document is written for Claude Code running in the terminal. It contains everything needed to continue development of Kitab without prior context.

---

## 1. What is Kitab?

Kitab (Arabic/Urdu for "book") is a personal reading tracker web app built by Adib as a solo project. It is intentionally a personal tool — not a product for others — built iteratively with Claude as an active development partner.

**Live URL:** https://kitab.ihsan.build  
**Current version:** v2.5.0  
**Stack:** React + Vite, Supabase (auth + DB), Tailwind CSS, Vercel

---

## 2. Repository & Deployment

| Thing | Value |
|---|---|
| Local repo | `~/Documents/Claude Code/kitab` |
| Vercel project | Auto-deploys on `git push` to main |
| Supabase project | Managed via Supabase dashboard |
| Domain | `kitab.ihsan.build` (Namecheap DNS → Vercel) |

**Deploy workflow (always):**
```bash
cd ~/Documents/Claude\ Code/kitab
git add -A
git commit -m "vX.X.X: description"
git push
```
Vercel picks up the push and rebuilds in ~30s.

---

## 3. Project Structure

```
~/Documents/Claude Code/kitab/
├── api/
│   ├── recommend.js          # Vercel serverless: proxies Claude API for recommendations
│   └── readwise-sync.js      # Vercel serverless: proxies Readwise v2 API
├── src/
│   ├── components/
│   │   ├── books/
│   │   │   ├── BookCard.jsx       # Grid/list card, links to /library/:id
│   │   │   ├── BookCover.jsx      # Cover image with fallback spine
│   │   │   ├── BookForm.jsx       # Add/edit modal (no date_started, month+year dropdowns)
│   │   │   ├── BookSearch.jsx     # Google Books search modal
│   │   │   ├── QuickActions.jsx   # Long-press context menu
│   │   │   └── StarRating.jsx
│   │   └── UI/                   # NOTE: capital UI, not lowercase ui
│   │       ├── index.jsx          # Exports: Button, StatCard, ProgressBar, EmptyState, Divider
│   │       ├── BottomNav.jsx      # Mobile bottom nav (5 tabs)
│   │       └── LoadingScreen.jsx  # Branded CSS loading screen (book spines + Kitab wordmark)
│   ├── hooks/
│   │   ├── useLibrary.js          # CRUD for books table
│   │   ├── useTags.js             # Tags CRUD + reading goal
│   │   ├── useHighlights.js       # Kindle highlights queries + Readwise sync orchestration
│   │   └── useDiscoverRecs.js     # LLM recommendation fetching
│   ├── lib/
│   │   ├── supabase.js            # Supabase client
│   │   ├── googleBooks.js         # Google Books API search
│   │   ├── openLibrary.js         # Open Library API (used in Discover)
│   │   └── utils.js               # computeStats(), formatDate(), daysBetween(), buildGoodreadsCSV()
│   ├── pages/
│   │   ├── Auth.jsx
│   │   ├── Dashboard.jsx          # At a Glance (year-scoped), TBR shuffle, Currently Reading
│   │   ├── Library.jsx            # Grid/list view with filters
│   │   ├── BookDetail.jsx         # Full book page at /library/:id — NOT a modal
│   │   ├── Stats.jsx              # Year-scoped stats with tag breakdown
│   │   ├── TBR.jsx                # Drag-to-reorder TBR list
│   │   ├── Discover.jsx           # LLM-powered recommendations (3 sections)
│   │   ├── Rank.jsx               # ELO pairwise ranking
│   │   └── Settings.jsx           # Tags, import/export, Readwise sync, library overview
│   ├── store/
│   │   └── uiStore.js             # Zustand: dark mode, library view, librarySlug
│   └── App.jsx                    # Routes + ProtectedRoute wrapper
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
| current_page | int | nullable (for reading progress) |
| date_finished | text | Stored as `YYYY-MM-01` (month+year only, no day) |
| date_started | text | Legacy column, no longer collected in UI |
| published_year | int | nullable |
| description | text | nullable |
| cover_url | text | nullable |
| google_books_id | text | nullable |
| tbr_order | int | nullable (drag-to-reorder position) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `tags` table
| Column | Type |
|---|---|
| id | uuid PK |
| user_id | uuid |
| name | text |
| color | text (hex) |

### `book_tags` table (junction)
| Column | Type |
|---|---|
| book_id | uuid FK |
| tag_id | uuid FK |

### `reading_goals` table
| Column | Type |
|---|---|
| id | uuid PK |
| user_id | uuid |
| year | int |
| target | int |

### `highlights` table
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| book_id | uuid | FK → books, **nullable** (null = unmatched) |
| readwise_id | int | UNIQUE — prevents duplicate syncs |
| text | text | The highlight text |
| note | text | nullable |
| location | int | nullable |
| book_title | text | Readwise book title (for unmatched review) |
| book_author | text | nullable |
| highlighted_at | timestamptz | nullable |
| synced_at | timestamptz | default now() |

All tables have RLS enabled. Users can only read/write their own rows.

---

## 5. Key Architectural Decisions

### Date storage
`date_finished` is stored as `YYYY-MM-01` (always day=01). The UI collects only Month + Year via dropdowns. **Never use `new Date(dateStr).getFullYear()`** — this causes January dates to shift to the prior year in US timezones. Always use:
```js
parseInt(dateStr.slice(0, 4))
```

### Stats are year-scoped
`computeStats(books)` in `utils.js` takes a **pre-filtered** array. Callers (Stats.jsx, Dashboard.jsx) filter to the current year before calling it:
```js
const yearBooks = books.filter(b =>
  b.status === 'read' && b.date_finished &&
  parseInt(b.date_finished.slice(0, 4)) === thisYear
)
const stats = computeStats(yearBooks)
```
`computeStats` returns: `{ totalRead, totalPages, avgRating, booksPerMonth, tagBreakdown, longest, shortest }`

### BookDetail is a page, not a modal
Route: `/library/:id` → `<BookDetail />`. Books are navigated to via `<Link to="/library/:id">` in BookCard. There is no modal for book detail.

### iOS / mobile constraints
- Drag-to-reorder (TBR) uses `MouseSensor` not `PointerSensor` — PointerSensor breaks on iOS
- Scroll lock uses `position: fixed` with scroll position save/restore — not `overflow: hidden`
- All inputs have `style={{ fontSize: '16px' }}` to prevent iOS auto-zoom
- Touch-action: drag handles must not have `touchAction: 'pan-y'` on parent elements

### Tailwind purging
Tailwind only includes CSS classes it finds at **build time** in source files. Dynamic class names (constructed at runtime) get purged. If a dark mode class like `dark:text-paper-100` isn't used elsewhere, it won't be in the compiled CSS. **Use inline styles** for any colors that might not be covered by existing usage, particularly in dynamically-rendered components.

### Patching strategy
Writing **complete files from scratch** is more reliable than string replacement. String replacement has historically mangled `className` strings and broken rendering. When targeted replacement is necessary:
1. Read full file first with `cat`
2. Confirm exact string exists with `grep`
3. Use Python's `str.replace()` with `count=1`

---

## 6. Version Convention

Every deploy must:
1. Update `CHANGELOG.md` — prepend new entry following existing format
2. Update version string in `src/pages/Settings.jsx` — appears **once** at the bottom of the `Settings` component as `Kitab · vX.X.X`
3. `git add -A && git commit -m "vX.X.X: description" && git push`

Current version: **v2.5.0**

---

## 7. Feature Inventory

### ✅ Implemented

| Feature | Notes |
|---|---|
| Auth | Supabase email/password |
| Library | Grid + list view, filter by status/tag/rating/search |
| Add/Edit book | Google Books search + manual entry, covers, tags, rating, review, month+year finish date |
| Book Detail | `/library/:id` — full page with metadata, review, description, similar books, Kindle highlights |
| TBR | Drag-to-reorder list, shuffle pick modal |
| Stats | Year-scoped: books/pages/rating, tag breakdown pie+bar, monthly chart, reading goal |
| Dashboard | At a Glance (year stats), Currently Reading, TBR preview |
| Discover | LLM-powered recommendations via Claude API (3 sections: author, genre, stretch) |
| Rank | ELO pairwise ranking system, synced to Supabase |
| Settings | Tag management, Goodreads import/export, library overview, Readwise sync |
| Readwise sync | Vercel proxy → Readwise v2 API, fuzzy title matching, unmatched review queue |
| Kindle Highlights | Collapsible section on BookDetail, lazy-loaded, count badge |
| Loading screen | Branded CSS: stacked book spines + Playfair Display wordmark + teal dots |
| Dark mode | Default on, toggle in Settings, persisted in Zustand |
| Libby integration | "Check Libby" button on BookDetail if library slug configured in Settings |

### 🔲 Identified but not built

| Feature | Notes |
|---|---|
| Better AI recs | Current prompt only sends title/author/rating — reviews and tags are unused signal |
| Logo | Three concepts designed (The Flourish, The Mark, The Spine) — Round 02 not started |
| "Open in Kindle Store" | Deep link button on BookDetail |
| "On My Kindle" flag | Status indicator on books |
| Send-to-Kindle | Via Supabase Edge Function + email (Resend API) |
| Readwise sync via Readwise API | Alternative to CSV parsing |

---

## 8. API Keys & External Services

All secrets live in **Vercel environment variables** — never hardcoded.

| Variable | Used in | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/recommend.js` | Claude recommendations |
| `VITE_SUPABASE_URL` | Frontend | Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase client |

Readwise token: stored in **`localStorage`** as `rw_token` — user-provided, never sent to Supabase.

---

## 9. Known Issues & Recent Bug History

| Version | Bug | Fix |
|---|---|---|
| v1.6.7 | Dashboard.jsx had `require ? undefined : undefined` — invalid in Vite/ESM, broke entire build (all pages broken) | Removed in v1.6.8 hotfix |
| v1.6.8 | HighlightsSection component injection silently failed — component never added to BookDetail | Fixed in v1.6.9/v1.6.10 |
| v1.6.9 | Highlight cards invisible in dark mode — Tailwind purged `dark:text-paper-100` and `dark:bg-teal-900/20` | v1.6.10: switched to inline styles |
| v1.6.5 | iOS auto-zoom on input focus | `font-size: 16px` on all inputs |
| v1.6.4 | String replacement mangled className strings | Established "write full files" rule |
| v1.6.2 | TBR drag broken on iOS | `MouseSensor` instead of `PointerSensor` |
| v1.6.1 | iOS scroll lock broke page position | `position: fixed` + scroll save/restore |

### Active issue (v1.6.10)
Kindle Highlights dark mode text is **still not confirmed fixed**. The v1.6.10 script switched to inline styles with `isDark` detected via `document.documentElement.classList.contains('dark')`. However, `isDark` is computed once at render time (not reactive). If this is still broken, the fix is to use a `useState` + `useEffect` with a `MutationObserver` on `document.documentElement` to watch for the `dark` class toggling:

```jsx
const [isDark, setIsDark] = useState(
  document.documentElement.classList.contains('dark')
)
useEffect(() => {
  const obs = new MutationObserver(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  })
  obs.observe(document.documentElement, { attributeFilter: ['class'] })
  return () => obs.disconnect()
}, [])
```

---

## 10. Design Language

- **Font:** Playfair Display (serif, headings) + system sans-serif (body)
- **Colors:** Teal primary (`teal-600`/`teal-700`), Amber accents, Stone/Ink neutrals, Paper background
- **Dark mode:** `dark` class on `<html>` (Tailwind class strategy)
- **CSS custom properties used:** `--color-ink-*`, `--color-paper-*`, `--color-teal-*`
- **Card style:** `.card` utility class — rounded-xl, subtle shadow, paper background
- **Spacing:** `pb-8` on all scrollable page containers to clear the mobile bottom nav

---

## 11. Readwise Sync — How it works

1. User pastes token from readwise.io/access_token into Settings
2. Token saved to `localStorage` as `rw_token`
3. "Sync Highlights" button calls `useReadwiseSync()` mutation
4. Hook POSTs to `/api/readwise-sync` (Vercel serverless) with `action: 'verify'`
5. Then fetches all Readwise books (`action: 'books'`)
6. For each book, fetches highlights (`action: 'highlights', bookId: rwBookId`)
7. Fuzzy-matches Readwise book titles to Kitab library (4 passes: exact, prefix, reverse prefix, author+prefix)
8. Upserts rows into `highlights` table — `readwise_id` unique constraint prevents duplicates
9. Unmatched books → `book_id = null` → appear in Settings review queue for manual linking
10. Sync is fully idempotent — safe to re-run

---

## 12. Claude Recommendations — How it works

`api/recommend.js` is a Vercel serverless function that:
- Receives the user's library (top 20 books by rating, title/author/rating only)
- Sends to `claude-haiku-*` with a prompt asking for 9 recommendations (3 sections × 3 books)
- Returns structured JSON parsed from the response
- Frontend (`useDiscoverRecs.js`) handles display, session history, and dedup against library

**Known improvement:** The prompt currently only sends title, author, and star rating. Including `review` text and `tags` would significantly improve recommendation quality.

---

## 13. Environment Setup (if starting fresh)

```bash
cd ~/Downloads/kitab
npm install
npm run dev        # Local dev at localhost:5173
npm run build      # Production build check
```

Supabase migration for highlights (run in Supabase SQL Editor):
```sql
create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  book_id uuid references books(id) on delete set null,
  readwise_id bigint unique not null,
  text text not null,
  note text,
  location int,
  book_title text,
  book_author text,
  highlighted_at timestamptz,
  synced_at timestamptz default now()
);

alter table highlights enable row level security;

create policy "Users see own highlights" on highlights
  for select using (auth.uid() = user_id);
create policy "Users insert own highlights" on highlights
  for insert with check (auth.uid() = user_id);
create policy "Users update own highlights" on highlights
  for update using (auth.uid() = user_id);

create index highlights_book_id_idx on highlights(book_id);
create index highlights_user_unmatched_idx on highlights(user_id) where book_id is null;
```
