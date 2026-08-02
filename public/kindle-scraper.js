/*
 * Kitab — Kindle notebook scraper
 * ---------------------------------------------------------------------------
 * Single source of truth for the read.amazon.com/notebook scrape. It lives here
 * as a static asset rather than inside the bundle because two different callers
 * inject it into a WKWebView:
 *
 *   1. src/hooks/useKindleSyncFlow.js — fetches this file and executeScript()s
 *      it into the visible @capgo/inappbrowser. Used for the manual "Sync"
 *      button and for signing in to Amazon.
 *   2. KindleSyncPlugin.swift — reads it from Bundle.main/public/kindle-scraper.js
 *      and injects it into an offscreen WKWebView. Used for the nightly
 *      background sync and the invisible foreground fallback, where no JS app is
 *      running to hand the script over.
 *
 * `npx cap sync ios` copies dist/ (which Vite fills from public/) into
 * ios/App/App/public/, so both callers always run the same version.
 *
 * The caller sets window.__KITAB_SYNC_CONFIG before injecting:
 *   transport    'inappbrowser' | 'headless'  — how to post results back
 *   knownBooks   { [normalizedTitle]: highlightCount } books already scraped
 *   activeTitles [normalizedTitle]            — Kitab books with status 'reading'
 *   fullSweep    bool                         — visit every book, ignore knownBooks
 *   maxBooks     int                          — hard cap on books visited per run
 *
 * Posts back { type: 'kitabProgress' | 'kitabDone', ... }. On 'kitabDone':
 *   status      'ok' | 'needs_login' | 'no_books' | 'error'
 *   highlights  [{ bookTitle, bookAuthor, text, note, location }]
 *   bookCounts  { [normalizedTitle]: count }  — for books actually visited
 *   seenTitles  [normalizedTitle]             — every book in the notebook
 *   visited     int
 */
(function () {
  if (window.__kitabRunning) return;

  var cfg = window.__KITAB_SYNC_CONFIG || {};
  var transport = cfg.transport || 'inappbrowser';
  var knownBooks = cfg.knownBooks || {};
  var activeTitles = cfg.activeTitles || [];
  var fullSweep = !!cfg.fullSweep;
  var maxBooks = cfg.maxBooks || 40;

  // Mirrors normalize() in src/hooks/useHighlights.js — keep the two in step, or
  // knownBooks lookups silently miss and every book looks new every run.
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function send(payload) {
    try {
      if (transport === 'headless') {
        window.webkit.messageHandlers.kitabSync.postMessage(payload);
      } else {
        window.mobileApp.postMessage({ detail: payload });
      }
    } catch (e) {}
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // The banner only makes sense in the visible browser — the headless webview
  // has no viewer, and touching its DOM is wasted work.
  function showBanner(text) {
    if (transport === 'headless') return;
    var b = document.getElementById('__kitabBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = '__kitabBanner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0d9488;color:#fff;text-align:center;padding:12px 16px;font-size:14px;font-weight:600;font-family:-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);';
      document.body.prepend(b);
    }
    b.textContent = text;
  }

  function removeBanner() {
    var b = document.getElementById('__kitabBanner');
    if (b) b.remove();
  }

  function finish(status, highlights, bookCounts, seenTitles, visited) {
    removeBanner();
    send({
      type: 'kitabDone',
      status: status,
      highlights: highlights || [],
      bookCounts: bookCounts || {},
      seenTitles: seenTitles || [],
      visited: visited || 0,
    });
    window.__kitabRunning = false;
  }

  (async function () {
    // Amazon renders the library panel async and it can take several seconds. If
    // it never appears we are on a login or interstitial page, not the notebook.
    var lib = null;
    var pollStart = Date.now();
    while (Date.now() - pollStart < 15000) {
      lib = document.querySelector('#kp-notebook-library');
      if (lib) break;
      await sleep(500);
    }
    if (!lib) {
      // In the visible browser this is the sign-in page: exit silently and let
      // the caller's browserPageLoaded listener re-inject after login. Reporting
      // 'needs_login' there would close the browser out from under the user
      // before they could sign in. The headless webview has no one to sign in,
      // so there it is a real terminal state.
      if (transport === 'headless') finish('needs_login', [], {}, [], 0);
      return;
    }

    window.__kitabRunning = true;
    showBanner('Kitab is loading your Kindle notebook — please wait…');

    // Scroll until the book list stops growing (large libraries lazy-load).
    var prevCount = -1, stableFor = 0;
    var scrollStart = Date.now();
    while (Date.now() - scrollStart < 30000) {
      window.scrollBy(0, 600);
      await sleep(400);
      var count = document.querySelectorAll('#kp-notebook-library > .a-row[id]').length;
      if (count === prevCount) {
        stableFor++;
        if (stableFor >= 3) break;
      } else {
        stableFor = 0;
        prevCount = count;
      }
    }
    window.scrollTo(0, 0);
    await sleep(1000);

    var bookItems = Array.from(document.querySelectorAll('#kp-notebook-library > .a-row[id]'));
    if (bookItems.length === 0) {
      finish('no_books', [], {}, [], 0);
      return;
    }

    // ── Decide which books are worth opening ────────────────────────────────
    // Opening a book costs ~6s (click, then wait for the annotations panel) plus
    // ~2s per page of highlights. Visiting all of them takes minutes, which is
    // fine for a deliberate tap but far too slow to run unattended. So only open
    // a book when it could plausibly have something new: one we have never
    // scraped, or one currently being read.
    var seenTitles = [];
    var candidates = [];

    for (var i = 0; i < bookItems.length; i++) {
      var el = bookItems[i];
      var titleEl = el.querySelector('.kp-notebook-searchable') ||
                    el.querySelector('[class*="title"]') ||
                    el.querySelector('h2') || el.querySelector('h3');
      var title = titleEl ? titleEl.textContent.trim() : 'Unknown';
      var authorEl = el.querySelector('.a-color-secondary') ||
                     el.querySelector('[class*="author"]');
      var author = authorEl ? authorEl.textContent.trim() : null;
      var norm = normalize(title);
      seenTitles.push(norm);

      var isNew = !Object.prototype.hasOwnProperty.call(knownBooks, norm);
      var isActive = activeTitles.indexOf(norm) !== -1;
      if (fullSweep || isNew || isActive) {
        candidates.push({ el: el, title: title, author: author, norm: norm, titleEl: titleEl });
      }
    }

    // Amazon's notebook lists most-recently-annotated first, so when we are over
    // the cap the top of the list is the part that matters.
    if (candidates.length > maxBooks) candidates = candidates.slice(0, maxBooks);

    if (candidates.length === 0) {
      finish('ok', [], {}, seenTitles, 0);
      return;
    }

    showBanner('Kitab found ' + candidates.length + ' book' + (candidates.length !== 1 ? 's' : '') + ' to check — syncing highlights…');

    var allHighlights = [];
    var bookCounts = {};
    var seen = {};
    var visited = 0;

    // Amazon's notebook is a React SPA — a plain .click() on the container div
    // does not reliably fire React's synthetic handlers. A full mouse event
    // sequence bubbling from the most specific child is far more reliable.
    function fireClick(el) {
      ['mousedown', 'mouseup', 'click'].forEach(function (type) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
    }

    for (var c = 0; c < candidates.length; c++) {
      var book = candidates[c];
      send({ type: 'kitabProgress', current: c + 1, total: candidates.length });

      // Off-screen elements do not reliably receive events.
      book.el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      await sleep(200);

      fireClick(book.el.querySelector('a') || book.titleEl || book.el);

      var annotWait = 0;
      while (annotWait < 6000) {
        if (document.querySelector('#kp-notebook-annotations')) break;
        await sleep(300);
        annotWait += 300;
      }

      // Retry once on the row itself before giving up on this book.
      if (!document.querySelector('#kp-notebook-annotations')) {
        fireClick(book.el);
        await sleep(4000);
      }
      if (!document.querySelector('#kp-notebook-annotations')) continue;

      visited++;
      var countForBook = 0;
      var pageNum = 0;
      var lastRowCount = -1;

      while (pageNum < 30) {
        var rows = document.querySelectorAll(
          '#kp-notebook-annotations .a-row.a-spacing-base, ' +
          '#kp-notebook-annotations .kp-notebook-record'
        );

        // Stale-pagination guard: an unchanged row count means we are stuck.
        if (rows.length > 0 && rows.length === lastRowCount) break;
        lastRowCount = rows.length;

        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var textEl = row.querySelector('.kp-notebook-highlight');
          if (!textEl) continue;
          var text = textEl.textContent.trim();
          if (!text) continue;
          var metaEl = row.querySelector('.kp-notebook-metadata');
          var meta = metaEl ? metaEl.textContent : '';
          var locMatch = meta.match(/Location\s+(\d+)/i);
          var location = locMatch ? parseInt(locMatch[1]) : null;
          var noteEl = row.querySelector('.kp-notebook-note');
          var note = noteEl ? noteEl.textContent.trim() || null : null;
          var key = book.title + '|' + (location || '') + '|' + text.slice(0, 60);
          if (!seen[key]) {
            seen[key] = true;
            countForBook++;
            allHighlights.push({
              bookTitle: book.title,
              bookAuthor: book.author,
              text: text,
              note: note,
              location: location,
            });
          }
        }

        var nextBtn =
          document.querySelector('.kp-notebook-pagination-bar .a-last:not(.a-disabled) a') ||
          document.querySelector('[id*="annotation"] [class*="next"]:not([class*="disabled"]) a') ||
          null;

        var nextToken = document.getElementById('kp-notebook-annotations-next-page-start');
        if ((!nextToken || !nextToken.value) && !nextBtn) break;
        if (!nextBtn) break;

        nextBtn.click();
        await sleep(2000);
        pageNum++;
      }

      bookCounts[book.norm] = countForBook;
    }

    finish('ok', allHighlights, bookCounts, seenTitles, visited);
  })().catch(function (err) {
    removeBanner();
    send({
      type: 'kitabDone',
      status: 'error',
      error: String(err),
      highlights: [],
      bookCounts: {},
      seenTitles: [],
      visited: 0,
    });
    window.__kitabRunning = false;
  });
})();
