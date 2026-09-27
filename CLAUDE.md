# Kitab

Personal reading tracker: web app plus a Capacitor iOS app with widgets and a share extension. Live at kitab.ihsan.build (Vercel, deploys on push to `main`). Supabase project `kitab` (`tlallvcrogadqgtzuoko`). **Current version:** v3.0.4

This file lists only what isn't obvious from the code. Read the code and query the live schema (Supabase MCP) for everything else.

## Releasing
- Bump every copy of the version together: `CHANGELOG.md` entry, `Kitab · vX.Y.Z` in `src/pages/Settings.jsx`, `package.json` and the two root entries of `package-lock.json`, `README.md`, this file, and `MARKETING_VERSION` (all six targets) in `ios/App/App.xcodeproj/project.pbxproj`.
- iOS `CURRENT_PROJECT_VERSION` (all targets) must increase for every TestFlight upload; use a date-based `YYYYMMDDNN`.
- iOS release: `npm run build && npx cap sync ios`, then archive with `xcodebuild` into `~/Library/Developer/Xcode/Archives/<date>/`. Only the upload needs Adib.

## Traps
- **Dates.** `date_finished` is `YYYY-MM-01` (month precision). Never `new Date(date_finished)` (it shifts January into the prior year in US time zones); parse with `slice` / `parseInt`. The year a book was read comes from `date_finished`; four-digit year tags are hidden by `isYearTag` and must not come back.
- **Native plugins.** Capacitor 8 auto-loads only npm plugins. Kitab's own Swift plugins (`KitabDataBridge` for widgets, `KindleSync`, `KitabScanner`) are registered in `KitabBridgeViewController.capacitorDidLoad()`; add any new native plugin there. The startup log prints "Kitab native plugins registered".
- **API routes are public URLs.** `/api/recommend` requires a Supabase bearer token; `/api/resolve-url` is host-allowlisted. Client calls must use `API_BASE` from `src/lib/bookSearch.js` (relative `/api` paths 404 on iOS).
- **One status vocabulary.** Labels and colours come only from `STATUS` in `src/lib/utils.js`.
- **One daily highlight.** `src/lib/dailyHighlight.js` (180 characters or fewer, indexed by local day) feeds the Dashboard, Highlights page and notification, and `ios/App/KitabWidgets/SharedDataProvider.swift` mirrors it. Change both together.
- **Optimistic cache.** `useUpdateBook` and `useReorderTBR` patch `['books']` before the network call. Read "latest" state from the query cache, not from render closures (Rank depends on this).
- **Offline writes.** Notes and typed highlights go through `src/lib/outbox.js` (client ids, ordered replay). Only inserts are queued.
- **Type scale.** Original scale: `text-xs` captions and labels, `text-sm` body and buttons, inputs 16px. A 14px-floor sweep made the phone UI feel oversized and was reversed in v3.0.1; don't reapply it.
- **Toasts.** `ToastWatchdog` in `Layout.jsx` exists because iOS taps pause react-hot-toast indefinitely; keep it.
- **Scroll lock.** Use `useBodyScrollLock` (`position: fixed`), never `overflow: hidden`.
- **Google cover placeholders.** Asking Google Books for a larger scan than exists returns an "image not available" PNG with a 200 status (300×391 at zoom 2, 575×750 at zoom 3). `BookCover` detects those sizes on load and falls back to zoom 1; render covers through `BookCover`, not a bare `<img>`.
- **Motion.** Short tweens (0.15–0.24 s, iOS curve), no springs, no `backdrop-blur`, no height animations on menus. Tailwind `hoverOnlyWhenSupported` is on because iOS leaves `:hover` stuck after a tap.

## Kindle sync
- There is no Kindle API. `public/kindle-scraper.js` drives a logged-in read.amazon.com session in a WKWebView. The manual path (`useKindleSyncFlow.js`) opens a visible browser, which is where the Amazon sign-in happens. The automatic path (`KindleSyncPlugin.swift` + `src/lib/kindleAutoSync.js`) runs offscreen: a nightly `BGProcessingTask` plus a foreground fallback.
- Scrapes are incremental via `src/lib/kindleSyncState.js`. `normalize()` is copied in `kindle-scraper.js`, `useHighlights.js` and `kindleSyncState.js` (`normalizeTitle`) and must stay identical.
- Order matters: import to Supabase, then `applyScrapeResult` (with `excludeTitles` for failed books), then `configureBackgroundSync`. Native `getPending` doesn't clear the payload; `ackPending` does, after a successful import.
- The headless webview must share `WKWebsiteDataStore.default()` with `@capgo/inappbrowser` and stay attached at alpha 0.01 (hidden or alpha 0 throttles its timers). `BGTaskScheduler.register()` must stay in `AppDelegate`.

## Database
Migrations live in `supabase/migrations/`. `highlights.source` is `'kindle'` or `'manual'` (typed, with an optional `page`). `book_notes` holds per-book notes, optionally attached to a highlight; RLS limits rows to the owner and the owner's books.
