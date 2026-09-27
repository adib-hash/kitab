-- Supabase advisor 0011 (function_search_path_mutable): pin the search path of
-- the pre-existing updated_at trigger function. Applied 2026-09-26.
alter function public.update_updated_at() set search_path = public;
