-- =====================================================================
-- 0009: Agent insights — proactive intelligence feed
-- =====================================================================

create table public.agent_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_type text not null check (run_type in ('monday', 'wednesday', 'friday')),
  run_at timestamptz not null default now(),

  account_pulse jsonb,
  industry_news jsonb,
  upcoming_events jsonb,
  opportunities jsonb,

  email_sent boolean not null default false,
  email_sent_to text,
  model text not null default 'gemini-2.5-flash',
  generation_ms integer,
  error_message text,

  created_at timestamptz not null default now()
);

create index agent_insights_user_id_idx
  on public.agent_insights(user_id, run_at desc);

alter table public.agent_insights enable row level security;

create policy "agent_insights_owner" on public.agent_insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
