-- Supabase Schema for Novel Crafter Backend Memory
-- Project: my-app (irfumfhbdzabnhfyafgk)
-- Dashboard: https://supabase.com/dashboard/project/irfumfhbdzabnhfyafgk

-- Active Primary Table (already provisioned in Supabase project irfumfhbdzabnhfyafgk):
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text not null,
  genre text,
  tone text,
  characters jsonb not null default '[]'::jsonb,
  plot_outline jsonb not null default '{}'::jsonb,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.novel_chapters (
  id text primary key,
  title text not null,
  content_html text not null default '',
  content_text text not null default '',
  summary text not null default '',
  char_count integer not null default 0,
  word_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_novel_chapters_updated_at
  on public.novel_chapters (updated_at desc);

create table if not exists public.novel_memories (
  id text primary key,
  category text not null check (category in ('character', 'world', 'plot', 'timeline', 'styleRule')),
  name text not null,
  details text not null,
  chapter_title text not null default '',
  importance integer not null default 3,
  updated_at timestamptz not null default now()
);

create index if not exists idx_novel_memories_category
  on public.novel_memories (category, importance desc, updated_at desc);

create table if not exists public.novel_chat_history (
  id text primary key,
  chapter_title text not null default '',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_novel_chat_history_created_at
  on public.novel_chat_history (created_at desc);

-- Enable Row Level Security with permissive policies for backend/anon service usage
alter table public.projects enable row level security;
alter table public.novel_chapters enable row level security;
alter table public.novel_memories enable row level security;
alter table public.novel_chat_history enable row level security;

drop policy if exists "Allow all access to projects" on public.projects;
create policy "Allow all access to projects"
  on public.projects for all
  using (true)
  with check (true);

drop policy if exists "Allow all access to novel_chapters" on public.novel_chapters;
create policy "Allow all access to novel_chapters"
  on public.novel_chapters for all
  using (true)
  with check (true);

drop policy if exists "Allow all access to novel_memories" on public.novel_memories;
create policy "Allow all access to novel_memories"
  on public.novel_memories for all
  using (true)
  with check (true);

drop policy if exists "Allow all access to novel_chat_history" on public.novel_chat_history;
create policy "Allow all access to novel_chat_history"
  on public.novel_chat_history for all
  using (true)
  with check (true);

