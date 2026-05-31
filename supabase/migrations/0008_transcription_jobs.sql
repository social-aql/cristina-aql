-- Transcription jobs table
create table if not exists public.transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_message text,
  video_url text,
  media_type text not null,
  duration_seconds numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id)
);

create index transcription_jobs_status_idx
  on public.transcription_jobs(status, created_at asc)
  where status in ('pending', 'failed');

create index transcription_jobs_account_idx
  on public.transcription_jobs(account_id);

-- Transcript columns on posts
alter table public.posts
  add column if not exists transcript text,
  add column if not exists transcript_segments jsonb,
  add column if not exists visual_description text,
  add column if not exists transcript_language text,
  add column if not exists transcript_model text,
  add column if not exists transcript_at timestamptz;

-- Recreate view with new transcript columns
-- DROP + CREATE required because CREATE OR REPLACE cannot reorder existing columns
drop view if exists public.posts_with_latest_metrics;
create view public.posts_with_latest_metrics as
select
  p.id,
  p.account_id,
  p.external_post_id,
  p.published_at,
  p.media_type,
  p.caption,
  p.media_url,
  p.thumbnail_url,
  p.permalink,
  p.hashtags,
  p.mentions,
  p.theme,
  p.theme_secondary,
  p.theme_confidence,
  p.followers_at_publish,
  p.transcript,
  p.transcript_segments,
  p.visual_description,
  p.transcript_at,
  p.transcript_model,
  p.transcript_language,
  pms.captured_at as metrics_captured_at,
  pms.impressions,
  pms.reach,
  pms.likes,
  pms.comments,
  pms.shares,
  pms.saves,
  pms.video_views,
  pms.watch_time_seconds,
  pms.er_by_reach,
  pms.saves_per_reach,
  pms.sends_per_reach,
  pms.likes_per_reach,
  pms.save_to_like_ratio,
  pms.reach_rate,
  pms.completion_rate,
  pms.avg_watch_time_seconds
from public.posts p
left join lateral (
  select *
  from public.post_metrics_snapshots
  where post_id = p.id
  order by captured_at desc
  limit 1
) pms on true;

-- RLS
alter table public.transcription_jobs enable row level security;

drop policy if exists "transcription_jobs_owner" on public.transcription_jobs;
create policy "transcription_jobs_owner" on public.transcription_jobs
  for all using (
    exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
  );

-- updated_at trigger
drop trigger if exists transcription_jobs_touch on public.transcription_jobs;
create trigger transcription_jobs_touch before update on public.transcription_jobs
  for each row execute function public.touch_updated_at();
