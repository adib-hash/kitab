# 📖 Kitab — Personal Reading Tracker

Your personal reading life, beautifully organized. Track books you've read, manage your TBR pile, rate and review, and discover what to read next — at [kitab.ihsan.build](https://kitab.ihsan.build).

---

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **State**: Zustand + TanStack Query
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Hosting**: Vercel
- **Book Data**: Google Books API + Open Library
- **Recommendations**: Anthropic Claude API (via Vercel Edge Function)
- **Animations**: Framer Motion
- **Charts**: Recharts

---

## Setup (4 steps)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → New Query → paste contents of `supabase-schema.sql` → Run
3. In **Authentication → Providers**, enable Google OAuth (requires Google Cloud Console OAuth credentials)
4. In **Authentication → URL Configuration**, add:
   - Site URL: `https://kitab.ihsan.build`
   - Redirect URL: `https://kitab.ihsan.build/**`
5. Copy your **Project URL** and **anon public key** from Settings → API

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
# → http://localhost:3000
```

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_BOOKS_API_KEY
# ANTHROPIC_API_KEY (for recommendations — server-side only, no VITE_ prefix)
```

### 5. Custom Domain (kitab.ihsan.build)

1. In Vercel project → Settings → Domains → add `kitab.ihsan.build`
2. In your DNS provider, add:
   ```
   CNAME  kitab  cname.vercel-dns.com
   ```
3. Vercel auto-provisions SSL

---

## Features

| Feature | Status |
|---|---|
| Book search (Google Books API) | ✅ |
| Library with grid + list view | ✅ |
| Half-star ratings (0.5–5.0) | ✅ |
| Markdown reviews with spoiler flag | ✅ |
| Tags with autocomplete & create-on-fly | ✅ |
| TBR list with drag-and-drop ordering | ✅ |
| Book detail page with similar books | ✅ |
| Dashboard with currently reading | ✅ |
| Reading progress tracking | ✅ |
| Reading statistics & charts | ✅ |
| Annual reading goal | ✅ |
| AI recommendations (swipe UI) | ✅ |
| Goodreads CSV import | ✅ |
| Export CSV + JSON | ✅ |
| Dark mode | ✅ |
| Mobile responsive | ✅ |

---

## Project Structure

```
src/
├── lib/          # Supabase client, Google Books API, utilities
├── hooks/        # React Query hooks for all data operations
├── store/        # Zustand UI state
├── pages/        # Route-level page components
├── components/   # Reusable UI components
│   ├── books/    # BookCard, BookRow, StarRating, TagInput, etc.
│   ├── library/  # Filters, grid/list views
│   ├── layout/   # Sidebar, Layout wrapper
│   └── ui/       # Button, Modal, Skeleton, StatCard, etc.
└── api/          # Vercel Edge Functions (recommendations)
```

---

## Recommendations API

The AI recommendations feature calls Claude via a Vercel Edge Function (`/api/recommendations`). This keeps your `ANTHROPIC_API_KEY` server-side and never exposes it to the browser.

You must set `ANTHROPIC_API_KEY` as an **environment variable in Vercel** (not in `.env.local`).

---

## Database Schema

See `supabase-schema.sql` for the complete schema. Tables:

- `books` — core library with all metadata and user data
- `tags` — tag registry
- `book_tags` — many-to-many join
- `reading_goals` — annual targets
- `skipped_recommendations` — tracks swiped-left books

All tables have Row Level Security enabled so only you can access your data.
