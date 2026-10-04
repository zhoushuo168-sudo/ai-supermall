-- Credits ledger. Run once in Supabase Dashboard → SQL Editor.
-- Prices and model rates live in these tables. The website reads them; it does not own the numbers.
-- Members can read their own balance and history. They cannot change either.
-- Reserve, settle, and release run only as security-definer functions for the service role.

create table if not exists public.credit_plans (
  id text primary key check (char_length(id) between 1 and 40),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'CAD' check (char_length(currency) between 3 and 3),
  monthly_credits integer not null check (monthly_credits >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_rates (
  id uuid primary key default gen_random_uuid(),
  model text not null check (char_length(model) between 1 and 80),
  operation text not null check (operation in ('video_generate', 'video_edit')),
  resolution text not null check (resolution in ('720P', '1080P')),
  credits_per_billing_second numeric not null check (credits_per_billing_second > 0),
  billing_rule text not null check (billing_rule in ('output_seconds', 'input_plus_output')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (model, operation, resolution)
);

create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'free' references public.credit_plans(id),
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  task_id text check (task_id is null or char_length(task_id) between 8 and 80),
  model text check (model is null or char_length(model) between 1 and 80),
  credits integer not null check (credits > 0),
  transaction_type text not null check (transaction_type in ('grant', 'reserve', 'debit', 'release')),
  status text not null check (status in ('reserved', 'posted', 'released', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create unique index if not exists credit_transactions_open_task_idx
  on public.credit_transactions (task_id)
  where task_id is not null and status in ('reserved', 'posted');

create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);

insert into public.credit_plans (id, price_cents, currency, monthly_credits)
values
  ('free', 0, 'CAD', 0),
  ('starter', 500, 'CAD', 10),
  ('plus', 1000, 'CAD', 30)
on conflict (id) do nothing;

insert into public.credit_rates (model, operation, resolution, credits_per_billing_second, billing_rule)
values
  ('wan3.0-video', 'video_generate', '720P', 1, 'output_seconds'),
  ('wan3.0-video', 'video_generate', '1080P', 2, 'output_seconds'),
  ('wan3.0-video', 'video_edit', '720P', 1, 'input_plus_output'),
  ('wan3.0-video', 'video_edit', '1080P', 2, 'input_plus_output')
on conflict (model, operation, resolution) do nothing;

insert into public.credit_accounts (user_id, plan_id, balance)
select id, 'free', 0 from auth.users
on conflict (user_id) do nothing;

alter table public.credit_plans enable row level security;
alter table public.credit_rates enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;

revoke all on table public.credit_plans from anon, authenticated;
revoke all on table public.credit_rates from anon, authenticated;
revoke all on table public.credit_accounts from anon, authenticated;
revoke all on table public.credit_transactions from anon, authenticated;

grant select on table public.credit_plans to authenticated;
grant select on table public.credit_rates to authenticated;
grant select on table public.credit_accounts to authenticated;
grant select on table public.credit_transactions to authenticated;

drop policy if exists "members read credit plans" on public.credit_plans;
create policy "members read credit plans"
  on public.credit_plans for select to authenticated using (active);

drop policy if exists "members read credit rates" on public.credit_rates;
create policy "members read credit rates"
  on public.credit_rates for select to authenticated using (active);

drop policy if exists "members read their credit account" on public.credit_accounts;
create policy "members read their credit account"
  on public.credit_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "members read their credit transactions" on public.credit_transactions;
create policy "members read their credit transactions"
  on public.credit_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.create_credit_account_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_accounts (user_id, plan_id, balance)
  values (new.id, 'free', 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_credit_account on auth.users;
create trigger on_auth_user_credit_account
  after insert on auth.users
  for each row execute procedure public.create_credit_account_for_new_user();

create or replace function public.credit_quote(
  p_model text,
  p_operation text,
  p_resolution text,
  p_input_seconds numeric,
  p_output_seconds numeric
) returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric;
  v_rule text;
  v_seconds numeric;
begin
  select credits_per_billing_second, billing_rule into v_rate, v_rule
  from public.credit_rates
  where model = p_model and operation = p_operation and resolution = p_resolution and active
  limit 1;
  if v_rate is null then
    raise exception 'credit_rate_missing';
  end if;
  if v_rule = 'input_plus_output' then
    v_seconds := coalesce(p_input_seconds, 0) + coalesce(p_output_seconds, 0);
  elsif v_rule = 'output_seconds' then
    v_seconds := coalesce(p_output_seconds, 0);
  else
    raise exception 'credit_rule_invalid';
  end if;
  if v_seconds < 0 then
    raise exception 'credit_seconds_invalid';
  end if;
  return ceil(v_rate * v_seconds)::integer;
end;
$$;

create or replace function public.credit_release_abandoned(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund integer;
begin
  perform 1 from public.credit_accounts where user_id = p_user_id for update;
  with released as (
    update public.credit_transactions
    set status = 'released', transaction_type = 'release'
    where user_id = p_user_id
      and status = 'reserved'
      and task_id is null
      and created_at < now() - interval '15 minutes'
    returning credits
  )
  select coalesce(sum(credits), 0) into v_refund from released;
  if v_refund = 0 then
    return;
  end if;
  update public.credit_accounts
  set balance = balance + v_refund, updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function public.credit_preview(
  p_user_id uuid,
  p_model text,
  p_operation text,
  p_resolution text,
  p_input_seconds numeric,
  p_output_seconds numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_credits integer;
begin
  insert into public.credit_accounts (user_id, plan_id, balance)
  values (p_user_id, 'free', 0)
  on conflict (user_id) do nothing;
  perform public.credit_release_abandoned(p_user_id);
  select balance into v_balance from public.credit_accounts where user_id = p_user_id;
  v_credits := public.credit_quote(p_model, p_operation, p_resolution, p_input_seconds, p_output_seconds);
  return jsonb_build_object(
    'ok', true,
    'balance', v_balance,
    'estimated', v_credits,
    'projected', v_balance - v_credits,
    'sufficient', v_balance >= v_credits
  );
end;
$$;

create or replace function public.credit_reserve(
  p_user_id uuid,
  p_idempotency_key text,
  p_model text,
  p_operation text,
  p_resolution text,
  p_input_seconds numeric,
  p_output_seconds numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.credit_transactions;
  v_balance integer;
  v_credits integer;
  v_id uuid;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'credit_key_invalid';
  end if;
  insert into public.credit_accounts (user_id, plan_id, balance)
  values (p_user_id, 'free', 0)
  on conflict (user_id) do nothing;
  perform 1 from public.credit_accounts where user_id = p_user_id for update;
  perform public.credit_release_abandoned(p_user_id);
  select * into v_existing
  from public.credit_transactions
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.user_id <> p_user_id then
      return jsonb_build_object('ok', false, 'code', 'conflict');
    end if;
    select balance into v_balance from public.credit_accounts where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'created', false,
      'status', v_existing.status,
      'credits', v_existing.credits,
      'balance', v_balance,
      'task_id', v_existing.task_id
    );
  end if;
  select balance into v_balance from public.credit_accounts where user_id = p_user_id for update;
  select * into v_existing
  from public.credit_transactions
  where user_id = p_user_id and status = 'reserved'
  order by created_at desc
  limit 1
  for update;
  if found then
    return jsonb_build_object(
      'ok', true,
      'created', false,
      'status', 'reserved',
      'credits', v_existing.credits,
      'balance', v_balance,
      'task_id', v_existing.task_id
    );
  end if;
  v_credits := public.credit_quote(p_model, p_operation, p_resolution, p_input_seconds, p_output_seconds);
  if v_credits <= 0 then
    raise exception 'credit_quote_invalid';
  end if;
  if v_balance < v_credits then
    return jsonb_build_object(
      'ok', false,
      'code', 'insufficient',
      'created', false,
      'balance', v_balance,
      'credits', v_credits,
      'projected', v_balance - v_credits,
      'sufficient', false
    );
  end if;
  insert into public.credit_transactions (
    user_id, idempotency_key, model, credits, transaction_type, status, metadata
  ) values (
    p_user_id, p_idempotency_key, p_model, v_credits, 'reserve', 'reserved',
    jsonb_build_object(
      'operation', p_operation,
      'resolution', p_resolution,
      'input_seconds', p_input_seconds,
      'output_seconds', p_output_seconds
    )
  ) returning id into v_id;
  update public.credit_accounts
  set balance = balance - v_credits, updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;
  return jsonb_build_object(
    'ok', true,
    'created', true,
    'status', 'reserved',
    'credits', v_credits,
    'balance', v_balance,
    'projected', v_balance,
    'task_id', null,
    'transaction_id', v_id
  );
exception
  when unique_violation then
    select * into v_existing from public.credit_transactions where idempotency_key = p_idempotency_key;
    if v_existing.user_id is distinct from p_user_id then
      return jsonb_build_object('ok', false, 'code', 'conflict');
    end if;
    select balance into v_balance from public.credit_accounts where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'created', false,
      'status', v_existing.status,
      'credits', v_existing.credits,
      'balance', v_balance,
      'task_id', v_existing.task_id
    );
end;
$$;

create or replace function public.credit_attach_task(
  p_user_id uuid,
  p_idempotency_key text,
  p_task_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credit_transactions;
begin
  select * into v_row
  from public.credit_transactions
  where idempotency_key = p_idempotency_key and user_id = p_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_row.status <> 'reserved' then
    return jsonb_build_object('ok', true, 'code', 'already', 'status', v_row.status, 'task_id', v_row.task_id);
  end if;
  if v_row.task_id is not null and v_row.task_id <> p_task_id then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  update public.credit_transactions
  set task_id = p_task_id
  where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('ok', true, 'code', 'attached', 'status', v_row.status, 'task_id', v_row.task_id);
end;
$$;

create or replace function public.credit_settle(p_task_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credit_transactions;
begin
  select * into v_row
  from public.credit_transactions
  where task_id = p_task_id and status in ('reserved', 'posted')
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'code', 'not_found');
  end if;
  if v_row.status = 'posted' then
    return jsonb_build_object('ok', true, 'code', 'already', 'credits', v_row.credits);
  end if;
  update public.credit_transactions
  set transaction_type = 'debit', status = 'posted'
  where id = v_row.id and status = 'reserved'
  returning * into v_row;
  return jsonb_build_object('ok', true, 'code', 'posted', 'credits', v_row.credits);
end;
$$;

create or replace function public.credit_release(
  p_task_id text default null,
  p_idempotency_key text default null,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credit_transactions;
begin
  if p_task_id is not null then
    select * into v_row from public.credit_transactions where task_id = p_task_id;
  elsif p_idempotency_key is not null then
    select * into v_row from public.credit_transactions where idempotency_key = p_idempotency_key;
  else
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not found then
    return jsonb_build_object('ok', true, 'code', 'not_found');
  end if;
  if p_user_id is not null and v_row.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  perform 1 from public.credit_accounts where user_id = v_row.user_id for update;
  select * into v_row from public.credit_transactions where id = v_row.id for update;
  if v_row.status <> 'reserved' then
    return jsonb_build_object('ok', true, 'code', 'already', 'status', v_row.status);
  end if;
  update public.credit_accounts
  set balance = balance + v_row.credits, updated_at = now()
  where user_id = v_row.user_id;
  update public.credit_transactions
  set status = 'released', transaction_type = 'release'
  where id = v_row.id and status = 'reserved';
  return jsonb_build_object('ok', true, 'code', 'released', 'credits', v_row.credits);
end;
$$;

revoke all on function public.credit_quote(text, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.credit_release_abandoned(uuid) from public, anon, authenticated;
revoke all on function public.credit_preview(uuid, text, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.credit_reserve(uuid, text, text, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.credit_attach_task(uuid, text, text) from public, anon, authenticated;
revoke all on function public.credit_settle(text) from public, anon, authenticated;
revoke all on function public.credit_release(text, text, uuid) from public, anon, authenticated;

grant execute on function public.credit_quote(text, text, text, numeric, numeric) to service_role;
grant execute on function public.credit_release_abandoned(uuid) to service_role;
grant execute on function public.credit_preview(uuid, text, text, text, numeric, numeric) to service_role;
grant execute on function public.credit_reserve(uuid, text, text, text, text, numeric, numeric) to service_role;
grant execute on function public.credit_attach_task(uuid, text, text) to service_role;
grant execute on function public.credit_settle(text) to service_role;
grant execute on function public.credit_release(text, text, uuid) to service_role;
