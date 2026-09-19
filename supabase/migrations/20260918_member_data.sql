-- Run once in Supabase Dashboard → SQL Editor. This migration uses no service-role key.
-- It creates the minimum member data used by the website and denies anonymous access.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  region text not null default 'global' check (region in ('global', 'cn')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  locale text not null default 'zh' check (locale in ('zh', 'en')),
  conversation jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.projects from anon;
revoke all on table public.profiles from authenticated;
revoke all on table public.projects from authenticated;
grant select on table public.profiles to authenticated;
grant select, insert on table public.projects to authenticated;

drop policy if exists "members read their own profile" on public.profiles;
create policy "members read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "members read their own projects" on public.projects;
create policy "members read their own projects" on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "members create their own projects" on public.projects;
create policy "members create their own projects" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, region)
  values (new.id, 'global')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();
