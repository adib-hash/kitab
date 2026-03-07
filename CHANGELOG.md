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
