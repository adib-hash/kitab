## v2.1.5 — 2026-03-27
### Fixed
- **Share Extension — native app book identification**: Amazon short URLs (`a.co`, `amzn.to`) and Goodreads ID-only URLs (`/book/show/12345`) no longer fail silently. A new Vercel serverless function (`api/resolve-url.js`) follows redirects server-side and extracts `og:title`/`<title>` from the resolved page, allowing `SharePreviewModal` to identify books shared from the Amazon and Goodreads iOS apps. Amazon and Goodreads page titles are cleaned before searching (strips "by Author | Amazon.com: Books" suffix, etc.).

## v2.1.4 — 2026-03-27
### Fixed
- **Share Extension modal**: Centred vertically on screen instead of sliding up from the bottom.
- **Share Extension — native app support**: Kitab now appears in the share sheet of the Amazon and Goodreads iOS apps (not just Safari). Activation rule broadened to match plain-text shares; `ShareViewController` extracts Amazon/Goodreads URLs from shared text using `NSDataDetector`, preferring those domains over any other URLs in the text.

## v2.1.3 — 2026-03-27
### Added
- **Share Extension — Smart Book Preview**: Replaced the manual search flow with an instant auto-lookup. Sharing an Amazon or Goodreads page now opens a pre-populated book card (cover, title, author, year, page count, description) via Google Books API. One tap to add to library with status selection (Want to Read / Reading / Read). "Edit details" opens the full form; "Not the right book?" falls back to manual search.

## v2.1.2 — 2026-03-27
### Fixed
- **Kindle Highlights Sync**: Fixed scraper's `postMessage` calls to wrap data in `{ detail: { ... } }` as required by the `@capgo/inappbrowser` Capacitor bridge. Without this, `event.detail` was `undefined` in the listener and all messages were silently dropped.

## v2.1.1 — 2026-03-27
### Fixed
- **Kindle Highlights Sync**: Fixed "Sync Failed" error on Amazon login. Switched from `InAppBrowser.open()` (SFSafariViewController — no JS injection) to `openWebView()` (WKWebView — JS-injectable). Replaced broken `executeScript()` polling (returns `void`, not values) with `addListener('messageFromWebview')` to receive progress and results from the injected scraper via `window.mobileApp.postMessage()`. Login redirects handled gracefully — scraper re-injects on every page load; `window.__kitabRunning` guard prevents double execution.

## v2.1.0 — 2026-03-27
### Added
- **Kindle Highlights Sync (iOS)**: One-tap sync of all Kindle highlights via `read.amazon.com/kp/notebook`. Opens an in-app browser, injects a scraper, extracts highlights across all books, fuzzy-matches to your library, and stores in Supabase. Sign in to Amazon once; session persists for future syncs. Accessible from Settings (iOS only).
- **iOS Share Extension**: Share any Goodreads or Amazon book page from Safari → Kitab appears in the share sheet → Add Book modal opens with the book title pre-filled from the URL.
- **`kitab://` URL scheme**: Registered in Info.plist to support deep links from the Share Extension.

### Changed
- **Offline mode**: Added `networkMode: 'offlineFirst'` to React Query — cached library data now loads immediately when the app is opened offline instead of showing a loading spinner.
- **Offline mode**: Added 5-second timeout on `getSession()` — app no longer hangs indefinitely on initial load when there's no network connection.
- **Offline mode**: Added `startQueueReplay()` — when the device reconnects, all active queries are invalidated and refreshed.
- **Offline mode (web)**: Added `vite-plugin-pwa` for service worker caching of the web app shell — the web app now loads offline.
- **Kindle Highlights**: Updated Settings description to be iOS-friendly (AirDrop flow for physical Kindle users).

### Removed
- **Biometric login**: Removed Face ID / Touch ID unlock entirely. `@aparajita/capacitor-biometric-auth` dependency removed. `NSFaceIDUsageDescription` removed from Info.plist.

## v2.0.4 — 2026-03-25
### Fixed
- **GlobalSearch scroll conflict**: Opening the search overlay now locks the background page using `position: fixed` + scroll position save/restore. Scrolling within search results no longer scrolls the background page on iOS or web.

## v2.0.3 — 2026-03-25
### Fixed
- **Header blocking overlays**: GlobalSearch raised from z-50 to z-[510] and repositioned to `calc(env(safe-area-inset-top) + 72px)` so it always appears below the header, never behind it.
- **Toast notifications blocked**: Toaster now has `containerStyle` with `top: calc(env(safe-area-inset-top) + 72px)` and `zIndex: 9999` — toasts clear the sticky header on all iOS devices including notched models.
- **Modal z-index and positioning**: Modal backdrop raised to z-[250], content to z-[260]. Hardcoded `top: 72px` replaced with `calc(env(safe-area-inset-top) + 72px)` and `maxHeight` updated to account for safe area.
- **Offline banner z-index**: Raised to z-[9990] to guarantee it sits above all other overlays.

### Performance
- **Book card scroll jank**: Removed framer-motion entrance animations (`opacity + y` stagger) from BookCard — 60+ concurrent animations on large libraries were causing frame drops during scroll. Cards now render instantly.
- **React.memo on BookCard, BookRow, BookCover**: Prevents unnecessary re-renders when filters/search change but individual book data hasn't.
- **Dashboard memoization**: `currentlyReading`, `recentlyRead`, `yearBooks`, and `computeStats` all wrapped in `useMemo` — avoids recomputing derived data on every render.
- **BookCover flicker eliminated**: Cover now initializes with the remote URL immediately; native filesystem cache upgrades it in the background only if a cached version exists.
- **React Query gcTime**: Reduced from 7 days to 24 hours — sufficient for offline use, avoids unnecessary memory growth on large libraries.
- **Vite build**: Added `target: 'esnext'` and explicit `minify: 'esbuild'` for faster, smaller builds.

## v2.0.2 — 2026-03-25
### Fixed
- **Haptic feedback (again)**: replaced lazy dynamic-import pattern with direct static imports. The async module caching in the Vite production build was silently failing on device, keeping all plugin references null. Static imports are the correct pattern for Capacitor plugins.

## v2.0.1 — 2026-03-25
### Fixed
- **Haptic feedback**: all haptics were silently broken due to a typo — `@capacitor/haptics` exports `NotificationType`, not `NotificationStyle`. Every success/warning/error notification haptic was a no-op.
- **Star rating haptic**: replaced `selectionChanged()` with `impactLight()` — `selectionChanged` requires a preceding `selectionStart()` call and is designed for continuous scroll interactions, not discrete taps.

## v2.0.0 — 2026-03-25
### iOS Native Overhaul
- **Safe area fix**: header no longer overlaps the iOS status bar — `env(safe-area-inset-top)` applied to the mobile sticky header in Layout.jsx.
- **Scroll polish**: added `-webkit-overflow-scrolling: touch` and `overscroll-behavior-y: contain` for native momentum scrolling; `-webkit-tap-highlight-color: transparent` on all interactive elements; `-webkit-touch-callout: none` on images to suppress long-press context menus.
- **Capacitor config**: `limitsNavigationsToAppBoundDomains: true` prevents accidental navigation to Safari; display name updated to "Kitab".
- **Haptic feedback**: native haptic engine wired to nav taps (light), star ratings (selection), QuickActionsSheet open (medium), add/edit book confirmation (success), DNF/delete actions (warning), TBR drag start (medium). Implemented via `@capacitor/haptics`, no-ops on web.
- **Native cover caching**: book covers fetched and stored to iOS Cache directory via `@capacitor/filesystem`. Library loads instantly with covers even in airplane mode after first load. Web falls back to browser HTTP cache.
- **App icon**: new 1024x1024 icon — teal gradient background, white geometric K lettermark, amber accent dot. Full iOS icon set generated via `@capacitor/assets`.
- **Biometric authentication**: optional Face ID / Touch ID lock via `@aparajita/capacitor-biometric-auth`. Toggle in Settings → Security. Biometrics gates an existing valid Supabase session on cold app open; failed auth signs the user out. Hidden on web.
- **Offline mode**: React Query cache persisted to localStorage (7-day TTL) — library, stats, and dashboard are readable after connectivity drops. `@capacitor/network` monitors real connectivity on device. Offline banner shown across the top of the app. Web app benefits equally from the offline cache.

## v1.9.1 — 2026-03-16
### Fixed
- **Amazon link**: switched from direct `/dp/ISBN10` to ISBN search (`?k=ISBN&i=stripbooks`). ISBN search never 404s — Amazon surfaces the product reliably even for delisted or regional editions. Books without an ISBN fall back to title + author search (unchanged). Removed `toIsbn10()` helper and its IIFE wrapper.
- **Wikipedia fallback**: added a second API tier (fulltext `list=search`) before giving up on obscure titles. Tier 1 still tries an exact title match; Tier 2 runs Wikipedia's fulltext search API; Tier 3 falls back to the `w/index.php?search=` page — so the link is never a dead end.
- **External links spacing**: removed `flex-wrap` and increased gap from `gap-2` to `gap-3` — the three buttons (Amazon, Wikipedia, Check Libby) now stay on one consistent row with even spacing.

## v1.9.0 — 2026-03-16
### Changed
- **Amazon link**: upgraded from ISBN search URL to direct product page. ISBN-13 starting with `978` is algorithmically converted to ISBN-10 and linked as `amazon.com/dp/ISBN10`. ISBN-13 starting with `979` (no ISBN-10 equivalent) and books with no ISBN fall back to title+author search.
- **Wikipedia link**: replaced unreliable `opensearch` API with `action=query` direct title lookup. Searches by book title only (author in the query broke matches), validates `pageid > 0` before upgrading the URL, and falls back to a title-only search URL if no article is found.
- **Google Books link**: removed from external links row (low utility).

## v1.8.9 — 2026-03-16
### Changed
- **BookDetail external links**: Replaced Goodreads link with Amazon and Wikipedia links. Amazon uses ISBN when available (`?k=ISBN&i=stripbooks`) or falls back to title + author search. Wikipedia uses the MediaWiki opensearch API to resolve a direct article URL on load, with a search-results fallback if no article is found.

## v1.8.8 — 2026-03-16
### Added
- **Open Library cover fallback in Enrich Library**: When Google Books returns no cover (or no result at all), the enrichment loop now tries Open Library's search API as a second source — first by ISBN, then by title + author. Open Library has a far larger cover database and requires no API key.
- **Per-book selection in Enrich Library**: Results now show a checkbox per book (checked by default for any book with updates). The "Apply All Updates" button is replaced by "Apply X Selected" showing the live count of selected books. A "Select all / Deselect all" toggle sits next to the results count. Books with no data found have a disabled checkbox and a "No data found" label.

## v1.8.7 — 2026-03-16
### Fixed
- **QuickActionsSheet date picker spacing**: Bottom padding increased to 80px when the "When did you finish?" picker is active, lifting the Confirm button well clear of the bottom nav bar
- **"Add a Book" modal clipped by sticky header**: Modal z-index raised above the mobile top bar (z-210 vs z-150), and top offset changed from 5vh (~42px) to 72px so the modal always clears the sticky "Kitab" header cleanly

## v1.8.6 — 2026-03-16
### Changed
- **Global search now offers "Add to library" on empty results**: The search icon (top bar, all pages) already searched your existing library — it now also shows an "Add it to your library" button when nothing is found, pre-filling the Google Books search with your query. Works identically on Home, Library, TBR, Discover, and Rank.
- **Reverted v1.8.5 Dashboard-specific search**: The per-page search sheet was redundant — the Layout's top-bar search icon already covers all pages globally.

## v1.8.5 — 2026-03-16
### Added
- **Library search from Dashboard**: The search icon in the Dashboard header now searches your existing library (by title, author, or tag) in real-time. If the book isn't found, an "Add it to your library" button opens the Google Books search pre-filled with your query. The Plus icon in the header still opens the Add Book flow directly.

## v1.8.4 — 2026-03-16
### Added
- **Barcode scanning to add books**: Tap the barcode icon in the search input to open a fullscreen camera overlay. Scan the ISBN on a book's back cover — if Google Books returns a single match, BookForm opens pre-filled. Multiple editions are shown in the search list; zero results surface the "Add manually" CTA. Uses `@zxing/browser` for reliable EAN-13/EAN-8 decoding on iOS Safari. Consecutive-read confidence gate (2 identical reads) prevents false triggers.

## v1.8.3 — 2026-03-16
### Fixed
- **Library search empty state**: When a search query returns no results, the library now shows `"[query]" isn't in your library.` with an "Add it to your Library" button that opens the Add Book modal — replaces the previous dead-end generic message

## v1.8.2 — 2026-03-16
### Fixed
- **QuickActionsSheet — date picker cut off**: Sheet container now has `maxHeight: 90vh` and `overflowY: auto`, so the Confirm button is always visible on small screens
- **QuickActionsSheet — iOS scroll lock**: Replaced `overflow: hidden` body lock with the `position: fixed` + scroll-position-save/restore approach that works reliably on iOS Safari
- **TBR swipe/scroll conflict**: Inner card defaults to `touch-action: pan-y`; switches to `touch-action: none` the moment a horizontal axis is confirmed, preventing the list from scrolling while a swipe is in progress; restored on touch end
- **BookSearch empty state**: Zero-results state now shows "Book not in Google Books? Add it manually" button, surfacing the manual-add flow instead of a dead-end message

## v1.8.1 — 2026-03-16
### Added
- **AI Recommendations context badge**: A small info line ("X reviews · Y highlights used for context") now appears above the card stack after recommendations load, confirming which personal data was included in the prompt. Hidden if neither reviews nor highlights were available.

## v1.8.0 — 2026-03-16
### Added
- **AI Recommendations**: Prompt now includes user's review excerpts (4-star+ books) and up to 12 Kindle highlights, giving Claude richer context for personalised picks
- **Reading goal gradient bar**: Progress bar on Dashboard and Stats now uses a warm amber gradient (light → deep) to convey heating-up momentum
- **Finish date prompt**: Marking a book as Finished now shows a month/year picker in the Quick Actions sheet before saving; user can skip to omit the date
- **Logout button**: Settings → Account section with a "Log out" button that ends the session and redirects to login
- **Back button in Settings**: Chevron-left button in the Settings header to navigate back to the previous screen

### Changed
- **Enhanced toasts**: Status-change toasts are now context-specific ("Now reading…", "Finished…!", "Added to TBR", "Did not finish") rather than generic
- **Recommendations toast**: Accepting a rec now toasts ""Title" added to your TBR" (deduped against the library add toast via shared id)
- **Pie chart**: Removed clipped inline slice labels; tooltip now shows white text on dark background with book count formatting

## v1.7.0 — 2026-03-16
### Fixed
- `QuickActionsSheet`: date_finished was stored as YYYY-MM-DD instead of YYYY-MM-01 when marking a book as Read via Quick Actions — now uses correct month+year-only format per schema spec
- `ReviewModal`: dead ternary `setText(hasDraft ? dbReview : dbReview)` simplified to `setText(dbReview)`

### Changed
- `StatCard` icons (Dashboard, Stats): replaced all emoji strings (📚 📄 ⭐ 🔖 📏 📌 🔍 📭) with Lucide SVG icons
- `EmptyState` default icon: replaced `'📚'` fallback with `<BookOpen size={48} />` SVG
- Dashboard: "🎉 Goal achieved!" → CheckCircle SVG + text; "Start a book →" arrow → SVG ArrowRight
- Stats: "🎉 Goal achieved!" → CheckCircle SVG + text; EmptyState icon (📊) → BarChart2 SVG
- Rank: winner overlay `✓` → CheckCircle SVG; `⚔️` home screen → Swords SVG; medal emojis 🥇🥈🥉 → CSS-styled numbered badges
- TBR: "View in library →" arrow → SVG ArrowRight; swipe action emoji icons (📖 🗑) → BookOpen/Trash2 SVGs; empty state (📋) → Bookmark SVG
- BookForm: "Edit/Write Review →" arrow → SVG ArrowRight
- BookSearch: "Can't find it? Add manually →" arrow → SVG ArrowRight
- Recommendations: `← Skip  Add to TBR →` → ChevronLeft/ChevronRight SVGs; "✨" EmptyState → Sparkles SVG; "🎉" done state → CheckCircle SVG
- `StatusBadge`: Unicode dot characters (● ○ ◑ ✕) → CSS-styled colored circles using inline styles
- Settings tag deletion: confirm dialog now includes affected book count (e.g. `Delete "Fiction"? This will remove it from 7 books.`)

## v1.6.14 — 2026-03-12
### Added
- `ReviewModal`: dedicated full-screen review editor with tall textarea, word count, spoiler toggle
- Auto-save to localStorage: debounced 500ms, draft survives app reload with a "restore draft?" banner
- Post-read prompt: after marking a book as Finished (via QuickActionsSheet), a modal prompts to write a review (only if no review exists yet)
- BookDetail: "Write Review" / "Edit Review" button in actions row; "Write a Review" empty state when no review exists; inline "Edit" link in review card header
- BookForm: "Write/Edit Review →" callout in the details tab (replaces the removed review tab)

### Changed
- BookForm: removed the "review" tab — review editing now lives in the dedicated ReviewModal
- QuickActionsSheet: "Write/Edit Review" action opens ReviewModal directly instead of BookForm review tab

## v1.6.13 — 2026-03-12
### Changed
- Replaced Readwise sync with direct `My Clippings.txt` import — free, no token required, fully client-side
- Removed `api/readwise-sync.js` serverless function (no longer needed)
- Added `parseClippings` parser and `clippingHash` dedup for Kindle clippings format
- Settings: `ReadwiseSection` replaced with `ClippingsSection` (file upload UI)
- Supabase: `readwise_id` made nullable, `clipping_hash` column added with unique partial index

## v1.6.12 — 2026-03-12
### Fixed
- Settings: version string was rendering inside `TagRow` (once per tag) and `EnrichLibrary` — moved to single canonical location at bottom of Settings
- Stats: `isThisYear()` used `new Date().getFullYear()` which misclassifies January books in US timezones — now uses `parseInt(dateStr.slice(0, 4))`
- utils: same timezone-unsafe date pattern in `computeStats.booksThisYear` — fixed
- Dashboard: removed redundant `computeStats(books)` call on full unfiltered library
- BookDetail: `HighlightsSection` was declared inside `BookDetail`'s function body via hoisting — caused component remount on every parent re-render, resetting the highlights open/close state. Extracted to module level, `isDark` passed as prop
- BookDetail: duplicate `dark:text-ink-300` in metadata grid classNames
- Discover: removed duplicate local `timeAgo()` function, now imports from utils
- Rank: raw Supabase reset didn't invalidate React Query cache — rankings showed stale data after reset. Added `qc.invalidateQueries`
- Settings: `exportCSV` / `exportJSON` created object URLs without revoking — minor memory leak. Added `URL.revokeObjectURL` after download

## v1.6.11 — 2026-03-12
### Fixed
- Kindle Highlights: replaced `dark:bg-ink-800 / dark:text-ink-100` Tailwind variants with inline styles driven by reactive `isDark` state — fixes invisible highlight text in dark mode

## v1.6.11 — 2026-03-12
### Fixed
- Kindle Highlights: replaced one-shot `isDark` with reactive `useState` + `useEffect` / `MutationObserver` so dark-mode state is accurate and updates on theme change
- Kindle Highlights: switched highlight card colors to inline styles so Tailwind purging cannot strip dark-mode values

## v1.6.9 — 2026-03-08
- Fix: BookDetail Highlights section was missing (v1.6.8 component injection
  had a silent failure) — now correctly appended
- Fix: Highlight quote cards had invisible text in dark mode
  (dark:bg-ink-800 + dark:text-ink-100 mismatch) — changed card background
  to dark:bg-teal-900/20 and text to dark:text-paper-100 for legibility

## v1.6.8 — 2026-03-08
- Hotfix: Dashboard.jsx had invalid `require` call from v1.6.7 that broke
  the Vite/ESM build — caused all book detail modals to stop opening
- Feature: Readwise Highlights Sync
  — /api/readwise-sync.js: Vercel serverless proxy for Readwise v2 API
  — src/hooks/useHighlights.js: Supabase queries + sync orchestration + fuzzy matching
  — Settings: Readwise card with token input, Sync button, last-sync time,
    and unmatched-book review queue with manual link-to-book selector
  — BookDetail: collapsible Kindle Highlights section (hidden if 0 highlights)
  — Sync is idempotent (readwise_id unique key) — safe to re-run anytime
  — Token stored in localStorage only; never written to Supabase

## v1.6.8 — 2026-03-07
- Feature: Readwise Highlights Sync
  — New /api/readwise-sync.js Vercel route proxies Readwise v2 API
  — New src/hooks/useHighlights.js with full sync orchestration + fuzzy matching
  — Settings: Readwise card with token input, Sync button, last-sync timestamp,
    and unmatched-book review queue with manual link-to-book selector
  — BookDetail: new Highlights tab showing all Kindle highlights as styled
    quote cards with inline notes and location numbers
  — Sync is idempotent (readwise_id unique key) — safe to run repeatedly
  — Token stored in localStorage only; never written to Supabase

## v1.6.11 — 2026-03-07
- Fix: TBR drag-to-reorder now works on iOS
  — Replaced PointerSensor with MouseSensor (PointerSensor fires on iOS touch,
    racing with TouchSensor and preventing drag activation)
  — Removed touchAction:pan-y from inner card (parent touch-action was overriding
    touch-none on the drag handle child, blocking dnd-kit from receiving events)

## v1.6.10 — 2026-03-07
- Fix: Scroll lock now works on iOS Safari
  — overflow:hidden replaced with position:fixed + scroll position save/restore
  — Applies to all modals (BookForm, BookSearch, etc.) via Modal component
- Fix: TBR drag-to-reorder restored on iOS
  — Removed touch-pan-y from outer sortable container (was blocking dnd-kit TouchSensor)
  — touch-action:pan-y moved to inner card only, so page scroll still works
  — Drag handle retains touch-none so dnd-kit owns those touch events

## v1.6.8 — 2026-03-07
- Fix: Stats page year filter now timezone-safe (Jan books no longer dropped)
  — isThisYear() replaced new Date().getFullYear() with parseInt(dateStr.slice(0,4))
  — Books Read + Pages Read on Statistics page now match Home Dashboard
- Fix: Modal scroll lock added centrally to Modal component in index.jsx
  — Background page no longer scrollable while any modal is open
- Fix: Duplicate "Shuffle Again" button removed from TBR shuffle modal
- Fix: TBR drag-to-reorder restored on iOS
  — PointerSensor now requires 8px movement before activating (prevents swipe conflict)
  — TouchSensor added with 200ms delay + 8px tolerance for reliable touch drag

## v1.6.7 — 2026-03-07
- Change: Dashboard "At a Glance" now shows current-year (2026) stats only
  — Books Read, Pages Read, Avg Rating all scoped to 2026
  — year badge next to "At a Glance" heading
- Fix: Stats page spacing — consistent gap-4 between cards, pb-8 so last
  section has breathing room above nav bar
- Change: Genre stats replaced with Tag stats everywhere
  — Stats page: pie chart + breakdown now show books per tag for 2026
  — Only tags with ≥1 book in current year are shown
  — computeStats now returns tagBreakdown instead of genreBreakdown
- Change: Date collection simplified — removed "Date Started" entirely
  — "Date Finished" replaced with Month + Year dropdown selects
  — Stored as YYYY-MM-01 in existing date_finished column (no migration needed)
  — All downstream stats (booksPerMonth chart, year filter) still work
  — No more day-level precision; pace stats removed

## v1.6.6 — 2026-03-07
- Feature: Loading screen redesigned — stacked book spines (CSS, no images), Playfair
  wordmark, "your reading life" tagline, animated teal ink-dot pulse
- Feature: Statistics page now scoped to current year (2026) only
  — all stats (books, pages, rating, pace, genres, chart) reflect books finished in 2026
  — year badge next to "Statistics" heading
  — empty state message when no books finished yet this year
  — goal progress now uses year-scoped book count (was already year-scoped)
  — replaced "All time" labels with current year labels throughout

## v1.6.5 — 2026-03-07
- Fix: Discover book covers restored — SessionCard rewritten with proper carousel
  (v1.6.4 regex introduced JSX syntax error that broke cover rendering)
  - New carousel: swipe or tap arrows/dots to navigate between picks
  - Robust image fallback: shows title initials if cover URL fails
  - touch-action: pan-y so page scrolling never conflicts with card swipe
  - "Older Recommendations" collapsible for sessions beyond the top 2
- Fix: Shuffle Again button now uses teal background + white text (legible in dark mode)
  — replaced emoji-only button with icon (Shuffle) + "Shuffle Again" label
- Fix: Global double-tap zoom removed via maximum-scale=1 in viewport meta
- Fix: Global 300ms tap delay removed via touch-action: manipulation on all interactive elements

## v1.6.5 — 2026-03-07
- Fix: Discover book covers restored — SessionCard rewritten with proper carousel
  (v1.6.4 regex introduced JSX syntax error that broke cover rendering)
  - New carousel: swipe or tap arrows/dots to navigate between picks
  - Robust image fallback: shows title initials if cover URL fails
  - touch-action: pan-y so page scrolling never conflicts with card swipe
  - "Older Recommendations" collapsible for sessions beyond the top 2
- Fix: Shuffle Again button now uses teal background + white text (legible in dark mode)
  — replaced emoji-only button with icon (Shuffle) + "Shuffle Again" label
- Fix: Global double-tap zoom removed via maximum-scale=1 in viewport meta
- Fix: Global 300ms tap delay removed via touch-action: manipulation on all interactive elements

## v1.6.4 — 2026-03-07
- Feature: Shuffle modal now has "Shuffle Again" button (picks a different book each time)
- Fix: New TBR books are added to the end of the list, not the top
- Fix: Discover carousel swipe no longer fights with page scroll (touch-action: pan-y)
- Perf: Nav bar tap is now instant on iOS (touch-action: manipulation removes 300ms delay)
- Perf: Book grid animations 2x faster (stagger 0.03→0.01, duration 0.3→0.15)
- Perf: React Query staleTime 10min, gcTime 30min — pages load from cache instantly

## v1.6.4 — 2026-03-07
- Feature: Shuffle modal now has "Shuffle Again" button (picks a different book each time)
- Fix: New TBR books are added to the end of the list, not the top
- Fix: Discover carousel swipe no longer fights with page scroll (touch-action: pan-y)
- Perf: Nav bar tap is now instant on iOS (touch-action: manipulation removes 300ms delay)
- Perf: Book grid animations 2x faster (stagger 0.03→0.01, duration 0.3→0.15)
- Perf: React Query staleTime 10min, gcTime 30min — pages load from cache instantly

## v1.6.3 — 2026-03-07
- Change: TBR left swipe now removes book from library entirely (was: mark as done)
  — confirm banner says "Remove from library entirely?" before firing
  — uses useDeleteBook (permanent delete, not status change)
- Feature: Quick Actions now shows full status picker from any context
  — "Status: Currently Reading" row expands to show all 4 statuses
  — auto-sets date_finished when changing to Finished
  — current status marked, can't be re-selected

## v1.6.2 — 2026-03-07
- Fix: Auto-zoom on Discover textarea (iOS zooms inputs <16px font-size; set explicit 16px)
- Fix: Quick Actions menu item text was invisible (now wrapped in explicit <span> with concrete color)
- Fix: Swipe visual feedback not showing (inner card ref now separate from outer container ref)
- Fix: Swipe now shows confirm banner before executing — tap Confirm or Cancel

## v1.6.1 — 2026-03-07
- Fix: Shuffle modal now centered on screen (was rendering too low)
- Fix: Swipe animation no longer janky — swipe offset now written directly to DOM via ref instead of React state, eliminating per-pixel re-renders
- Swipe background tint/label animates smoothly at threshold

# Kitab — Changelog

All changes since inception, in reverse chronological order.

---

## v1.6.0 — March 2026
*Quick Actions via long press*

- **Long press any book** — hold a book card (Library grid or TBR list) 500ms to open a Quick Actions bottom sheet
- **Quick Actions**: Add/Edit Tags, Write/Edit Review, Rate (inline star picker), Move to Currently Reading / TBR
- **iOS context menu suppressed** — `onContextMenu` + `WebkitTouchCallout: none` block the system "Open in New Tab" popup
- **Swipe + long press coexist on TBR** — 8px movement threshold cancels long-press timer; swipe gestures are unaffected

---


## v1.6.0 — March 2026
*Quick Actions via long press*

- **Long press any book** — hold a book card (Library grid or TBR list) 500ms to open a Quick Actions bottom sheet
- **Quick Actions**: Add/Edit Tags, Write/Edit Review, Rate (inline star picker), Move to Currently Reading / TBR
- **iOS context menu suppressed** — `onContextMenu` + `WebkitTouchCallout: none` block the system "Open in New Tab" popup
- **Swipe + long press coexist on TBR** — 8px movement threshold cancels long-press timer; swipe gestures are unaffected

---


## v1.6.0 — March 2026
*Quick Actions via long press*

- **Long press any book** — hold a book card (Library grid or TBR list) 500ms to open a Quick Actions bottom sheet
- **Quick Actions**: Add/Edit Tags, Write/Edit Review, Rate (inline star picker), Move to Currently Reading / TBR
- **iOS "Open in New Tab" suppressed** — `onContextMenu` prevention + `WebkitTouchCallout: none` block the system context menu
- **Swipe + long press coexist on TBR** — 8px movement threshold cancels long-press so swipe gestures are unaffected
- **Bug fix**: reverted broken v1.6.0 attempt that had invalid duplicate import syntax

---


## v1.5.4 — March 2026
*Discover scroll conflict fix*

- **Discover: swipe vs. scroll conflict resolved** — card deck now uses `touch-action: pan-y` so the browser owns vertical scrolling natively; horizontal swipe axis is locked only after 8px of movement confirms the gesture is lateral, preventing accidental card swipes while scrolling the page

---


## v1.5.3 — March 2026
*Discover layout fixes*

- **Card perfectly centered** — book cover card is now explicitly centered at fixed width, fully decoupled from the session card padding
- **"Why you'll love it" full width** — reason box now spans the full session card width for a more comfortable reading layout
- **Bottom spacing** — added consistent padding below the session list so the last recommendation clears the nav bar

---


## v1.5.2 — March 2026
*Discover and Rank UI fixes*

- **Discover: modal scroll** — book detail modal now has a fixed height cap; expanding the description scrolls within the modal rather than growing it; X button always accessible
- **Discover: card centered** — recommendation card art properly centered on screen
- **Rank: bottom gap** — added padding below the Rankings list so the Keep Ranking button clears the nav bar

---


## v1.5.1 — March 2026
*Polish pass on v1.5.0 features*

- **Shuffle Pick: Pick Again** — modal now has a "Pick Again" button to reshuffle without closing
- **Rank: Back button** — "Back" link at the top of the Rankings view returns to the main Rank page
- **Discover: recent vs. older split** — sessions from the last 48 hours are expanded by default; older sessions are collapsed under an "Older Recommendations" toggle
- **Discover: expand/collapse icon** — chevron icon on each session header makes expand/collapse behavior explicit
- **Discover: centered card** — recommendation card art is now centered on screen

---


## v1.5.0 — March 2026
*TBR shuffle, Discover card deck, Rank animation*

### New Features
- **Shuffle Pick (TBR)** — new button at the top of TBR randomly surfaces one book from your list in a popup; great for when you can't decide what to read next
- **Discover swipeable card deck** — each recommendation session now displays as an interactive card stack instead of a scrollable list; swipe left/right (or use arrow buttons) to flip through picks; dot indicators show position in the deck
- **Discover card actions** — X button (top-left of card) removes the recommendation with a confirm prompt; checkmark (top-right) adds to TBR with a confirm prompt; tapping the cover opens the full book detail modal
- **Rank reveal animation** — rankings list now builds from the bottom up with a staggered slide-in animation each time results are shown

### Changes
- **TBR buttons removed** — "Reading" and "Done" action buttons removed from TBR rows; swipe gestures are now the primary interaction (swipe right = start reading, swipe left = remove)
- **Discover "Why it's recommended"** — reason text now lives below the active card and animates in/out as you swipe between picks

---

## v1.4.0 — March 2026 (Current)
*Mobile polish, performance, and UX refinement sprint*

### New Features
- **TBR swipe gestures** — swipe right to move to Currently Reading, swipe left to remove from TBR; both directions show a confirmation prompt
- **Tap nav icon to scroll to top** — tapping the active nav icon from any page smoothly scrolls back to the top
- **Collapsible tags in Library filters** — tags are hidden behind a collapsible toggle to prevent the filter panel from growing unwieldy as tag count increases; shows active tag count badge when collapsed
- **Discover: Recent vs. Older sessions** — recommendations split into "recent" (past 48 hours, shown by default) and "older" (collapsed behind a toggle) to declutter the Discover page
- **App version number** — displayed at the bottom of Settings (v1.4.0)

### Fixes & Improvements
- **Mobile auto-zoom disabled** — all inputs, selects, and textareas set to `font-size: 16px` to prevent iOS auto-zoom on focus; applied globally in CSS and patched individually in GlobalSearch, TagInput, BookForm, and BookSearch
- **Edit Book modal layout** — cover column narrowed, Year/Pages fields given compact fixed widths, everything fits without horizontal scrolling on mobile
- **Review tab** — replaced MDEditor (desktop-optimized rich text editor) with a simple `<textarea>` that is much easier to type in on mobile
- **Library overview bottom gap** — added padding below the Library Overview card in Settings so it clears the nav bar properly
- **TBR bottom gap** — added padding below the last TBR item for visual consistency with gaps between items
- **Nav bar z-index** — raised BottomNav to `z-[200]` and added `isolation: isolate` to the scroll container to prevent Framer Motion animated elements from bleeding over the nav bar during scroll
- **BookCard performance** — wrapped in `React.memo`, animation stagger capped at 9 items, entry duration reduced to 0.2s
- **BookCover lazy loading** — added `loading="lazy"` and `decoding="async"` to all cover images

---

## v1.3.0 — March 2026
*AI-powered Discover rebuild*

### New Features
- **LLM-powered recommendations** — Discover feature completely rebuilt from scratch; Claude Haiku generates 5 personalized book recommendations per session
- **Four recommendation modes** — Vibe (✨ mood/atmosphere match), Author (✍️ similar authors), Fresh (🌍 outside usual genres), Favorites (⭐ based on top-rated books)
- **Google Books verification** — every AI recommendation is verified against Google Books before being shown; hallucinated or unverifiable titles are filtered out automatically
- **Session history** — all recommendation sessions saved to Supabase and displayed as collapsible cards on the Discover page
- **Per-book delete** — individual books can be removed from a session without deleting the whole session; deleting the last book removes the session
- **Vercel API proxy** — serverless function at `/api/recommend` holds the Anthropic API key server-side so it is never exposed to the client
- **Desktop two-column layout** — sticky query panel on the left, session history on the right; single-column on mobile with inline query flow

### Fixes
- Kitab logo in header and sidebar converted to home links
- Mobile modal centering fixed (iOS scroll lock, safe-area padding, `position: fixed` scroll restore)
- Duplicate panel bug on mobile fixed

---

## v1.2.0 — March 2026
*Discover v1 (algorithm-based), Libby integration, and UI polish*

### New Features
- **Discover feature (v1)** — three-section recommendation engine: books by similar authors, genre-matched suggestions, and stretch picks outside usual genres; powered by Google Books and Open Library APIs
- **Book preview modal** — tapping a recommendation shows cover, description, author, and publication year before adding to TBR
- **Check Libby button** — available on every book detail and recommendation; links directly to the book's availability on OverDrive/Libby using a configurable library slug in Settings
- **Discover quality improvements** — genre detection, deduplication across sections, quality filtering (excludes study guides/omnibus editions), manual refresh button

---

## v1.1.0 — March 2026
*Dark mode, global search, ELO persistence, and library polish*

### New Features
- **Dark mode** — set as the default theme; toggle available in Settings
- **Global search** — magnifying glass icon in the header opens a full-screen search overlay; searches across titles, authors, tags, and ISBNs across the entire library
- **ELO rankings synced to Supabase** — Rank battle results now persist across devices and sessions
- **Library scope change** — TBR books removed from the main Library view and managed exclusively through the TBR page

### Fixes & Improvements
- Invisible text bugs fixed (white text on white background in light mode)
- General UI polish across cards, spacing, and typography
- Discover banner removed from the Home/Dashboard page

---

## v1.0.0 — March 2026
*Initial launch*

### Core Features
- **Authentication** — email/password sign-in and sign-up via Supabase Auth
- **Library management** — add, edit, and delete books; track status (Read, Currently Reading, TBR, Did Not Finish)
- **Book search** — search Google Books by title, author, or ISBN to add books with cover art and metadata auto-filled
- **Manual book entry** — add books not found in Google Books with custom cover colour presets
- **Google Books enrichment** — batch-enrich existing library entries missing covers, page counts, or descriptions
- **Star ratings** — 0.5-step ratings (0–5) on every book
- **Reviews and notes** — rich text review field with optional spoiler flag
- **Reading dates** — log date started, date finished, and current page for in-progress books
- **Tags** — create and manage a custom tag taxonomy; tag any book; filter library by tags
- **TBR list** — dedicated To Be Read page with drag-and-drop reordering to prioritize your queue
- **Rank (ELO)** — head-to-head pairwise battle system to rank your read books; ELO scores calculated and persisted
- **Reading statistics** — dashboard with pages read, books per year, genre distribution, rating breakdown, and reading pace
- **Home dashboard** — currently reading shelf, recent activity, quick-add prompt
- **Goodreads export** — export your full library as a Goodreads-compatible CSV
- **CSV import** — import books from a CSV file
- **Settings** — Libby slug configuration, tag management, enrichment tool, import/export, library overview stats
- **Mobile-first design** — bottom navigation, responsive grid/list views, iOS momentum scrolling
- **Responsive layout** — collapsible sidebar on desktop, bottom nav on mobile
- **Grid and list views** — toggle between grid (cover art) and list (compact rows) in the Library
- **Library filters** — filter by status, tags, and sort by date read, date added, title, author, rating, or page count

---

*Built with React + Vite, Tailwind CSS, Framer Motion, Supabase (Postgres + Auth + RLS), Claude Haiku, Google Books API, Vercel.*
