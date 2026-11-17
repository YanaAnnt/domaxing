-- Domaxing v2: assistant, calendars, sections, push.
-- Run after schema.sql. Idempotent.

-- ---------- sections inside lists, task provenance ----------
alter table public.lists add column if not exists sections jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists section_id uuid;
alter table public.tasks add column if not exists event_key text;   -- calendar event this task prepares for
alter table public.tasks add column if not exists source text;      -- 'ai' | 'rules' | null (manual)

-- ---------- assistant preferences ----------
create table if not exists public.user_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'UTC',
  briefing_enabled boolean not null default true,
  briefing_time text not null default '08:00',
  quiet_start text not null default '22:00',
  quiet_end text not null default '07:30',
  max_daily_push integer not null default 4 check (max_daily_push between 0 and 20),
  default_reminder_minutes integer not null default 30,
  study_minutes integer not null default 60,
  work_time text not null default 'evening' check (work_time in ('morning', 'afternoon', 'evening')),
  prep jsonb not null default '{
    "exam":     {"enabled": true, "leadDays": 14},
    "travel":   {"enabled": true, "leadDays": 30},
    "meeting":  {"enabled": true, "leadDays": 3},
    "birthday": {"enabled": true, "leadDays": 7},
    "deadline": {"enabled": true, "leadDays": 5}
  }'::jsonb,
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- calendars (secrets never readable by the browser) ----------
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook', 'apple', 'ics')),
  kind text not null check (kind in ('ics', 'oauth')),
  name text not null,
  color text not null default 'blue',
  ics_url text,
  account_email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'pending',
  error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  event_key text not null,
  title text not null default '',
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'confirmed',
  prev_starts_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);

-- ---------- AI suggestions inbox ----------
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  event_key text,
  kind text not null check (kind in ('prep', 'reschedule', 'cleanup')),
  category text,
  title text not null,
  reason text,
  event_title text,
  event_start timestamptz,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed', 'expired')),
  source text not null default 'rules',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists ai_suggestions_user_status_idx on public.ai_suggestions (user_id, status);

-- ---------- push + briefings ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, key)
);

create table if not exists public.briefings (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  content text not null,
  source text not null default 'rules',
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------- row level security ----------
alter table public.user_prefs enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.briefings enable row level security;

drop policy if exists "own prefs" on public.user_prefs;
create policy "own prefs" on public.user_prefs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "read own connections" on public.calendar_connections;
create policy "read own connections" on public.calendar_connections for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "delete own connections" on public.calendar_connections;
create policy "delete own connections" on public.calendar_connections for delete to authenticated
  using ((select auth.uid()) = user_id);
-- Browsers may only see non-secret columns; inserts/updates go through the calendar edge function.
revoke all on public.calendar_connections from anon, authenticated;
grant select (id, user_id, provider, kind, name, color, account_email, status, error, last_synced_at, created_at)
  on public.calendar_connections to authenticated;
grant delete on public.calendar_connections to authenticated;

drop policy if exists "read own events" on public.calendar_events;
create policy "read own events" on public.calendar_events for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.calendar_events from anon, authenticated;

drop policy if exists "read own suggestions" on public.ai_suggestions;
create policy "read own suggestions" on public.ai_suggestions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "decide own suggestions" on public.ai_suggestions;
create policy "decide own suggestions" on public.ai_suggestions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke insert, delete, update on public.ai_suggestions from anon, authenticated;
grant update (status, decided_at, payload) on public.ai_suggestions to authenticated;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- notification_log: service role only (RLS on, no policies)
revoke all on public.notification_log from anon, authenticated;

drop policy if exists "read own briefings" on public.briefings;
create policy "read own briefings" on public.briefings for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.briefings from anon, authenticated;

-- ---------- server secrets from Vault (service role only) ----------
create or replace function public.tidy_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;
revoke all on function public.tidy_secret(text) from public, anon, authenticated;
grant execute on function public.tidy_secret(text) to service_role;

-- ---------- realtime for the new client-visible tables ----------
do $$
begin
  begin alter publication supabase_realtime add table public.ai_suggestions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.calendar_events; exception when duplicate_object then null; end;
end $$;

-- ---------- scheduler ----------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- run the Domaxing edge function every 5 minutes ----------
-- Requires a Vault secret named 'cron_secret' (see README → "Server secrets").
-- Replace YOUR-PROJECT-REF with your project's ref.
select cron.unschedule(jobid) from cron.job where jobname = 'tidy-every-5-min';
select cron.schedule(
  'tidy-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/tidy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
