-- AI SuperMall ordinary chat history. Run once in Supabase SQL Editor.
-- This is separate from public.projects and does not change existing Project data or policies.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  locale text not null default 'zh' check (locale in ('zh', 'en')),
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_owner_updated_idx
  on public.conversations (owner_id, updated_at desc);

alter table public.conversations enable row level security;

revoke all on table public.conversations from anon;
revoke all on table public.conversations from authenticated;
grant select, insert, update on table public.conversations to authenticated;

drop policy if exists "members read their own conversations" on public.conversations;
create policy "members read their own conversations" on public.conversations
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "members create their own conversations" on public.conversations;
create policy "members create their own conversations" on public.conversations
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "members update their own conversations" on public.conversations;
create policy "members update their own conversations" on public.conversations
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
