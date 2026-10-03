-- Golf analysis skeleton. Run once in Supabase Dashboard → SQL Editor.
-- Does not alter public.projects, public.conversations, storage, or existing RLS.
-- A Golf session stays the existing project row. The original swing video stays in OSS.
-- No reference numbers, issue rules, or analysis results are inserted here.

create table if not exists public.golf_reference_metrics (
  id uuid primary key default gen_random_uuid(),
  club text not null check (club in ('driver', 'iron')),
  view text not null check (view in ('side', 'face-on', 'down-the-line')),
  phase text not null check (phase in ('setup', 'takeaway', 'backswing', 'top', 'downswing', 'impact', 'follow-through')),
  metric_key text not null check (char_length(metric_key) between 1 and 80),
  min_value numeric,
  max_value numeric,
  unit text check (unit is null or char_length(unit) between 1 and 40),
  model_version text not null check (char_length(model_version) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (club, view, phase, metric_key, model_version)
);

create table if not exists public.golf_issue_rules (
  id uuid primary key default gen_random_uuid(),
  issue_key text not null check (char_length(issue_key) between 1 and 80),
  club text not null check (club in ('driver', 'iron')),
  view text not null check (view in ('side', 'face-on', 'down-the-line')),
  metric_key text not null check (char_length(metric_key) between 1 and 80),
  condition text check (condition is null or char_length(condition) <= 500),
  title_zh text check (title_zh is null or char_length(title_zh) <= 200),
  title_en text check (title_en is null or char_length(title_en) <= 200),
  description_zh text check (description_zh is null or char_length(description_zh) <= 2000),
  description_en text check (description_en is null or char_length(description_en) <= 2000),
  search_keyword_zh text check (search_keyword_zh is null or char_length(search_keyword_zh) <= 200),
  search_keyword_en text check (search_keyword_en is null or char_length(search_keyword_en) <= 200),
  priority integer,
  model_version text not null check (char_length(model_version) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (issue_key, club, view, model_version)
);

create table if not exists public.golf_analysis_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  club text not null check (club in ('driver', 'iron')),
  view text not null check (view in ('side', 'face-on', 'down-the-line')),
  issue_key text check (issue_key is null or char_length(issue_key) between 1 and 80),
  metric_key text not null check (char_length(metric_key) between 1 and 80),
  measured_value numeric,
  reference_min numeric,
  reference_max numeric,
  deviation numeric,
  severity text check (severity is null or char_length(severity) <= 40),
  model_version text not null check (char_length(model_version) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists golf_reference_metrics_lookup_idx
  on public.golf_reference_metrics (club, view, model_version, phase, metric_key);

create index if not exists golf_issue_rules_lookup_idx
  on public.golf_issue_rules (club, view, model_version, issue_key);

create index if not exists golf_analysis_results_user_idx
  on public.golf_analysis_results (user_id, created_at desc);

create index if not exists golf_analysis_results_session_idx
  on public.golf_analysis_results (session_id, created_at desc);

alter table public.golf_reference_metrics enable row level security;
alter table public.golf_issue_rules enable row level security;
alter table public.golf_analysis_results enable row level security;

revoke all on table public.golf_reference_metrics from anon, authenticated;
revoke all on table public.golf_issue_rules from anon, authenticated;
revoke all on table public.golf_analysis_results from anon, authenticated;

grant select on table public.golf_reference_metrics to authenticated;
grant select on table public.golf_issue_rules to authenticated;
grant select, insert on table public.golf_analysis_results to authenticated;

drop policy if exists "members read golf reference metrics" on public.golf_reference_metrics;
create policy "members read golf reference metrics"
  on public.golf_reference_metrics for select to authenticated using (true);

drop policy if exists "members read golf issue rules" on public.golf_issue_rules;
create policy "members read golf issue rules"
  on public.golf_issue_rules for select to authenticated using (true);

drop policy if exists "members read their own golf analysis" on public.golf_analysis_results;
create policy "members read their own golf analysis"
  on public.golf_analysis_results for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "members insert their own golf analysis" on public.golf_analysis_results;
create policy "members insert their own golf analysis"
  on public.golf_analysis_results for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects
      where projects.id = session_id
        and projects.owner_id = (select auth.uid())
    )
  );
