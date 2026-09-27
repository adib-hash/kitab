-- v3.0 Commonplace Book: typed highlights and per-book notes. Additive only.
-- Applied to project tlallvcrogadqgtzuoko on 2026-09-26.

alter table public.highlights
  add column if not exists source text not null default 'kindle',
  add column if not exists page integer;

alter table public.highlights
  add constraint highlights_source_check check (source in ('kindle', 'manual')),
  add constraint highlights_page_check check (page is null or page > 0);

create table if not exists public.book_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  highlight_id uuid references public.highlights(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 5000),
  page integer check (page is null or page > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_notes_book_id_idx on public.book_notes (book_id);
create index if not exists book_notes_highlight_id_idx on public.book_notes (highlight_id) where highlight_id is not null;
create index if not exists book_notes_user_created_idx on public.book_notes (user_id, created_at desc);

alter table public.book_notes enable row level security;

create policy "Users read own notes" on public.book_notes
  for select using (auth.uid() = user_id);
create policy "Users insert own notes on own books" on public.book_notes
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
  );
create policy "Users update own notes" on public.book_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own notes" on public.book_notes
  for delete using (auth.uid() = user_id);

create or replace function public.book_notes_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger book_notes_touch_updated_at
  before update on public.book_notes
  for each row execute function public.book_notes_touch_updated_at();
