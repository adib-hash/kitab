-- ============================================================
-- Kitab — Supabase Schema
-- Run this in your Supabase SQL editor to set up the database
-- ============================================================

-- Books table
CREATE TABLE books (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users NOT NULL,
  google_books_id   TEXT,
  title             TEXT NOT NULL,
  author            TEXT,
  cover_url         TEXT,
  published_year    INT,
  page_count        INT,
  genres            TEXT[] DEFAULT '{}',
  description       TEXT,
  isbn              TEXT,
  status            TEXT NOT NULL DEFAULT 'tbr'
                    CHECK (status IN ('read', 'tbr', 'reading', 'dnf')),
  rating            NUMERIC(2,1) CHECK (rating >= 0.5 AND rating <= 5.0),
  review            TEXT,
  review_spoiler    BOOLEAN DEFAULT FALSE,
  date_started      DATE,
  date_finished     DATE,
  current_page      INT,
  tbr_order         INT DEFAULT 1000,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES auth.users NOT NULL,
  name      TEXT NOT NULL,
  color     TEXT DEFAULT '#0F766E',
  UNIQUE (user_id, name)
);

-- Book <-> Tags join table
CREATE TABLE book_tags (
  book_id   UUID REFERENCES books(id) ON DELETE CASCADE,
  tag_id    UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

-- Annual reading goals
CREATE TABLE reading_goals (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES auth.users NOT NULL,
  year      INT NOT NULL,
  target    INT NOT NULL,
  UNIQUE (user_id, year)
);

-- Skipped recommendations
CREATE TABLE skipped_recommendations (
  user_id           UUID REFERENCES auth.users NOT NULL,
  google_books_id   TEXT NOT NULL,
  title             TEXT,
  skipped_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, google_books_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX books_user_id_idx ON books (user_id);
CREATE INDEX books_status_idx ON books (user_id, status);
CREATE INDEX books_date_finished_idx ON books (user_id, date_finished);
CREATE INDEX book_tags_book_id_idx ON book_tags (book_id);
CREATE INDEX book_tags_tag_id_idx ON book_tags (tag_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE skipped_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their books"
  ON books FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their tags"
  ON tags FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their book_tags"
  ON book_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM books WHERE books.id = book_tags.book_id AND books.user_id = auth.uid()));

CREATE POLICY "Users own their reading goals"
  ON reading_goals FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their skipped recs"
  ON skipped_recommendations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
