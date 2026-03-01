const OL_BASE = 'https://openlibrary.org'

// ── Genre normalization ───────────────────────────────────────────────────────

const GENRE_MAP = {
  'science fiction': 'Science Fiction',
  'sci-fi': 'Science Fiction',
  'scifi': 'Science Fiction',
  'space opera': 'Science Fiction',
  'cyberpunk': 'Science Fiction',
  'fantasy': 'Fantasy',
  'epic fantasy': 'Fantasy',
  'high fantasy': 'Fantasy',
  'dark fantasy': 'Fantasy',
  'urban fantasy': 'Fantasy',
  'mystery': 'Mystery',
  'detective': 'Mystery',
  'crime': 'Mystery',
  'thriller': 'Thriller',
  'suspense': 'Thriller',
  'psychological thriller': 'Thriller',
  'horror': 'Horror',
  'romance': 'Romance',
  'historical fiction': 'Historical Fiction',
  'historical novel': 'Historical Fiction',
  'literary fiction': 'Literary Fiction',
  'contemporary fiction': 'Literary Fiction',
  'biography': 'Biography',
  'autobiography': 'Biography',
  'memoir': 'Memoir',
  'self-help': 'Self-Help',
  'self help': 'Self-Help',
  'personal development': 'Self-Help',
  'nonfiction': 'Nonfiction',
  'non-fiction': 'Nonfiction',
  'philosophy': 'Philosophy',
  'psychology': 'Psychology',
  'history': 'History',
  'graphic novel': 'Graphic Novel',
  'comics': 'Graphic Novel',
  'manga': 'Graphic Novel',
  'young adult': 'Young Adult',
  'ya': 'Young Adult',
  'adventure': 'Adventure',
  'dystopian': 'Dystopian',
  'dystopia': 'Dystopian',
  'short stories': 'Short Stories',
  'business': 'Business',
  'economics': 'Economics',
  'politics': 'Politics',
  'spirituality': 'Spirituality',
  'religion': 'Spirituality',
  'science': 'Science',
  'popular science': 'Science',
}

// Terms that are personal tags or non-genre categories — never use for recommendations
const GENRE_BLOCKLIST = new Set([
  '2020', '2021', '2022', '2023', '2024', '2025', '2026',
  'fiction', 'books', 'ebook', 'audiobook', 'read', 'reading',
  'games', 'game', 'gaming', 'sports', 'cooking', 'activities',
  'juvenile fiction', 'juvenile nonfiction', 'juvenile literature',
  'children', "children's", 'picture books',
  'textbook', 'academic', 'reference', 'education', 'educational',
  'workbook', 'study guide', 'coloring',
  'film/tv-adaptation', 'comic/graphic-novel', 'business', 'finance',
])

export function normalizeGenre(raw) {
  if (!raw) return null
  const lower = raw
    .toLowerCase()
    .replace(/^fiction\s*[\/\-\:]\s*/i, '')
    .replace(/^nonfiction\s*[\/\-\:]\s*/i, '')
    .trim()

  // Blocklist check
  if (GENRE_BLOCKLIST.has(lower)) return null
  // Must not be a year
  if (/^\d{4}$/.test(lower)) return null
  // Must not be too long (academic subject headings)
  if (raw.length > 35) return null

  return GENRE_MAP[lower] || null
}

// Get top weighted genres from read books — ONLY from book.genres, never from user tags
export function getWeightedGenres(books) {
  const scores = {}
  const counts = {}

  books.forEach(book => {
    const rating = book.rating || 3
    // ONLY use genres from Google Books metadata, not personal tags
    const genres = book.genres || []
    genres.forEach(g => {
      const norm = normalizeGenre(g)
      if (!norm) return
      scores[norm] = (scores[norm] || 0) + rating
      counts[norm] = (counts[norm] || 0) + 1
    })
  })

  return Object.entries(scores)
    .map(([genre, score]) => ({
      genre,
      score: score / counts[genre],
      count: counts[genre],
    }))
    .filter(g => g.count >= 2) // Must appear on at least 2 books for signal
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

// ── Quality filtering ─────────────────────────────────────────────────────────

const TITLE_BLOCKLIST = [
  'summary', 'study guide', 'workbook', 'coloring', 'abridged',
  'cliffsnotes', 'sparknotes', 'analysis of', 'box set', 'boxed set',
  "collector's edition", 'slipcase', 'omnibus', 'companion to',
  'illustrated edition', 'deluxe edition', 'anniversary edition',
  'complete collection', 'trilogy boxed', 'guide to', 'introduction to',
  'handbook', 'encyclopedia', 'dictionary', 'textbook',
]

export function isQualityBook(book) {
  if (!book.title || !book.author) return false
  if (book.author === 'Unknown Author') return false

  const titleLower = book.title.toLowerCase()

  // Block known low-quality title patterns
  if (TITLE_BLOCKLIST.some(term => titleLower.includes(term))) return false

  // Block excessively long titles (usually academic)
  if (book.title.length > 75) return false

  // Community rating floor if available
  if (book.community_rating && book.community_rating < 3.8) return false

  return true
}

// Normalize title for smart deduplication
export function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s*[\(\[].*?[\)\]]/g, '') // strip "(Deluxe Edition)", "[Book 1]"
    .replace(/[^a-z0-9\s]/g, '')        // strip punctuation
    .replace(/\b(the|a|an)\b/g, '')     // strip articles
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Open Library API ─────────────────────────────────────────────────────────

export async function searchBySubject(subject, limit = 10, offset = 0) {
  try {
    const res = await fetch(
      `${OL_BASE}/search.json?subject=${encodeURIComponent(subject)}&limit=${limit}&offset=${offset}&sort=rating+desc&fields=key,title,author_name,cover_i,first_publish_year,subject,ratings_average,number_of_pages_median`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs || []).map(doc => ({
      ol_key: doc.key,
      title: doc.title,
      author: doc.author_name?.[0] || null,
      cover_url: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : null,
      published_year: doc.first_publish_year || null,
      page_count: doc.number_of_pages_median || null,
      genres: (doc.subject || []).slice(0, 5),
      community_rating: doc.ratings_average
        ? Math.round(doc.ratings_average * 10) / 10
        : null,
      source: 'openlibrary',
    }))
  } catch { return [] }
}

// ── Award winners (static, curated, quality-filtered) ────────────────────────

export const AWARD_WINNERS = [
  // Science Fiction
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.0 },
  { title: "The Dispossessed", author: 'Ursula K. Le Guin', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.1 },
  { title: "Ender's Game", author: 'Orson Scott Card', genres: ['Science Fiction', 'Young Adult'], award: 'Hugo', minRating: 4.3 },
  { title: 'The Three-Body Problem', author: 'Liu Cixin', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.1 },
  { title: 'A Memory Called Empire', author: 'Arkady Martine', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.0 },
  { title: 'This Is How You Lose the Time War', author: 'Amal El-Mohtar', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.1 },
  { title: 'Project Hail Mary', author: 'Andy Weir', genres: ['Science Fiction'], award: 'Hugo Finalist', minRating: 4.5 },
  { title: 'Recursion', author: 'Blake Crouch', genres: ['Science Fiction', 'Thriller'], award: 'Goodreads Choice', minRating: 4.2 },
  { title: 'Exhalation', author: 'Ted Chiang', genres: ['Science Fiction', 'Short Stories'], award: 'Hugo', minRating: 4.4 },
  { title: 'Klara and the Sun', author: 'Kazuo Ishiguro', genres: ['Science Fiction', 'Literary Fiction'], award: 'Goodreads Choice', minRating: 3.9 },
  { title: 'Never Let Me Go', author: 'Kazuo Ishiguro', genres: ['Science Fiction', 'Literary Fiction'], award: 'Booker Shortlist', minRating: 3.9 },
  { title: 'Spin', author: 'Robert Charles Wilson', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.0 },
  { title: 'Hyperion', author: 'Dan Simmons', genres: ['Science Fiction'], award: 'Hugo', minRating: 4.3 },
  { title: 'The Power', author: 'Naomi Alderman', genres: ['Science Fiction', 'Literary Fiction'], award: "Women's Prize", minRating: 3.9 },
  // Fantasy
  { title: 'The Name of the Wind', author: 'Patrick Rothfuss', genres: ['Fantasy'], award: 'Quill Award', minRating: 4.5 },
  { title: 'The Way of Kings', author: 'Brandon Sanderson', genres: ['Fantasy'], award: 'David Gemmell', minRating: 4.6 },
  { title: 'Piranesi', author: 'Susanna Clarke', genres: ['Fantasy', 'Mystery'], award: "Women's Prize", minRating: 4.2 },
  { title: 'Jonathan Strange & Mr Norrell', author: 'Susanna Clarke', genres: ['Fantasy', 'Historical Fiction'], award: 'Hugo', minRating: 4.1 },
  { title: 'The Fifth Season', author: 'N.K. Jemisin', genres: ['Fantasy', 'Science Fiction'], award: 'Hugo', minRating: 4.3 },
  { title: 'The Lies of Locke Lamora', author: 'Scott Lynch', genres: ['Fantasy'], award: 'World Fantasy Finalist', minRating: 4.3 },
  { title: 'Words of Radiance', author: 'Brandon Sanderson', genres: ['Fantasy'], award: 'David Gemmell', minRating: 4.7 },
  { title: 'The Shadow of the Wind', author: 'Carlos Ruiz Zafón', genres: ['Mystery', 'Historical Fiction', 'Literary Fiction'], award: 'Goodreads Choice', minRating: 4.3 },
  // Literary Fiction
  { title: 'The Road', author: 'Cormac McCarthy', genres: ['Literary Fiction', 'Dystopian'], award: 'Pulitzer', minRating: 4.0 },
  { title: 'All the Light We Cannot See', author: 'Anthony Doerr', genres: ['Historical Fiction', 'Literary Fiction'], award: 'Pulitzer', minRating: 4.4 },
  { title: 'Lincoln in the Bardo', author: 'George Saunders', genres: ['Literary Fiction', 'Historical Fiction'], award: 'Booker', minRating: 3.9 },
  { title: 'Wolf Hall', author: 'Hilary Mantel', genres: ['Historical Fiction'], award: 'Booker', minRating: 4.1 },
  { title: 'The Remains of the Day', author: 'Kazuo Ishiguro', genres: ['Literary Fiction'], award: 'Booker', minRating: 4.0 },
  { title: 'A Little Life', author: 'Hanya Yanagihara', genres: ['Literary Fiction'], award: 'Booker Shortlist', minRating: 4.3 },
  { title: 'The Underground Railroad', author: 'Colson Whitehead', genres: ['Historical Fiction', 'Literary Fiction'], award: 'Pulitzer', minRating: 4.1 },
  { title: 'The Sympathizer', author: 'Viet Thanh Nguyen', genres: ['Literary Fiction', 'Historical Fiction'], award: 'Pulitzer', minRating: 4.0 },
  { title: 'Normal People', author: 'Sally Rooney', genres: ['Literary Fiction', 'Romance'], award: 'Goodreads Choice', minRating: 3.9 },
  { title: 'The Midnight Library', author: 'Matt Haig', genres: ['Literary Fiction', 'Fantasy'], award: 'Goodreads Choice', minRating: 4.0 },
  { title: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin', genres: ['Literary Fiction'], award: 'Goodreads Choice', minRating: 4.3 },
  { title: 'Demon Copperhead', author: 'Barbara Kingsolver', genres: ['Literary Fiction', 'Historical Fiction'], award: 'Pulitzer', minRating: 4.2 },
  // Mystery / Thriller
  { title: 'Gone Girl', author: 'Gillian Flynn', genres: ['Mystery', 'Thriller'], award: 'Goodreads Choice', minRating: 4.0 },
  { title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson', genres: ['Mystery', 'Thriller'], award: 'Goodreads Choice', minRating: 4.1 },
  { title: 'Big Little Lies', author: 'Liane Moriarty', genres: ['Mystery', 'Literary Fiction'], award: 'Goodreads Choice', minRating: 4.2 },
  { title: 'The Secret History', author: 'Donna Tartt', genres: ['Mystery', 'Literary Fiction'], award: 'Goodreads Choice', minRating: 4.3 },
  // Nonfiction / Memoir / Biography
  { title: 'Educated', author: 'Tara Westover', genres: ['Memoir', 'Biography'], award: 'Goodreads Choice', minRating: 4.5 },
  { title: 'Sapiens', author: 'Yuval Noah Harari', genres: ['History', 'Nonfiction'], award: 'Goodreads Choice', minRating: 4.4 },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genres: ['Psychology', 'Nonfiction'], award: 'Goodreads Choice', minRating: 4.2 },
  { title: 'When Breath Becomes Air', author: 'Paul Kalanithi', genres: ['Memoir', 'Biography'], award: 'Goodreads Choice', minRating: 4.5 },
  { title: 'The Sixth Extinction', author: 'Elizabeth Kolbert', genres: ['Nonfiction', 'Science'], award: 'Pulitzer', minRating: 4.1 },
  { title: 'Born a Crime', author: 'Trevor Noah', genres: ['Memoir', 'Biography'], award: 'Goodreads Choice', minRating: 4.5 },
  { title: 'Between the World and Me', author: 'Ta-Nehisi Coates', genres: ['Nonfiction', 'Biography'], award: 'National Book Award', minRating: 4.2 },
  { title: 'Just Kids', author: 'Patti Smith', genres: ['Memoir', 'Biography'], award: 'National Book Award', minRating: 4.2 },
  { title: 'The Immortal Life of Henrietta Lacks', author: 'Rebecca Skloot', genres: ['Nonfiction', 'Science'], award: 'Wellcome Book Prize', minRating: 4.4 },
  // Self-Help / Business
  { title: 'Atomic Habits', author: 'James Clear', genres: ['Self-Help', 'Nonfiction'], award: 'Goodreads Choice', minRating: 4.4 },
  { title: 'Deep Work', author: 'Cal Newport', genres: ['Self-Help', 'Business'], award: 'Goodreads Choice', minRating: 4.2 },
  { title: 'The Psychology of Money', author: 'Morgan Housel', genres: ['Business', 'Nonfiction'], award: 'Goodreads Choice', minRating: 4.3 },
  { title: 'Shoe Dog', author: 'Phil Knight', genres: ['Biography', 'Business'], award: 'Goodreads Choice', minRating: 4.5 },
  { title: 'Zero to One', author: 'Peter Thiel', genres: ['Business', 'Nonfiction'], award: 'Goodreads Choice', minRating: 4.2 },
]

export function getAwardWinnersForGenres(userGenres) {
  const topGenres = new Set(userGenres.map(g => g.genre))
  return AWARD_WINNERS
    .filter(book => book.genres.some(g => topGenres.has(g)))
    .map(b => ({ ...b, cover_url: null, source: 'award' }))
}
