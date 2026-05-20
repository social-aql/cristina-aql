-- Enable required extensions
create extension if not exists "pgcrypto";

-- Connected social accounts (per user, per provider)
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  external_account_id text not null,
  display_name text not null,
  handle text,
  avatar_url text,
  encrypted_tokens text not null,
  status text not null default 'active' check (status in ('active','expired','revoked','error')),
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_id, external_account_id)
);

create index accounts_user_id_idx on public.accounts(user_id);
create index accounts_provider_id_idx on public.accounts(provider_id);

-- Account-level metric snapshots (time series)
create table public.account_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  followers integer,
  reach integer,
  impressions integer,
  profile_views integer,
  website_clicks integer,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index account_metrics_account_id_captured_at_idx
  on public.account_metrics_snapshots(account_id, captured_at desc);

-- Posts (one row per piece of content)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  external_post_id text not null,
  published_at timestamptz not null,
  media_type text not null,
  caption text,
  media_url text,
  thumbnail_url text,
  permalink text,
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_post_id)
);

create index posts_account_id_published_at_idx
  on public.posts(account_id, published_at desc);

-- Post-level metric snapshots (time series)
create table public.post_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  impressions integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  video_views integer,
  watch_time_seconds numeric,
  engagement_rate numeric,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index post_metrics_post_id_captured_at_idx
  on public.post_metrics_snapshots(post_id, captured_at desc);

-- AI analysis outputs
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  analysis_type text not null,
  input_range_from timestamptz,
  input_range_to timestamptz,
  model text not null,
  output_markdown text not null,
  input_summary jsonb,
  created_at timestamptz not null default now()
);

create index ai_analyses_user_id_created_at_idx
  on public.ai_analyses(user_id, created_at desc);

-- Sync job audit trail
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending' check (status in ('pending','running','success','error')),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  items_processed integer default 0,
  created_at timestamptz not null default now()
);

create index sync_jobs_account_id_created_at_idx
  on public.sync_jobs(account_id, created_at desc);

-- Row Level Security
alter table public.accounts enable row level security;
alter table public.account_metrics_snapshots enable row level security;
alter table public.posts enable row level security;
alter table public.post_metrics_snapshots enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.sync_jobs enable row level security;

-- Policies: users only see their own data
create policy "accounts_owner" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "account_metrics_owner" on public.account_metrics_snapshots
  for all using (
    exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

create policy "posts_owner" on public.posts
  for all using (
    exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

create policy "post_metrics_owner" on public.post_metrics_snapshots
  for all using (
    exists (
      select 1 from public.posts p
      join public.accounts a on a.id = p.account_id
      where p.id = post_id and a.user_id = auth.uid()
    )
  );

create policy "ai_analyses_owner" on public.ai_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sync_jobs_owner" on public.sync_jobs
  for all using (
    exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();

create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();
