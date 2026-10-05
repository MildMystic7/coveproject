-- COVE keeps the whole harbor in one row. Run this once in the Supabase SQL editor.
create table if not exists public.world (
  id integer primary key,
  data jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Only the server (service role key) touches this table; browsers go through /api.
alter table public.world enable row level security;
