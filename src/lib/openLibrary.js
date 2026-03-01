const OL_BASE = 'https://openlibrary.org'

// Normalize messy genre strings to canonical ones
const GENRE_MAP = {
  'science fiction': 'Science Fiction',
  'sci-fi': 'Science Fiction',
  'scifi': 'Science Fiction',
  'fantasy': 'Fantasy',
  'epic fantasy': 'Fantasy',
  'high fantasy': 'Fantasy',
  'mystery': 'Mystery',
  'thriller': 'Thriller',
  'suspense': 'Thriller',
  'horror': 'Horror',
  'romance': 'Romance',
  'historical fiction': 'Historical Fiction',
  'literary fiction': 'Literary Fiction',
  'biography': 'Biography',
  'memoir': 'Memoir',
  'self-help': 'Self-Help',
  'self help': 'Self-Help',
  'nonfiction': 'Nonfiction',
  'non-fiction': 'Nonfiction',
  'philosophy': 'Philosophy',
  'psychology': 'Psychology',
  'history': 'History',
  'graphic novel': 'Graphic Novel',
  'comics': 'Graphic Novel',
  'young adult': 'Young Adult',
  'ya': 'Young Adult',
  'adventure': 'Adventure',
  'dystopian': 'Dystopian',
  'dystopia': 'Dystopian',
}

export function normalizeGenre(raw) {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/^fiction\s*[\/\-]\s*/i, '').trim()
  return GENRE_MAP[lower] || (raw.length < 40 ? raw : null)
}

// Get top weighted genres from read books
export function getWeightedGenres(books) {
  const scores = {}
  const counts = {}
  books.forEach(book => {
    const rating = book.rating || 3
    const genres = [
      ...(book.genres || []),
      ...(book.tags?.map(t => t.name) || []),
    ]
    genres.forEach(g => {
      const norm = normalizeGenre(g)
      if (!norm) return
      scores[norm] = (scores[norm] || 0) + rating
      counts[norm] = (counts[norm] || 0) + 1
    })
  })
  return Object.entries(scores)
    .map(([genre, score]) => ({ genre, score: score / counts[genre], count: counts[genre] }))
    .filter(g => g.count >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

// Search Open Library by subject
export async function searchBySubject(subject, limit = 10) {
  try {
    const res = await fetch(
      `${OL_BASE}/search.json?subject=${encodeURIComponent(subject)}&limit=${limit}&fields=key,title,author_name,cover_i,first_publish_year,subject,ratings_average`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs || []).map(doc => ({
      ol_key: doc.key,
      title: doc.title,
      author: doc.author_name?.[0] || 'Unknown Author',
      cover_url: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : null,
      published_year: doc.first_publish_year || null,
      genres: (doc.subject || []).slice(0, 5),
      community_rating: doc.ratings_average ? Math.round(doc.ratings_average * 10) / 10 : null,
      source: 'openlibrary',
    }))
  } catch { return [] }
}

// Get works by author from Open Library
export async function getAuthorWorks(authorName, limit = 8) {
  try {
    const searchRes = await fetch(
      `${OL_BASE}/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`
    )
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const authorKey = searchData.docs?.[0]?.key
    if (!authorKey) return []

    const worksRes = await fetch(
      `${OL_BASE}/authors/${authorKey}/works.json?limit=${limit}`
    )
    if (!worksRes.ok) return []
    const worksData = await worksRes.json()
    return (worksData.entries || []).map(work => ({
      ol_key: work.key,
      title: work.title,
      author: authorName,
      cover_url: work.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`
        : null,
      published_year: null,
      genres: [],
      source: 'openlibrary',
    }))
  } catch { return [] }
}

// Award winners mapped to genres — static, no API call needed
export const AWARD_WINNERS = [
  { title: 'The Road', author: 'Cormac McCarthy', genres: ['Literary Fiction', 'Dystopian'], award: 'Pulitzer', cover_url: null },
  { title: 'All the Light We Cannot See', author: 'Anthony Doerr', genres: ['Historical Fiction', 'Literary Fiction'], award: 'Pulitzer', cover_url: null },
  { title: 'The Goldfinch', author: 'Donna Tartt', genres: ['Literary Fiction', 'Mystery'], award: 'Pulitzer', cover_url: null },
  { title: 'Lincoln in the Bardo', author: 'George Saunders', genres: ['Literary Fiction', 'Historical Fiction'], award: 'Booker', cover_url: null },
  { title: 'Wolf Hall', author: 'Hilary Mantel', genres: ['Historical Fiction'], award: 'Booker', cover_url: null },
  { title: 'The Remains of the Day', author: 'Kazuo Ishiguro', genres: ['Literary Fiction'], award: 'Booker', cover_url: null },
  { title: 'Never Let Me Go', author: 'Kazuo Ishiguro', genres: ['Science Fiction', 'Literary Fiction'], award: 'Booker Shortlist', cover_url: null },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', genres: ['Science Fiction', 'Fantasy'], award: 'Hugo', cover_url: null },
  { title: 'The Name of the Wind', author: 'Patrick Rothfuss', genres: ['Fantasy'], award: 'Quill Award', cover_url: null },
  { title: 'The Way of Kings', author: 'Brandon Sanderson', genres: ['Fantasy'], award: 'David Gemmell', cover_url: null },
  { title: 'Ender\'s Game', author: 'Orson Scott Card', genres: ['Science Fiction', 'Young Adult'], award: 'Hugo', cover_url: null },
  { title: 'Spin', author: 'Robert Charles Wilson', genres: ['Science Fiction'], award: 'Hugo', cover_url: null },
  { title: 'The Three-Body Problem', author: 'Liu Cixin', genres: ['Science Fiction'], award: 'Hugo', cover_url: null },
  { title: 'A Memory Called Empire', author: 'Arkady Martine', genres: ['Science Fiction'], award: 'Hugo', cover_url: null },
  { title: 'This Is How You Lose the Time War', author: 'Amal El-Mohtar', genres: ['Science Fiction', 'Romance'], award: 'Hugo', cover_url: null },
  { title: 'Piranesi', author: 'Susanna Clarke', genres: ['Fantasy', 'Mystery'], award: 'Women\'s Prize', cover_url: null },
  { title: 'Jonathan Strange & Mr Norrell', author: 'Susanna Clarke', genres: ['Fantasy', 'Historical Fiction'], award: 'Hugo', cover_url: null },
  { title: 'The Fifth Season', author: 'N.K. Jemisin', genres: ['Fantasy', 'Science Fiction'], award: 'Hugo', cover_url: null },
  { title: 'Educated', author: 'Tara Westover', genres: ['Memoir'], award: 'Goodreads Choice', cover_url: null },
  { title: 'Sapiens', author: 'Yuval Noah Harari', genres: ['History', 'Nonfiction'], award: 'Goodreads Choice', cover_url: null },
  { title: 'The Sixth Extinction', author: 'Elizabeth Kolbert', genres: ['Nonfiction', 'History'], award: 'Pulitzer', cover_url: null },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genres: ['Psychology', 'Nonfiction'], award: 'Goodreads Choice', cover_url: null },
  { title: 'Atomic Habits', author: 'James Clear', genres: ['Self-Help', 'Nonfiction'], award: 'Goodreads Choice', cover_url: null },
  { title: 'When Breath Becomes Air', author: 'Paul Kalanithi', genres: ['Memoir', 'Biography'], award: 'Goodreads Choice', cover_url: null },
  { title: 'The Sympathizer', author: 'Viet Thanh Nguyen', genres: ['Literary Fiction', 'Historical Fiction'], award: 'Pulitzer', cover_url: null },
  { title: 'A Little Life', author: 'Hanya Yanagihara', genres: ['Literary Fiction'], award: 'Booker Shortlist', cover_url: null },
  { title: 'The Underground Railroad', author: 'Colson Whitehead', genres: ['Historical Fiction', 'Literary Fiction'], award: 'Pulitzer', cover_url: null },
  { title: 'Normal People', author: 'Sally Rooney', genres: ['Literary Fiction', 'Romance'], award: 'Goodreads Choice', cover_url: null },
  { title: 'The Midnight Library', author: 'Matt Haig', genres: ['Literary Fiction', 'Fantasy'], award: 'Goodreads Choice', cover_url: null },
  { title: 'Project Hail Mary', author: 'Andy Weir', genres: ['Science Fiction'], award: 'Hugo Finalist', cover_url: null },
  { title: 'Recursion', author: 'Blake Crouch', genres: ['Science Fiction', 'Thriller'], award: 'Goodreads Choice', cover_url: null },
  { title: 'Dark Matter', author: 'Blake Crouch', genres: ['Science Fiction', 'Thriller'], award: 'Goodreads Choice', cover_url: null },
  { title: 'Klara and the Sun', author: 'Kazuo Ishiguro', genres: ['Science Fiction', 'Literary Fiction'], award: 'Goodreads Choice', cover_url: null },
  { title: 'Exhalation', author: 'Ted Chiang', genres: ['Science Fiction'], award: 'Hugo', cover_url: null },
  { title: 'The Power', author: 'Naomi Alderman', genres: ['Science Fiction', 'Literary Fiction'], award: 'Bailey\'s Women\'s Prize', cover_url: null },
]

export function getAwardWinnersForGenres(userGenres) {
  const topGenres = new Set(userGenres.map(g => g.genre))
  return AWARD_WINNERS
    .filter(book => book.genres.some(g => topGenres.has(g)))
    .sort(() => Math.random() - 0.5) // shuffle for variety
}
