// src/hooks/useHighlights.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ── Kindle WKWebView scraper (injected via @capgo/inappbrowser executeScript) ──
// Communication: window.mobileApp.postMessage() → native addListener('messageFromWebview')
// Polls for DOM readiness instead of fixed delay; prevents double execution.
export const KINDLE_SCRAPER_JS = `
(async function() {
  if (window.__kitabRunning) return;

  // Poll for the Kindle library panel — Amazon renders it async, can take several seconds
  var lib = null;
  var pollStart = Date.now();
  while (Date.now() - pollStart < 15000) {
    lib = document.querySelector('#kp-notebook-library');
    if (lib) break;
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  // Not on the notebook page yet (still on login or a redirect) — exit silently
  if (!lib) return;

  window.__kitabRunning = true;

  // Inject a sticky banner so the user knows not to close the browser
  (function() {
    if (document.getElementById('__kitabBanner')) return;
    var b = document.createElement('div');
    b.id = '__kitabBanner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0d9488;color:#fff;text-align:center;padding:12px 16px;font-size:14px;font-weight:600;font-family:-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);';
    b.textContent = 'Kitab is loading your Kindle notebook — please wait…';
    document.body.prepend(b);
  })();

  function removeBanner() {
    var b = document.getElementById('__kitabBanner');
    if (b) b.remove();
  }

  // Scroll until the book list stops growing (handles large libraries with lazy-loading)
  var prevCount = -1, stableFor = 0;
  var scrollStart = Date.now();
  while (Date.now() - scrollStart < 30000) {
    window.scrollBy(0, 600);
    await new Promise(function(r) { setTimeout(r, 400); });
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
  await new Promise(function(r) { setTimeout(r, 1000); });

  // Re-query after scrolling to capture lazily loaded book rows
  var bookItems = Array.from(document.querySelectorAll('#kp-notebook-library > .a-row[id]'));
  if (bookItems.length === 0) {
    removeBanner();
    window.mobileApp.postMessage({ detail: { type: 'kitabDone', highlights: [] } });
    window.__kitabRunning = false;
    return;
  }

  // Update banner with discovered book count
  (function() {
    var b = document.getElementById('__kitabBanner');
    if (b) b.textContent = 'Kitab found ' + bookItems.length + ' book' + (bookItems.length !== 1 ? 's' : '') + ' — syncing highlights…';
  })();

  var allHighlights = [];
  var seen = new Set();

  for (var i = 0; i < bookItems.length; i++) {
    var bookEl = bookItems[i];
    var titleEl = bookEl.querySelector('.kp-notebook-searchable') ||
                  bookEl.querySelector('[class*="title"]') ||
                  bookEl.querySelector('h2') || bookEl.querySelector('h3');
    var bookTitle = titleEl ? titleEl.textContent.trim() : 'Unknown';
    var authorEl = bookEl.querySelector('.a-color-secondary') ||
                   bookEl.querySelector('[class*="author"]');
    var bookAuthor = authorEl ? authorEl.textContent.trim() : null;

    window.mobileApp.postMessage({ detail: { type: 'kitabProgress', current: i + 1, total: bookItems.length } });

    // Scroll the book row into view — off-screen elements may not receive events reliably
    bookEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    await new Promise(function(r) { setTimeout(r, 200); });

    // Dispatch a full mouse event sequence on the most specific clickable element.
    // Amazon's notebook is a React SPA — simple .click() on the container div does not
    // reliably fire React's synthetic event handlers. Bubbling mousedown/mouseup/click
    // from a child element (the title link or the row itself) is far more reliable.
    function fireClick(el) {
      ['mousedown', 'mouseup', 'click'].forEach(function(type) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
    }
    var clickTarget = bookEl.querySelector('a') || titleEl || bookEl;
    fireClick(clickTarget);

    // Poll for the annotations panel to appear (up to 6s)
    var annotWait = 0;
    while (annotWait < 6000) {
      if (document.querySelector('#kp-notebook-annotations')) break;
      await new Promise(function(r) { setTimeout(r, 300); });
      annotWait += 300;
    }

    // If still no annotations panel, retry the click on the row itself and wait 4s more
    if (!document.querySelector('#kp-notebook-annotations')) {
      fireClick(bookEl);
      await new Promise(function(r) { setTimeout(r, 4000); });
    }

    if (!document.querySelector('#kp-notebook-annotations')) continue;

    var pageNum = 0;
    var lastRowCount = -1;

    while (pageNum < 30) {
      var rows = document.querySelectorAll(
        '#kp-notebook-annotations .a-row.a-spacing-base, ' +
        '#kp-notebook-annotations .kp-notebook-record'
      );

      // Stale-pagination guard: if row count hasn't changed, we're stuck — stop
      if (rows.length > 0 && rows.length === lastRowCount) break;
      lastRowCount = rows.length;

      rows.forEach(function(row) {
        var textEl = row.querySelector('.kp-notebook-highlight');
        if (!textEl) return;
        var text = textEl.textContent.trim();
        if (!text) return;
        var metaEl = row.querySelector('.kp-notebook-metadata');
        var meta = metaEl ? metaEl.textContent : '';
        var locMatch = meta.match(/Location\\s+(\\d+)/i);
        var location = locMatch ? parseInt(locMatch[1]) : null;
        var noteEl = row.querySelector('.kp-notebook-note');
        var note = noteEl ? noteEl.textContent.trim() || null : null;
        var key = bookTitle + '|' + (location || '') + '|' + text.slice(0, 60);
        if (!seen.has(key)) {
          seen.add(key);
          allHighlights.push({ bookTitle: bookTitle, bookAuthor: bookAuthor, text: text, note: note, location: location });
        }
      });

      // Try primary selector then a fallback for the "next page" button
      var nextBtn =
        document.querySelector('.kp-notebook-pagination-bar .a-last:not(.a-disabled) a') ||
        document.querySelector('[id*="annotation"] [class*="next"]:not([class*="disabled"]) a') ||
        null;

      var nextToken = document.getElementById('kp-notebook-annotations-next-page-start');
      if ((!nextToken || !nextToken.value) && !nextBtn) break;
      if (!nextBtn) break;

      nextBtn.click();
      await new Promise(function(r) { setTimeout(r, 2000); });
      pageNum++;
    }
  }

  removeBanner();
  window.mobileApp.postMessage({ detail: { type: 'kitabDone', highlights: allHighlights } });
  window.__kitabRunning = false;
})().catch(function(err) {
  window.mobileApp.postMessage({ detail: { type: 'kitabDone', error: String(err), highlights: [] } });
  window.__kitabRunning = false;
});
`

export function useHighlights(bookId) {
  return useQuery({
    queryKey: ['highlights', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .eq('book_id', bookId)
        .order('location', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useHighlightCount(bookId) {
  return useQuery({
    queryKey: ['highlight_count', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('highlights')
        .select('*', { count: 'exact', head: true })
        .eq('book_id', bookId)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useAllUnmatched() {
  return useQuery({
    queryKey: ['highlights_unmatched'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .is('book_id', null)
        .order('book_title')
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useDeleteUnmatched() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookTitle }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('highlights')
        .delete()
        .eq('user_id', user.id)
        .eq('book_title', bookTitle)
        .is('book_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      toast.success('Removed')
    },
    onError: (err) => toast.error(`Failed to remove: ${err.message}`),
  })
}

export function useAssignHighlights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookTitle, bookId }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('highlights')
        .update({ book_id: bookId })
        .eq('user_id', user.id)
        .eq('book_title', bookTitle)
        .is('book_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      toast.success('Highlights linked!')
    },
    onError: (err) => toast.error(`Failed to link: ${err.message}`),
  })
}

function normalize(str = '') {
  return str.toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchBook(rwBook, kitabBooks) {
  const rwTitle = normalize(rwBook.title)
  const rwAuthor = normalize(rwBook.author || '')

  let m = kitabBooks.find(k => normalize(k.title) === rwTitle)
  if (m) return m.id

  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return kt.length >= 4 && rwTitle.startsWith(kt)
  })
  if (m) return m.id

  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return rwTitle.length >= 4 && kt.startsWith(rwTitle)
  })
  if (m) return m.id

  const rwFirstWord = rwAuthor.split(' ')[0]
  if (rwFirstWord.length >= 3) {
    m = kitabBooks.find(k => {
      const kt = normalize(k.title)
      const ka = normalize(k.author || '')
      const titleOverlap = rwTitle.includes(kt.slice(0, 6)) || kt.includes(rwTitle.slice(0, 6))
      return titleOverlap && ka.startsWith(rwFirstWord)
    })
    if (m) return m.id
  }

  return null
}

function clippingHash(bookTitle, location, text) {
  const key = `${bookTitle}|${location ?? ''}|${text.slice(0, 100)}`
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = (((h << 5) + h) ^ key.charCodeAt(i)) >>> 0
  }
  return h.toString()
}

// Shared upsert logic — returns { totalHighlights, unmatched } where totalHighlights
// is the count of *newly inserted* rows (duplicates silently skipped by ON CONFLICT DO NOTHING)
async function upsertHighlights(user, kitabBooks, highlights) {
  const byBook = {}
  for (const h of highlights) {
    if (!byBook[h.bookTitle]) byBook[h.bookTitle] = { ...h, highlights: [] }
    byBook[h.bookTitle].highlights.push(h)
  }

  let totalHighlights = 0, unmatched = 0
  for (const [bookTitle, group] of Object.entries(byBook)) {
    const matchedBookId = matchBook(
      { title: bookTitle, author: group.bookAuthor },
      kitabBooks || []
    )
    if (!matchedBookId) unmatched++

    const rows = group.highlights.map(h => ({
      user_id: user.id,
      book_id: matchedBookId,
      clipping_hash: clippingHash(h.bookTitle, h.location, h.text),
      text: h.text,
      note: h.note || null,
      location: h.location,
      book_title: h.bookTitle,
      book_author: h.bookAuthor,
      highlighted_at: h.highlighted_at || null,
    }))

    const { data, error } = await supabase
      .from('highlights')
      .upsert(rows, { onConflict: 'clipping_hash', ignoreDuplicates: true })
      .select('id')
    // data contains only the rows that were actually inserted (not skipped duplicates)
    if (!error) totalHighlights += data?.length ?? 0
  }
  return { totalHighlights, unmatched }
}

export function useKindleSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ highlights }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: kitabBooks } = await supabase
        .from('books').select('id, title, author').eq('user_id', user.id)
      return upsertHighlights(user, kitabBooks, highlights)
    },
    onSuccess: ({ totalHighlights, unmatched }) => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      const msg = `${totalHighlights} new highlight${totalHighlights !== 1 ? 's' : ''} imported`
        + (unmatched > 0 ? ` · ${unmatched} unmatched` : '')
      toast.success(msg, { duration: 5000 })
    },
    onError: (err) => toast.error(err.message),
  })
}
