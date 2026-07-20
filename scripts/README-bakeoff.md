# Book Metadata API Bake-Off

A read-only benchmark comparing **Google Books** (current), **Open Library**, and
**Hardcover** on the dimensions that hurt Kitab today: search relevance, junk results,
cover coverage, cover payload weight (a proxy for "slow covers"), and metadata completeness.

No app code is touched. Google logic mirrors `src/lib/googleBooks.js`; `normalizeTitle`
is reused from `src/lib/openLibrary.js`.

## Run it

```bash
cd "/Users/adibchoudhury/Documents/Claude Code/kitab"
node scripts/book-api-bakeoff.mjs            # 60 books (14 curated + 46 recent library)
node scripts/book-api-bakeoff.mjs --full     # all 138
node scripts/book-api-bakeoff.mjs --curated-only   # just the 14 curated edge cases (fast)
open scripts/bakeoff-report.html             # visual side-by-side report
```

Flags: `--limit N`, `--full`, `--curated-only`, `--library-only`, `--cover-size M|L`,
`--dump-hardcover` (prints a raw Hardcover search document for field-mapping checks),
`--out FILE`.

## Credentials (read from `.env.local`, never committed)

- `VITE_GOOGLE_BOOKS_API_KEY` — already present (used by the app).
- `HARDCOVER_API_TOKEN` — free token from hardcover.app → Settings → Hardcover API.
  **Expires yearly (resets Jan 1)** — if the Hardcover column goes blank, refresh it.
  Without it, the harness runs Google + Open Library and marks Hardcover "no token".

## Method notes

- **Query per provider (best-practice for each):** Google = raw "title author" (what the
  app's Add-search does today); Open Library = structured `title=`/`author=`; Hardcover =
  raw "title author" with `sort:activities_count:desc` (popularity sort — without it,
  Hardcover surfaces "Summary of…" junk).
- **Junk in top-3** = share of the top-3 results whose title doesn't match the query.
- **Cover weight**: Google covers fetched at `zoom=3` (exactly what the app serves today,
  which is why they're heavy); Open Library at size `M` by default.
- **Metadata /6** = author, year, pages, description, ISBN, genres. Open Library's *search*
  endpoint returns no description (needs a second `/works` call), which caps it at 5/6.
- All network fetches have a 10s timeout. Test sets: `bakeoff-testset.json` (curated,
  editable) + `bakeoff-library.json` (pulled from Supabase; git-ignored as personal data).
