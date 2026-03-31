# Kitab -- Personal Reading Tracker

Your personal reading life, beautifully organized. Track books you've read, manage your TBR pile, rate and review, sync Kindle highlights, rank your favorites, and discover what to read next -- available as a web app and native iOS app at [kitab.ihsan.build](https://kitab.ihsan.build).

**Current version:** v2.4.0

---

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **State**: Zustand + TanStack React Query (with offline cache persistence)
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Row Level Security)
- **Hosting**: Vercel (web) + Capacitor (iOS native)
- **Book Data**: Google Books API + Open Library (fallback covers)
- **Recommendations**: Anthropic Claude API (via Vercel serverless function)
- **Icons**: Lucide React (all SVG, no emoji)
- **Charts**: Recharts
- **Barcode Scanning**: @zxing/browser
- **Haptics**: @capacitor/haptics (iOS)
- **Offline**: vite-plugin-pwa (service worker), React Query cache persistence, @capacitor/network

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** -> New Query -> paste contents of `supabase-schema.sql` -> Run
3. Run `supabase-elo-migration.sql` for the ELO ranking tables
4. In **Authentication -> Providers**, enable Google OAuth (requires Google Cloud Console OAuth credentials)
5. In **Authentication -> URL Configuration**, add:
   - Site URL: `https://kitab.ihsan.build`
   - Redirect URL: `https://kitab.ihsan.build/**`
6. Copy your **Project URL** and **anon public key** from Settings -> API

### 2. Google Books API (optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the **Books API**
3. Create an API key (restrict to Books API for security)

### 3. Local Development

```bash
# Clone the repo
git clone <your-repo-url> kitab
cd kitab

# Install dependencies
npm install

# Create your .env.local
cp .env.example .env.local
# Fill in your Supabase URL, anon key, and Google Books API key

# Start dev server
npm run dev
# -> http://localhost:5173
```

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_BOOKS_API_KEY
# ANTHROPIC_API_KEY (for recommendations -- server-side only, no VITE_ prefix)
```

### 5. iOS Native App (Capacitor)

```bash
# Build the web app
npm run build

# Sync with Capacitor
npx cap sync ios

# Open in Xcode
npx cap open ios
```

The iOS app includes native haptic feedback, cover caching to the filesystem, Kindle highlights sync via in-app browser, and a Share Extension for adding books from Safari/Amazon/Goodreads.

### 6. Custom Domain (kitab.ihsan.build)

1. In Vercel project -> Settings -> Domains -> add `kitab.ihsan.build`
2. In your DNS provider, add:
   ```
   CNAME  kitab  cname.vercel-dns.com
   ```
3. Vercel auto-provisions SSL

---

## Features

| Feature | Details |
|---|---|
| Book search | Google Books API with barcode scanner (ISBN via camera) |
| Library | Grid + list views with filters by status, tag, rating, and search |
| Half-star ratings | 0.5--5.0 scale |
| Reviews | Dedicated full-screen ReviewModal with auto-save drafts and spoiler flag |
| Tags | Autocomplete, create-on-fly, managed in Settings |
| TBR list | Drag-and-drop ordering, shuffle pick, swipe actions |
| Book detail page | Full metadata, review, Kindle highlights, similar books, external links |
| Dashboard | Currently reading, reading goal, highlight of the day, Kindle sync (iOS) |
| Reading progress | Page-level tracking for currently reading books |
| Reading statistics | Year-scoped stats, tag breakdown, monthly chart, reading goal tracking |
| Annual reading goal | With gradient progress bar |
| ELO pairwise ranking | Rank page -- compare two books, see leaderboard |
| Global search | Search across entire library from any page, with "add to library" fallback |
| AI recommendations | Claude-powered, uses reviews + Kindle highlights for context |
| Kindle Highlights sync (iOS) | Scrapes read.amazon.com via in-app browser, auto-matches to library |
| Kindle Highlights display | Collapsible per-book section on BookDetail, deletable highlights |
| Highlight of the day | Random highlight on Home page with shuffle |
| iOS Share Extension | Share from Safari/Amazon/Goodreads to add a book with smart preview |
| Barcode scanning | Scan ISBN on back cover to add a book |
| QuickActionsSheet | Long-press context menu with status change, finish date, review |
| Enrich Library | Batch-update metadata and covers via Google Books + Open Library fallback |
| External links | Amazon + Wikipedia links on BookDetail (with Libby option) |
| Goodreads CSV import | One-time migration from Goodreads |
| Export CSV + JSON | Full library export |
| Offline mode | React Query cache persistence, service worker (web), native cache (iOS) |
| Native haptic feedback | iOS only -- nav taps, star ratings, actions, drag |
| Native cover caching | iOS filesystem cache for instant offline cover loading |
| Dark mode | Default on, toggle in Settings |
| Mobile responsive | Mobile-first PWA, bottom nav, safe area support |
| Settings | Version display, tag management, Kindle sync, import/export |

---

## Project Structure

```
kitab/
├── api/
│   ├── recommend.js          # Vercel serverless: proxies Claude API for recommendations
│   ├── recommendations.js    # Vercel serverless: recommendation endpoint
│   └── resolve-url.js        # Vercel serverless: URL resolution for Share Extension
├── ios/                      # Capacitor iOS native project (Xcode)
├── src/
│   ├── components/
│   │   ├── books/
│   │   │   ├── BarcodeScannerModal.jsx  # ISBN barcode camera scanner
│   │   │   ├── BookCard.jsx       # Grid card (React.memo optimized)
│   │   │   ├── BookCover.jsx      # Cover image with native cache + fallback spine
│   │   │   ├── BookForm.jsx       # Add/edit modal
│   │   │   ├── BookRow.jsx        # List row (React.memo optimized)
│   │   │   ├── BookSearch.jsx     # Google Books search modal
│   │   │   ├── ReviewModal.jsx    # Full-screen review editor with auto-save drafts
│   │   │   ├── SharePreviewModal.jsx  # Share Extension book preview
│   │   │   ├── StarRating.jsx     # Half-star rating input
│   │   │   ├── StatusBadge.jsx    # CSS-styled status indicators
│   │   │   └── TagInput.jsx       # Tag autocomplete + create
│   │   ├── discover/
│   │   │   ├── BookPreviewModal.jsx
│   │   │   ├── DiscoverSection.jsx
│   │   │   ├── QueryFlow.jsx
│   │   │   ├── RecBookCard.jsx
│   │   │   ├── RecDetailModal.jsx
│   │   │   └── RecommendationCard.jsx
│   │   ├── layout/
│   │   │   ├── BottomNav.jsx      # Mobile bottom nav
│   │   │   ├── Layout.jsx         # App shell with safe area support
│   │   │   └── Sidebar.jsx        # Desktop sidebar
│   │   ├── library/
│   │   │   └── LibraryFilters.jsx # Status/tag/rating/search filters
│   │   ├── search/
│   │   │   └── GlobalSearch.jsx   # Cross-library search overlay
│   │   └── ui/
│   │       ├── index.jsx          # Button, StatCard, ProgressBar, EmptyState, Divider
│   │       └── QuickActionsSheet.jsx  # Long-press context menu
│   ├── hooks/
│   │   ├── useDiscover.js         # Discover page data
│   │   ├── useHighlights.js       # Kindle highlights queries + upsert
│   │   ├── useKindleSyncFlow.js   # Shared Kindle sync logic (Settings + Home)
│   │   ├── useLibrary.js          # CRUD for books table
│   │   ├── useLongPress.js        # Long-press gesture detection
│   │   ├── useNetworkStatus.js    # Online/offline detection
│   │   ├── useRecommendations.js  # LLM recommendation fetching
│   │   └── useTags.js             # Tags CRUD + reading goal
│   ├── lib/
│   │   ├── coverCache.js          # Native filesystem cover caching (iOS)
│   │   ├── googleBooks.js         # Google Books API search
│   │   ├── haptics.js             # Native haptic feedback (no-op on web)
│   │   ├── offlineQueue.js        # Offline mutation queue
│   │   ├── openLibrary.js         # Open Library API (covers + enrichment)
│   │   ├── supabase.js            # Supabase client
│   │   └── utils.js               # computeStats(), formatDate(), CSV builders
│   ├── pages/
│   │   ├── Auth.jsx               # Login page
│   │   ├── BookDetail.jsx         # Full book page at /library/:id
│   │   ├── Dashboard.jsx          # Home: stats, currently reading, highlight of the day
│   │   ├── Discover.jsx           # AI-powered book discovery
│   │   ├── Library.jsx            # Grid/list view with filters
│   │   ├── Rank.jsx               # ELO pairwise ranking
│   │   ├── Recommendations.jsx    # Recommendation results
│   │   ├── Settings.jsx           # Version, tags, Kindle sync, import/export
│   │   ├── Stats.jsx              # Year-scoped reading statistics
│   │   └── TBR.jsx                # Drag-to-reorder TBR list
│   ├── store/
│   │   └── uiStore.js             # Zustand: dark mode, library view, librarySlug
│   └── App.jsx                    # Routes + ProtectedRoute wrapper
├── capacitor.config.json          # Capacitor iOS config
├── supabase-schema.sql            # Core database schema
├── supabase-elo-migration.sql     # ELO ranking tables
├── CHANGELOG.md
└── vite.config.js
```

---

## Recommendations API

The AI recommendations feature calls Claude via a Vercel serverless function (`/api/recommend.js`). This keeps your `ANTHROPIC_API_KEY` server-side and never exposes it to the browser.

The prompt includes the user's top-rated books (title, author, rating), review excerpts from 4-star+ books, and up to 12 Kindle highlights -- giving Claude rich context for personalized recommendations.

You must set `ANTHROPIC_API_KEY` as an **environment variable in Vercel** (not in `.env.local`).

---

## Kindle Highlights Sync

### iOS (primary)
1. User taps "Sync Kindle Highlights" in Settings or on the Home page
2. An in-app browser opens `read.amazon.com/kp/notebook`
3. User signs into Amazon (session persists for future syncs)
4. An injected scraper scrolls to load all books, clicks each one, paginates through highlights, and extracts them
5. A sticky banner shows progress inside the browser; the browser closes automatically when done
6. Highlights are fuzzy-matched to the user's Kitab library and upserted into Supabase
7. Unmatched books appear in a review queue with a searchable combobox for manual linking
8. Last sync time is tracked and a 7-day reminder banner appears on the Home page

### Web
The My Clippings.txt file upload was removed in v2.2.0. Kindle sync is iOS-only via the in-app browser.

---

## Database Schema

See `supabase-schema.sql` and `supabase-elo-migration.sql` for the complete schema. Tables:

- `books` -- core library with all metadata and user data
- `tags` -- tag registry (name + color)
- `book_tags` -- many-to-many join
- `reading_goals` -- annual targets
- `highlights` -- Kindle highlights linked to books (nullable book_id for unmatched)
- `skipped_recommendations` -- tracks swiped-left recommendation books
- `elo_rankings` -- ELO scores per book for pairwise ranking
- `elo_comparisons` -- history of pairwise comparison results

All tables have Row Level Security enabled so only authenticated users can access their own data.

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (.env.local) | Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend (.env.local) | Supabase client |
| `VITE_GOOGLE_BOOKS_API_KEY` | Frontend (.env.local) | Google Books search |
| `ANTHROPIC_API_KEY` | Vercel only (server-side) | Claude recommendations |
