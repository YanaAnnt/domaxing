-- Domaxing: Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- Every row belongs to one user and is protected by Row Level Security.

create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null default 'blue',
  icon text not null default 'folder',
  "order" double precision not null default 0,
  collapsed boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table if not exists public.lists (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  name text not null,
  "order" double precision not null default 0,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  notes text not null default '',
  category_id uuid,
  list_id uuid,
  due_date date,
  due_time text,
  priority smallint not null default 0 check (priority between 0 and 4),
  subtasks jsonb not null default '[]'::jsonb,
  recurrence jsonb,
  reminder_at timestamptz,
  tags text[] not null default '{}',
  completed boolean not null default false,
  completed_at timestamptz,
  "order" double precision not null default 0,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- server_updated_at is the incremental-pull cursor; it is always set by the server clock.
create or replace function public.tidy_touch_server_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'lists', 'tasks'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before insert or update on public.%I for each row execute function public.tidy_touch_server_updated_at()',
      t, t);
    execute format('create index if not exists %I_user_sync_idx on public.%I (user_id, server_updated_at)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t);
  end loop;
end $$;

-- Live sync between devices
do $$
begin
  begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.lists; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end;
end $$;
