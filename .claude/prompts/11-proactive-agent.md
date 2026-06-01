# AI LICHIDITATE — Prompt 11: Proactive Content Intelligence Agent

## Context

The platform currently reacts to user requests (sync manually, generate analysis on demand). This prompt adds a **proactive agent** that runs 3x/week, monitors the account + financial markets, and emails actionable content opportunities before the creator even opens the app.

Three agent runs per week:
- **Monday 06:00 UTC (09:00 Romania)** — weekly briefing + opportunities
- **Wednesday 06:00 UTC** — mid-week pulse
- **Friday 06:00 UTC** — weekend prep

Each run:
1. Fetches account data since last run
2. Searches web for relevant financial news (Gemini + Google Search grounding)
3. Detects content opportunities (matching news to account's best-performing themes)
4. Generates 2-3 concrete post ideas with ready-to-use hooks
5. Sends email via Resend
6. Saves insight to DB (for dashboard feed)

## SCOPE BOUNDARY

This prompt does SIX things:
1. DB migration: `agent_insights` table
2. Resend email integration
3. Agent runner (`src/lib/agent/`)
4. Cron route `/api/cron/agent`
5. Dashboard: new `/dashboard/agent` page with insights feed
6. Weekly Summary enrichment with agent context

No changes to existing analyses, chat, or other features.

## Stack additions

- `resend` npm package — email sending

## Files allowed to change

DB:
- New: `supabase/migrations/0008_agent_insights.sql`

Agent:
- New: `src/lib/agent/types.ts`
- New: `src/lib/agent/account-pulse.ts`
- New: `src/lib/agent/industry-scout.ts`
- New: `src/lib/agent/opportunity-detector.ts`
- New: `src/lib/agent/email-composer.ts`
- New: `src/lib/agent/runner.ts`

Email:
- New: `src/lib/email/resend-client.ts`
- New: `src/lib/email/templates/agent-briefing.tsx`

Cron:
- `vercel.json` — add 3 agent cron schedules
- New: `src/app/api/cron/agent/route.ts`

UI:
- New: `src/app/dashboard/agent/page.tsx`
- New: `src/components/agent/InsightCard.tsx`
- New: `src/components/agent/OpportunityCard.tsx`
- `src/components/layout/Sidebar.tsx` — add "AGENT" nav item
- `src/app/dashboard/page.tsx` — add latest agent insight widget

Env:
- `src/lib/env.ts` — add RESEND_API_KEY, ADMIN_EMAIL
- `.env.example` — add new vars

## DO NOT TOUCH

- Existing analyses, chat, sync, KPI engine
- Meta provider
- Auth system
- Transcription system
- All other pages

---

## Deliverable 1: DB Migration

Create `supabase/migrations/0008_agent_insights.sql`:

```sql
-- =====================================================================
-- 0008: Agent insights — proactive intelligence feed
-- =====================================================================

create table public.agent_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_type text not null check (run_type in ('monday', 'wednesday', 'friday')),
  run_at timestamptz not null default now(),

  -- Account pulse section
  account_pulse jsonb,
  -- {
  --   postsPublished: number,
  --   reachTrend: 'up' | 'down' | 'stable',
  --   reachDelta: number,  -- % change
  --   alertPosts: [{postId, caption, erByReach, issue}],
  --   topPost: {postId, caption, erByReach}
  -- }

  -- Industry news section
  industry_news jsonb,
  -- [{title, summary, relevance: 'high'|'medium', source, url}]

  -- Upcoming events section
  upcoming_events jsonb,
  -- [{event, date, theme, urgency: 'urgent'|'planned'|'watch'}]

  -- Content opportunities section
  opportunities jsonb,
  -- [{
  --   title, hook, format, theme, rationale,
  --   priority: 1|2|3, urgency: 'now'|'tomorrow'|'this-week',
  --   bestTimeToPost, estimatedEr
  -- }]

  -- Metadata
  email_sent boolean not null default false,
  email_sent_to text,
  model text not null default 'gemini-2.5-flash',
  generation_ms integer,
  error_message text,

  created_at timestamptz not null default now()
);

create index agent_insights_user_id_idx
  on public.agent_insights(user_id, run_at desc);

-- RLS
alter table public.agent_insights enable row level security;

create policy "agent_insights_owner" on public.agent_insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## Deliverable 2: Environment variables

Update `src/lib/env.ts` Zod schema:

```ts
RESEND_API_KEY: z.string().min(1).optional(),
ADMIN_EMAIL: z.string().email().optional(),
```

Add to `.env.example`:

```env
# Resend — email sending for agent briefings
# Get free API key at https://resend.com (3000 emails/month free)
RESEND_API_KEY=re_...

# Admin email — where agent briefings are sent
ADMIN_EMAIL=your@email.com
```

---

## Deliverable 3: Resend client

Create `src/lib/email/resend-client.ts`:

```ts
import 'server-only';
import { env } from '@/lib/env';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not configured — skipping email');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AI Lichiditate <agent@yourdomain.com>', // update with your domain
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[email] Resend error:', err);
      return { success: false, error: err };
    }

    console.log('[email] sent successfully to', params.to);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] send failed:', message);
    return { success: false, error: message };
  }
}
```

**Note on Resend sender domain:** For production, you need to verify a domain in Resend dashboard. For development/testing, you can use `onboarding@resend.dev` as the from address which works without domain verification. Document this in FORK.md.

---

## Deliverable 4: Agent types

Create `src/lib/agent/types.ts`:

```ts
export type RunType = 'monday' | 'wednesday' | 'friday';

export interface AccountPulse {
  postsPublished: number;
  postsPublishedSinceLastRun: Array<{
    postId: string;
    caption: string | null;
    mediaType: string;
    theme: string | null;
    erByReach: number | null;
    savesPerReach: number | null;
    sendsPerReach: number | null;
    publishedAt: string;
    status: 'above_avg' | 'average' | 'below_avg';
  }>;
  reachTrend: 'up' | 'down' | 'stable';
  reachDelta: number;
  alertPosts: Array<{
    postId: string;
    caption: string | null;
    erByReach: number | null;
    issue: string;
  }>;
  topPost: {
    postId: string;
    caption: string | null;
    erByReach: number | null;
    metric: string;
  } | null;
  accountAvgEr: number | null;
  daysSinceLastPost: number;
}

export interface IndustryNewsItem {
  title: string;
  summary: string;
  source: string;
  url: string | null;
  relevance: 'high' | 'medium' | 'low';
  theme: string | null; // matches account themes
  publishedAt: string | null;
}

export interface UpcomingEvent {
  event: string;
  dateDescription: string;
  theme: string;
  urgency: 'urgent' | 'planned' | 'watch';
  description: string;
}

export interface ContentOpportunity {
  title: string;
  hook: string;            // ready-to-use opening 2 sentences
  format: string;          // "Reel 30-45s" | "Carousel 8 slide-uri"
  theme: string;
  rationale: string;       // why this would work based on account data
  priority: 1 | 2 | 3;    // 1 = highest
  urgency: 'now' | 'tomorrow' | 'this-week';
  bestTimeToPost: string;  // e.g. "azi 19:00-21:00"
  estimatedEr: string;     // e.g. ">9%" based on theme performance
}

export interface AgentRunResult {
  insightId: string;
  accountPulse: AccountPulse;
  industryNews: IndustryNewsItem[];
  upcomingEvents: UpcomingEvent[];
  opportunities: ContentOpportunity[];
  emailSent: boolean;
  generationMs: number;
}
```

---

## Deliverable 5: Account Pulse

Create `src/lib/agent/account-pulse.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AccountPulse } from './types';

export async function buildAccountPulse(
  userId: string,
  accountId: string,
  sinceHours: number = 48, // since last agent run
): Promise<AccountPulse> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();

  // Posts published since last run
  const { data: recentPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('id, caption, media_type, theme, er_by_reach, saves_per_reach, sends_per_reach, published_at')
    .eq('account_id', accountId)
    .gte('published_at', since)
    .order('published_at', { ascending: false });

  // Account average ER (last 14 days)
  const { data: allPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, reach, published_at')
    .eq('account_id', accountId)
    .gte('published_at', fourteenDaysAgo)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  const avgEr = allPosts && allPosts.length > 0
    ? allPosts.reduce((s, p) => s + (p.er_by_reach ?? 0), 0) / allPosts.length
    : null;

  // Reach trend: compare last 7 days vs 7-14 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const recentReach = allPosts?.filter(p => p.published_at >= sevenDaysAgo)
    .reduce((s, p) => s + (p.reach ?? 0), 0) ?? 0;
  const prevReach = allPosts?.filter(p => p.published_at < sevenDaysAgo)
    .reduce((s, p) => s + (p.reach ?? 0), 0) ?? 0;

  const reachDelta = prevReach > 0 ? ((recentReach - prevReach) / prevReach) * 100 : 0;
  const reachTrend: AccountPulse['reachTrend'] =
    reachDelta > 10 ? 'up' : reachDelta < -10 ? 'down' : 'stable';

  // Days since last post
  const lastPost = allPosts?.sort((a, b) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  )[0];
  const daysSinceLastPost = lastPost
    ? Math.floor((Date.now() - new Date(lastPost.published_at).getTime()) / 86400000)
    : 99;

  // Classify recent posts
  const postsPublishedSinceLastRun = (recentPosts ?? []).map(p => ({
    postId: p.id,
    caption: p.caption,
    mediaType: p.media_type,
    theme: p.theme,
    erByReach: p.er_by_reach,
    savesPerReach: p.saves_per_reach,
    sendsPerReach: p.sends_per_reach,
    publishedAt: p.published_at,
    status: avgEr
      ? p.er_by_reach == null ? 'average' as const
        : p.er_by_reach > avgEr * 1.2 ? 'above_avg' as const
        : p.er_by_reach < avgEr * 0.8 ? 'below_avg' as const
        : 'average' as const
      : 'average' as const,
  }));

  // Alert posts: below average or anomalies
  const alertPosts = postsPublishedSinceLastRun
    .filter(p => p.status === 'below_avg')
    .map(p => ({
      postId: p.postId,
      caption: p.caption,
      erByReach: p.erByReach,
      issue: p.erByReach != null && avgEr != null
        ? `ER ${p.erByReach.toFixed(2)}% vs media ${avgEr.toFixed(2)}% (-${((avgEr - p.erByReach) / avgEr * 100).toFixed(0)}%)`
        : 'ER sub medie',
    }));

  // Top post from recent
  const topPost = postsPublishedSinceLastRun.length > 0
    ? postsPublishedSinceLastRun.sort(
        (a, b) => (b.erByReach ?? 0) - (a.erByReach ?? 0)
      )[0]
    : null;

  return {
    postsPublished: postsPublishedSinceLastRun.length,
    postsPublishedSinceLastRun,
    reachTrend,
    reachDelta: Math.round(reachDelta),
    alertPosts,
    topPost: topPost ? {
      postId: topPost.postId,
      caption: topPost.caption,
      erByReach: topPost.erByReach,
      metric: `ER ${topPost.erByReach?.toFixed(2) ?? 'N/A'}%`,
    } : null,
    accountAvgEr: avgEr ? Math.round(avgEr * 100) / 100 : null,
    daysSinceLastPost,
  };
}
```

---

## Deliverable 6: Industry Scout

Create `src/lib/agent/industry-scout.ts`:

```ts
import 'server-only';
import { getDefaultAiProvider } from '@/config/ai-providers.config';
import type { IndustryNewsItem, UpcomingEvent } from './types';
import forkConfig from '../../../fork-config';

const SCOUT_SYSTEM_PROMPT = `Ești un analist de piețe financiare care monitorizează știrile relevante pentru un creator de conținut financiar român.

Returnezi STRICT JSON cu două secțiuni:
1. "news": array de știri relevante din ultimele 48 ore
2. "upcoming_events": array de evenimente financiare programate în următoarele 72 ore

Pentru fiecare știre:
- Evaluează relevanța pentru creatorii de conținut financiar din România
- Identifică tema principală (fed, crypto, stocks_us, gold, forex, real_estate, economy_eu, macro, education)
- Prioritizează știrile cu impact emoțional/acțional pentru audiența retail

Pentru upcoming events:
- Include: ședințe FED/BCE, earnings majore (NVDA, AAPL, TSLA etc.), date macro (CPI, NFP, PIB)
- Urgency: "urgent" = în <24h, "planned" = 24-72h, "watch" = >72h dar important

Returnează DOAR JSON valid. Nu inventa știri — bazează-te STRICT pe rezultatele căutărilor.`;

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    news: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
          theme: { type: 'string' },
          published_at: { type: 'string' },
        },
        required: ['title', 'summary', 'source', 'relevance'],
      },
    },
    upcoming_events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          date_description: { type: 'string' },
          theme: { type: 'string' },
          urgency: { type: 'string', enum: ['urgent', 'planned', 'watch'] },
          description: { type: 'string' },
        },
        required: ['event', 'date_description', 'theme', 'urgency', 'description'],
      },
    },
  },
  required: ['news', 'upcoming_events'],
};

export async function runIndustryScout(runType: 'monday' | 'wednesday' | 'friday'): Promise<{
  news: IndustryNewsItem[];
  upcomingEvents: UpcomingEvent[];
}> {
  const provider = getDefaultAiProvider();

  const today = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const themes = forkConfig.contentNiche.themes.join(', ');

  const userPrompt = `Astăzi este ${today}.

Caută pe web știrile financiare relevante din ultimele 48 de ore și evenimentele programate în următoarele 72 de ore.

Focus pe teme relevante pentru un creator financiar român: ${themes}

Căutări recomandate:
1. "financial markets news today Romania"
2. "FED ECB interest rate decision 2026"
3. "S&P 500 NASDAQ market update"
4. "Bitcoin crypto news today"
5. "economic calendar this week CPI NFP earnings"
6. "piete financiare stiri astazi"

Returnează știrile cu relevanță HIGH și MEDIUM pentru audiența de retail investors din România.
Maxim 6 știri + maxim 4 upcoming events.`;

  const result = await provider.generate({
    systemPrompt: SCOUT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxOutputTokens: 3000,
    jsonMode: true,
    responseSchema: SCOUT_SCHEMA,
    // Note: This requires Google Search grounding to be enabled
    // The provider needs to support grounding — extend if needed
  });

  const parsed = result.parsed as {
    news: Array<{
      title: string;
      summary: string;
      source: string;
      url?: string;
      relevance: string;
      theme?: string;
      published_at?: string;
    }>;
    upcoming_events: Array<{
      event: string;
      date_description: string;
      theme: string;
      urgency: string;
      description: string;
    }>;
  };

  return {
    news: (parsed.news ?? []).map(n => ({
      title: n.title,
      summary: n.summary,
      source: n.source,
      url: n.url ?? null,
      relevance: n.relevance as IndustryNewsItem['relevance'],
      theme: n.theme ?? null,
      publishedAt: n.published_at ?? null,
    })),
    upcomingEvents: (parsed.upcoming_events ?? []).map(e => ({
      event: e.event,
      dateDescription: e.date_description,
      theme: e.theme,
      urgency: e.urgency as UpcomingEvent['urgency'],
      description: e.description,
    })),
  };
}
```

**Note:** `industry-scout.ts` needs Google Search grounding in the provider call. Extend the `AiProviderClient.generate()` to accept a `useGoogleSearch: boolean` flag, similar to how it's done in the chat API route. Pass the flag here.

---

## Deliverable 7: Opportunity Detector

Create `src/lib/agent/opportunity-detector.ts`:

```ts
import 'server-only';
import { getDefaultAiProvider } from '@/config/ai-providers.config';
import type { AccountPulse, IndustryNewsItem, UpcomingEvent, ContentOpportunity } from './types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const OPPORTUNITY_SYSTEM_PROMPT = `Ești un strateg de conținut financiar care identifică oportunități CONCRETE de postări pe Instagram.

Primești:
1. Date despre performanța contului (ce temă/format performează bine)
2. Știri financiare recente
3. Evenimente programate

Generezi 2-3 oportunități de conținut ordonate după prioritate.

REGULI STRICTE:
- Fiecare oportunitate TREBUIE să aibă un hook complet scris în română (2 propoziții complete)
- Prioritatea 1 = conținut URGENT bazat pe un event iminent (<48h)
- Prioritatea 2-3 = conținut planificat bazat pe trend/news
- Rationale TREBUIE să citeze datele contului: "tema FED are ER 9.3% la tine"
- Format trebuie să fie specific: "Reel 30-45s" sau "Carousel 8 slide-uri"
- bestTimeToPost trebuie să fie un interval specific: "azi 19:00-21:00" sau "joi 19:00"

IMPORTANT: Nu inventezi oportunități fără legătură cu știrile primite. 
Dacă nu există news urgent, propui conținut evergreen bazat pe ce performează bine.

Returnează DOAR JSON valid.`;

const OPPORTUNITY_SCHEMA = {
  type: 'object',
  properties: {
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          format: { type: 'string' },
          theme: { type: 'string' },
          rationale: { type: 'string' },
          priority: { type: 'string', enum: ['1', '2', '3'] },
          urgency: { type: 'string', enum: ['now', 'tomorrow', 'this-week'] },
          best_time_to_post: { type: 'string' },
          estimated_er: { type: 'string' },
        },
        required: ['title', 'hook', 'format', 'theme', 'rationale', 'priority', 'urgency'],
      },
    },
  },
  required: ['opportunities'],
};

export async function detectOpportunities(params: {
  accountId: string;
  userId: string;
  pulse: AccountPulse;
  news: IndustryNewsItem[];
  events: UpcomingEvent[];
}): Promise<ContentOpportunity[]> {
  const provider = getDefaultAiProvider();
  const supabase = await createSupabaseServerClient();

  // Fetch theme performance for context
  const { data: themePosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('theme, er_by_reach, saves_per_reach, sends_per_reach')
    .eq('account_id', params.accountId)
    .gte('published_at', new Date(Date.now() - 90 * 86400000).toISOString())
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  // Aggregate theme performance
  const themeStats: Record<string, { count: number; erSum: number; savesSum: number }> = {};
  for (const p of themePosts ?? []) {
    const t = p.theme ?? 'other';
    if (!themeStats[t]) themeStats[t] = { count: 0, erSum: 0, savesSum: 0 };
    themeStats[t].count++;
    themeStats[t].erSum += p.er_by_reach ?? 0;
    themeStats[t].savesSum += p.saves_per_reach ?? 0;
  }

  const themePerformance = Object.entries(themeStats)
    .map(([theme, s]) => ({
      theme,
      avgEr: (s.erSum / s.count).toFixed(2),
      postCount: s.count,
    }))
    .sort((a, b) => parseFloat(b.avgEr) - parseFloat(a.avgEr))
    .slice(0, 6);

  // Fetch timing analysis
  const { data: timingPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('published_at, er_by_reach')
    .eq('account_id', params.accountId)
    .gte('published_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .not('er_by_reach', 'is', null);

  const dayStats: Record<string, number[]> = {};
  const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  for (const p of timingPosts ?? []) {
    const day = days[new Date(p.published_at).getDay()];
    if (!dayStats[day]) dayStats[day] = [];
    dayStats[day].push(p.er_by_reach ?? 0);
  }
  const bestDays = Object.entries(dayStats)
    .map(([day, ers]) => ({ day, avgEr: ers.reduce((a, b) => a + b, 0) / ers.length }))
    .sort((a, b) => b.avgEr - a.avgEr)
    .slice(0, 2)
    .map(d => d.day);

  const userPrompt = `Generează oportunități de conținut pe baza următoarelor date:

=== PERFORMANȚĂ CONT (ultimele 90 zile) ===
Media ER: ${params.pulse.accountAvgEr?.toFixed(2) ?? 'N/A'}%
Zile fără postare: ${params.pulse.daysSinceLastPost}
Cele mai bune zile de postare: ${bestDays.join(', ')} (19:00-21:00)
Trend reach: ${params.pulse.reachTrend} (${params.pulse.reachDelta > 0 ? '+' : ''}${params.pulse.reachDelta}%)

=== TOP TEME DIN CONT ===
${themePerformance.map(t => `${t.theme}: ER mediu ${t.avgEr}% (${t.postCount} postări)`).join('\n')}

=== ȘTIRI RELEVANTE DIN ULTIMELE 48H ===
${params.news.filter(n => n.relevance === 'high' || n.relevance === 'medium').map(n =>
  `[${n.relevance.toUpperCase()}] ${n.title}\n  Tema: ${n.theme ?? 'general'}\n  Rezumat: ${n.summary}`
).join('\n\n')}

=== EVENIMENTE PROGRAMATE ===
${params.events.map(e =>
  `[${e.urgency.toUpperCase()}] ${e.event} — ${e.dateDescription}\n  ${e.description}`
).join('\n')}

=== CONTEXT POSTARE RECENTĂ ===
${params.pulse.postsPublished} postări de la ultima rulare agent.
${params.pulse.alertPosts.length > 0
  ? `⚠️ ${params.pulse.alertPosts.length} postări sub medie.`
  : '✓ Toate postările recente în parametri.'}

Generează 2-3 oportunități concrete. Prioritizează evenimentele URGENTE.`;

  const result = await provider.generate({
    systemPrompt: OPPORTUNITY_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxOutputTokens: 2000,
    jsonMode: true,
    responseSchema: OPPORTUNITY_SCHEMA,
  });

  const parsed = result.parsed as {
    opportunities: Array<{
      title: string;
      hook: string;
      format: string;
      theme: string;
      rationale: string;
      priority: string;
      urgency: string;
      best_time_to_post?: string;
      estimated_er?: string;
    }>;
  };

  return (parsed.opportunities ?? []).map(o => ({
    title: o.title,
    hook: o.hook,
    format: o.format,
    theme: o.theme,
    rationale: o.rationale,
    priority: parseInt(o.priority, 10) as 1 | 2 | 3,
    urgency: o.urgency as ContentOpportunity['urgency'],
    bestTimeToPost: o.best_time_to_post ?? 'această seară 19:00-21:00',
    estimatedEr: o.estimated_er ?? 'bazat pe tema detectată',
  }));
}
```

---

## Deliverable 8: Email Composer

Create `src/lib/agent/email-composer.ts`:

```ts
import 'server-only';
import type { AccountPulse, IndustryNewsItem, UpcomingEvent, ContentOpportunity, RunType } from './types';

const runTypeLabels: Record<RunType, string> = {
  monday: 'BRIEFING SĂPTĂMÂNAL · LUNI',
  wednesday: 'PULS MID-WEEK · MIERCURI',
  friday: 'PREP WEEKEND · VINERI',
};

export function buildAgentEmailHtml(params: {
  runType: RunType;
  pulse: AccountPulse;
  news: IndustryNewsItem[];
  events: UpcomingEvent[];
  opportunities: ContentOpportunity[];
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { runType, pulse, news, events, opportunities } = params;

  // Build subject line dynamically
  const urgentEvent = events.find(e => e.urgency === 'urgent');
  const topOpportunity = opportunities.find(o => o.priority === 1);
  const hasAlerts = pulse.alertPosts.length > 0 || pulse.reachTrend === 'down';

  let subject = `📊 ${runTypeLabels[runType]}`;
  if (urgentEvent) subject += ` · ${urgentEvent.event}`;
  else if (topOpportunity) subject += ` · ${topOpportunity.title}`;
  if (hasAlerts) subject += ` ⚠️`;

  const highNews = news.filter(n => n.relevance === 'high').slice(0, 3);
  const mediumNews = news.filter(n => n.relevance === 'medium').slice(0, 2);
  const urgentEvents = events.filter(e => e.urgency === 'urgent');
  const plannedEvents = events.filter(e => e.urgency === 'planned');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      background: #0A0A0A;
      color: #F2EFE4;
      line-height: 1.5;
    }
    .container { max-width: 640px; margin: 0 auto; padding: 32px 24px; }
    .header { border-bottom: 1px solid #262626; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { font-size: 13px; letter-spacing: 0.1em; color: #C7F84C; font-weight: 700; }
    .runtype { font-size: 11px; color: #8A8A8A; margin-top: 4px; letter-spacing: 0.08em; }
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 10px;
      letter-spacing: 0.12em;
      color: #5A5A5A;
      text-transform: uppercase;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1A1A1A;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #141414;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .metric-label { font-size: 12px; color: #8A8A8A; }
    .metric-value { font-size: 13px; font-weight: 600; font-family: 'Courier New', monospace; }
    .lime { color: #C7F84C; }
    .coral { color: #FF5A4E; }
    .muted { color: #5A5A5A; }
    .news-item {
      padding: 10px 12px;
      background: #141414;
      border-left: 3px solid #262626;
      border-radius: 0 4px 4px 0;
      margin-bottom: 8px;
    }
    .news-item.high { border-left-color: #C7F84C; }
    .news-item.medium { border-left-color: #7A9A2E; }
    .news-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .news-summary { font-size: 12px; color: #8A8A8A; }
    .event-item {
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .event-urgent { background: #1A0908; border-left: 3px solid #FF5A4E; }
    .event-planned { background: #141414; border-left: 3px solid #C7F84C; }
    .event-label { font-size: 10px; letter-spacing: 0.08em; margin-bottom: 3px; }
    .event-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .event-desc { font-size: 12px; color: #8A8A8A; }
    .opportunity {
      background: #0E1A06;
      border: 1px solid #3A5C0F;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .opp-priority {
      font-size: 10px;
      letter-spacing: 0.1em;
      color: #C7F84C;
      margin-bottom: 8px;
    }
    .opp-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
    .opp-hook {
      font-size: 13px;
      font-style: italic;
      color: #F2EFE4;
      background: #141414;
      padding: 10px 12px;
      border-radius: 4px;
      border-left: 2px solid #C7F84C;
      margin-bottom: 10px;
    }
    .opp-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    .opp-badge {
      font-size: 10px;
      padding: 2px 8px;
      background: #141414;
      border: 1px solid #262626;
      border-radius: 3px;
      color: #8A8A8A;
      font-family: 'Courier New', monospace;
    }
    .opp-rationale { font-size: 12px; color: #8A8A8A; }
    .alert-box {
      padding: 12px 16px;
      background: #1A0908;
      border-left: 3px solid #FF5A4E;
      border-radius: 0 4px 4px 0;
      margin-bottom: 8px;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 24px;
      background: #C7F84C;
      color: #000;
      text-decoration: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 24px;
    }
    .footer {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #1A1A1A;
      font-size: 11px;
      color: #5A5A5A;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo">AI LICHIDITATE</div>
      <div class="runtype">${runTypeLabels[runType]} · ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>

    <!-- Account Pulse -->
    <div class="section">
      <div class="section-title">CONT · ULTIMELE 48H</div>

      ${pulse.reachTrend === 'down' && Math.abs(pulse.reachDelta) > 15 ? `
        <div class="alert-box">
          ⚠️ Reach în scădere: ${pulse.reachDelta}% față de perioada precedentă
        </div>
      ` : ''}

      ${pulse.daysSinceLastPost >= 3 ? `
        <div class="alert-box">
          ⚠️ ${pulse.daysSinceLastPost} zile fără postare — consistența e cheie
        </div>
      ` : ''}

      <div class="metric-row">
        <span class="metric-label">Postări publicate</span>
        <span class="metric-value">${pulse.postsPublished}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Trend reach</span>
        <span class="metric-value ${pulse.reachTrend === 'up' ? 'lime' : pulse.reachTrend === 'down' ? 'coral' : ''}">
          ${pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→'}
          ${pulse.reachDelta > 0 ? '+' : ''}${pulse.reachDelta}%
        </span>
      </div>
      ${pulse.topPost ? `
        <div class="metric-row">
          <span class="metric-label">Top post: "${(pulse.topPost.caption ?? '').slice(0, 40)}..."</span>
          <span class="metric-value lime">ER ${pulse.topPost.erByReach?.toFixed(2)}%</span>
        </div>
      ` : ''}

      ${pulse.alertPosts.map(p => `
        <div class="metric-row">
          <span class="metric-label">⚠️ "${(p.caption ?? '').slice(0, 40)}..."</span>
          <span class="metric-value coral">${p.issue}</span>
        </div>
      `).join('')}
    </div>

    <!-- Industry News -->
    ${highNews.length > 0 || mediumNews.length > 0 ? `
      <div class="section">
        <div class="section-title">PIEȚE · ȘTIRI RELEVANTE</div>
        ${highNews.map(n => `
          <div class="news-item high">
            <div class="news-title">🔴 ${n.title}</div>
            <div class="news-summary">${n.summary}</div>
            <div class="news-summary" style="margin-top: 4px; color: #5A5A5A;">
              ${n.source}${n.url ? ` · <a href="${n.url}" style="color: #7A9A2E;">citește</a>` : ''}
            </div>
          </div>
        `).join('')}
        ${mediumNews.map(n => `
          <div class="news-item medium">
            <div class="news-title">🟡 ${n.title}</div>
            <div class="news-summary">${n.summary}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Upcoming Events -->
    ${urgentEvents.length > 0 || plannedEvents.length > 0 ? `
      <div class="section">
        <div class="section-title">CALENDAR · EVENIMENTE</div>
        ${urgentEvents.map(e => `
          <div class="event-item event-urgent">
            <div class="event-label coral">⚡ URGENT · ${e.dateDescription.toUpperCase()}</div>
            <div class="event-name">${e.event}</div>
            <div class="event-desc">${e.description}</div>
          </div>
        `).join('')}
        ${plannedEvents.map(e => `
          <div class="event-item event-planned">
            <div class="event-label" style="color: #7A9A2E;">📅 ${e.dateDescription.toUpperCase()}</div>
            <div class="event-name">${e.event}</div>
            <div class="event-desc">${e.description}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Content Opportunities -->
    <div class="section">
      <div class="section-title">OPORTUNITĂȚI CONȚINUT · ${opportunities.length} IDEI</div>
      ${opportunities.sort((a, b) => a.priority - b.priority).map(o => `
        <div class="opportunity">
          <div class="opp-priority">
            ${'⭐'.repeat(4 - o.priority)} PRIORITATE ${o.priority}
            ${o.urgency === 'now' ? ' · POSTEAZĂ ACUM' : o.urgency === 'tomorrow' ? ' · MÂINE' : ' · ACEASTĂ SĂPTĂMÂNĂ'}
          </div>
          <div class="opp-title">${o.title}</div>
          <div class="opp-hook">"${o.hook}"</div>
          <div class="opp-meta">
            <span class="opp-badge">${o.format}</span>
            <span class="opp-badge">${o.theme.toUpperCase()}</span>
            <span class="opp-badge">⏰ ${o.bestTimeToPost}</span>
            <span class="opp-badge">ER est. ${o.estimatedEr}</span>
          </div>
          <div class="opp-rationale">${o.rationale}</div>
        </div>
      `).join('')}
    </div>

    <!-- CTA -->
    <a href="${params.appUrl}/dashboard/agent" class="cta-button">
      → DESCHIDE DASHBOARD COMPLET
    </a>

    <!-- Footer -->
    <div class="footer">
      <p>AI LICHIDITATE · Agent Proactiv · ${runTypeLabels[runType]}</p>
      <p style="margin-top: 4px;">Următorul briefing: ${getNextRunLabel(runType)}</p>
    </div>
  </div>
</body>
</html>`;

  // Plain text version
  const text = [
    `AI LICHIDITATE · ${runTypeLabels[runType]}`,
    '='.repeat(50),
    '',
    'CONT · ULTIMELE 48H',
    `Postări: ${pulse.postsPublished} | Trend reach: ${pulse.reachTrend} (${pulse.reachDelta > 0 ? '+' : ''}${pulse.reachDelta}%)`,
    pulse.alertPosts.map(p => `⚠️ ${p.issue}`).join('\n'),
    '',
    'ȘTIRI RELEVANTE',
    highNews.map(n => `🔴 ${n.title}\n   ${n.summary}`).join('\n'),
    '',
    'OPORTUNITĂȚI',
    opportunities.map((o, i) => [
      `${i + 1}. ${o.title}`,
      `   Hook: "${o.hook}"`,
      `   Format: ${o.format} | Postează: ${o.bestTimeToPost}`,
      `   ${o.rationale}`,
    ].join('\n')).join('\n\n'),
    '',
    `Dashboard: ${params.appUrl}/dashboard/agent`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

function getNextRunLabel(current: RunType): string {
  const next: Record<RunType, string> = {
    monday: 'Miercuri dimineață',
    wednesday: 'Vineri dimineață',
    friday: 'Luni dimineața viitoare',
  };
  return next[current];
}
```

---

## Deliverable 9: Agent Runner

Create `src/lib/agent/runner.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildAccountPulse } from './account-pulse';
import { runIndustryScout } from './industry-scout';
import { detectOpportunities } from './opportunity-detector';
import { buildAgentEmailHtml } from './email-composer';
import { sendEmail } from '@/lib/email/resend-client';
import { env } from '@/lib/env';
import type { RunType, AgentRunResult } from './types';

export async function runAgent(
  userId: string,
  runType: RunType,
): Promise<AgentRunResult> {
  const startTime = Date.now();
  const supabase = await createSupabaseServerClient();

  console.log(`[agent] starting ${runType} run for user ${userId}`);

  // Get user's active accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle')
    .eq('user_id', userId)
    .eq('status', 'active')
    .neq('provider_id', 'mock') // skip mock accounts
    .limit(1);

  if (!accounts || accounts.length === 0) {
    throw new Error('No active Meta accounts for user');
  }

  const account = accounts[0];
  const sinceHours = runType === 'monday' ? 72 : 48; // Monday covers the weekend

  // Step 1: Account pulse
  console.log('[agent] building account pulse...');
  const pulse = await buildAccountPulse(userId, account.id, sinceHours);

  // Step 2: Industry scout (with web search)
  console.log('[agent] running industry scout...');
  const { news, upcomingEvents } = await runIndustryScout(runType);

  // Step 3: Opportunity detection
  console.log('[agent] detecting opportunities...');
  const opportunities = await detectOpportunities({
    accountId: account.id,
    userId,
    pulse,
    news,
    events: upcomingEvents,
  });

  // Step 4: Save insight to DB
  const { data: insight } = await supabase
    .from('agent_insights')
    .insert({
      user_id: userId,
      run_type: runType,
      account_pulse: pulse,
      industry_news: news,
      upcoming_events: upcomingEvents,
      opportunities,
      model: 'gemini-2.5-flash',
      generation_ms: Date.now() - startTime,
    })
    .select('id')
    .single();

  const insightId = insight?.id ?? '';

  // Step 5: Send email
  let emailSent = false;
  const adminEmail = env.ADMIN_EMAIL;

  if (adminEmail) {
    const { subject, html, text } = buildAgentEmailHtml({
      runType,
      pulse,
      news,
      events: upcomingEvents,
      opportunities,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    });

    const emailResult = await sendEmail({
      to: adminEmail,
      subject,
      html,
      text,
    });

    emailSent = emailResult.success;

    // Update insight with email status
    await supabase
      .from('agent_insights')
      .update({
        email_sent: emailSent,
        email_sent_to: adminEmail,
      })
      .eq('id', insightId);
  }

  console.log(`[agent] ${runType} run completed in ${Date.now() - startTime}ms`);

  return {
    insightId,
    accountPulse: pulse,
    industryNews: news,
    upcomingEvents,
    opportunities,
    emailSent,
    generationMs: Date.now() - startTime,
  };
}
```

---

## Deliverable 10: Cron Routes

### 10.1 Update `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/weekly-summary", "schedule": "0 16 * * 3" },
    { "path": "/api/cron/transcribe", "schedule": "0 * * * *" },
    { "path": "/api/cron/agent", "schedule": "0 6 * * 1,3,5" }
  ]
}
```

`0 6 * * 1,3,5` = 06:00 UTC luni, miercuri, vineri = 09:00 Romania EEST.

### 10.2 Create `/api/cron/agent/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAgent } from '@/lib/agent/runner';
import { env } from '@/lib/env';

export const maxDuration = 300;

function getRunType(): 'monday' | 'wednesday' | 'friday' {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  if (day === 1) return 'monday';
  if (day === 3) return 'wednesday';
  return 'friday';
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const runType = getRunType();
  console.log(`[cron/agent] starting ${runType} run`);

  // Use service role to fetch all admin users
  const serviceSupabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: adminProfiles } = await serviceSupabase
    .from('user_profiles')
    .select('user_id')
    .eq('role', 'admin');

  if (!adminProfiles || adminProfiles.length === 0) {
    return NextResponse.json({ message: 'no admin users found' });
  }

  const results = [];
  for (const profile of adminProfiles) {
    try {
      const result = await runAgent(profile.user_id, runType);
      results.push({
        userId: profile.user_id,
        status: 'success',
        emailSent: result.emailSent,
        opportunitiesCount: result.opportunities.length,
        durationMs: result.generationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/agent] failed for user ${profile.user_id}:`, message);
      results.push({ userId: profile.user_id, status: 'error', error: message });
    }
  }

  return NextResponse.json({ runType, results });
}
```

---

## Deliverable 11: Dashboard Agent Page

### 11.1 `/dashboard/agent/page.tsx`

Server component that fetches the last 10 agent insights:

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCurrentUserRole } from '@/lib/roles';
import { InsightCard } from '@/components/agent/InsightCard';
import { Eyebrow, H1, Body } from '@/components/design-system';
import type { AgentInsight } from '@/lib/agent/types';

export default async function AgentPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: { user } }, userProfile] = await Promise.all([
    supabase.auth.getUser(),
    getCurrentUserRole(),
  ]);

  if (!user) redirect('/login');

  const { data: insights } = await supabase
    .from('agent_insights')
    .select('*')
    .eq('user_id', user.id)
    .order('run_at', { ascending: false })
    .limit(10);

  return (
    <div>
      <Eyebrow tone="muted">AGENT · INTELLIGENCE PROACTIVĂ</Eyebrow>
      <H1>AGENT.</H1>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 32, marginTop: 16 }}>
        <div>
          <Eyebrow tone="muted" style={{ fontSize: 10 }}>RULĂRI TOTALE</Eyebrow>
          <span style={{ fontSize: 24, fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700 }}>
            {insights?.length ?? 0}
          </span>
        </div>
        <div>
          <Eyebrow tone="muted" style={{ fontSize: 10 }}>ULTIMA RULARE</Eyebrow>
          <span style={{ fontSize: 14, fontFamily: 'var(--font-jetbrains-mono)' }}>
            {insights?.[0]
              ? new Date(insights[0].run_at).toLocaleDateString('ro-RO', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })
              : 'Nicio rulare încă'}
          </span>
        </div>
        <div>
          <Eyebrow tone="muted" style={{ fontSize: 10 }}>EMAIL</Eyebrow>
          <span style={{
            fontSize: 12,
            fontFamily: 'var(--font-jetbrains-mono)',
            color: insights?.[0]?.email_sent ? 'var(--color-accent-lime)' : 'var(--color-text-muted)',
          }}>
            {insights?.[0]?.email_sent ? '✓ TRIMIS' : '— NECONFIGURAT'}
          </span>
        </div>
      </div>

      {/* Insights feed */}
      {!insights || insights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Body tone="secondary">
            Agentul nu a rulat încă. Prima rulare va fi luni dimineață la 09:00.
          </Body>
          <Body tone="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Sau testează manual cu: curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/agent
          </Body>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 11.2 InsightCard component

Create `src/components/agent/InsightCard.tsx`:

Renders one agent insight with collapsible sections for:
- Account pulse summary (reach trend, alert posts)
- Top news items (high relevance only)
- Upcoming events (urgent first)
- Opportunities (cards, sorted by priority, with hook in italics)

Each opportunity has a "Copiază hook" button that copies the hook text to clipboard.

```tsx
'use client';

import { useState } from 'react';
import { Card, Eyebrow, H3, Body, Mono } from '@/components/design-system';
import type { AccountPulse, IndustryNewsItem, UpcomingEvent, ContentOpportunity } from '@/lib/agent/types';

interface Props {
  insight: {
    id: string;
    run_type: string;
    run_at: string;
    account_pulse: AccountPulse | null;
    industry_news: IndustryNewsItem[] | null;
    upcoming_events: UpcomingEvent[] | null;
    opportunities: ContentOpportunity[] | null;
    email_sent: boolean;
  };
}

export function InsightCard({ insight }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copiedHook, setCopiedHook] = useState<number | null>(null);

  const runLabels: Record<string, string> = {
    monday: 'LUNI · BRIEFING',
    wednesday: 'MIERCURI · PULS',
    friday: 'VINERI · PREP',
  };

  const opportunities = insight.opportunities ?? [];
  const pulse = insight.account_pulse;
  const topOpportunity = opportunities.find(o => o.priority === 1);

  const copyHook = (hook: string, idx: number) => {
    navigator.clipboard.writeText(hook);
    setCopiedHook(idx);
    setTimeout(() => setCopiedHook(null), 2000);
  };

  return (
    <Card>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <Eyebrow tone="muted" style={{ marginBottom: 4 }}>
            {runLabels[insight.run_type] ?? insight.run_type.toUpperCase()}
            · {new Date(insight.run_at).toLocaleDateString('ro-RO', {
              day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            })}
            {insight.email_sent && (
              <span style={{ color: 'var(--color-accent-lime)', marginLeft: 8 }}>✉ EMAIL TRIMIS</span>
            )}
          </Eyebrow>

          {/* Quick summary */}
          {topOpportunity && !expanded && (
            <Body style={{ fontSize: 14 }}>
              💡 {topOpportunity.title}
            </Body>
          )}
          {pulse && !expanded && (
            <Mono tone="muted" style={{ fontSize: 11, marginTop: 4 }}>
              {pulse.postsPublished} postări · reach {pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→'}
              {Math.abs(pulse.reachDelta)}% · {opportunities.length} oportunități
            </Mono>
          )}
        </div>
        <Mono tone="muted" style={{ fontSize: 12 }}>{expanded ? '▲' : '▼'}</Mono>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 20 }}>
          {/* Account pulse */}
          {pulse && (
            <div style={{ marginBottom: 20 }}>
              <Eyebrow tone="muted" style={{ marginBottom: 8 }}>CONT</Eyebrow>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
                  <Mono tone="muted" style={{ fontSize: 10 }}>REACH TREND</Mono>
                  <Mono style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: pulse.reachTrend === 'up' ? 'var(--color-accent-lime)'
                      : pulse.reachTrend === 'down' ? 'var(--color-accent-coral)'
                      : 'var(--color-text-primary)',
                  }}>
                    {pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→'}
                    {' '}{Math.abs(pulse.reachDelta)}%
                  </Mono>
                </div>
                <div style={{ flex: 1, padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
                  <Mono tone="muted" style={{ fontSize: 10 }}>POSTĂRI</Mono>
                  <Mono style={{ fontSize: 18, fontWeight: 700 }}>{pulse.postsPublished}</Mono>
                </div>
              </div>
              {pulse.alertPosts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {pulse.alertPosts.map(p => (
                    <div key={p.postId} style={{
                      padding: '8px 12px',
                      background: 'var(--color-bg-card-negative)',
                      borderLeft: '3px solid var(--color-accent-coral)',
                      borderRadius: '0 4px 4px 0',
                      marginBottom: 4,
                    }}>
                      <Body style={{ fontSize: 12, color: 'var(--color-accent-coral)' }}>
                        ⚠️ "{(p.caption ?? '').slice(0, 50)}" — {p.issue}
                      </Body>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Opportunities */}
          {opportunities.length > 0 && (
            <div>
              <Eyebrow tone="muted" style={{ marginBottom: 8 }}>OPORTUNITĂȚI</Eyebrow>
              {opportunities.sort((a, b) => a.priority - b.priority).map((opp, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 16,
                    background: 'var(--color-bg-card-positive)',
                    border: '1px solid var(--color-border-positive)',
                    borderRadius: 6,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Eyebrow tone="lime">
                      {'⭐'.repeat(4 - opp.priority)} P{opp.priority}
                      · {opp.urgency === 'now' ? 'ACUM' : opp.urgency === 'tomorrow' ? 'MÂINE' : 'SĂPTĂMÂNA ASTA'}
                    </Eyebrow>
                    <Mono tone="muted" style={{ fontSize: 10 }}>{opp.format}</Mono>
                  </div>
                  <Body style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{opp.title}</Body>
                  <div style={{
                    padding: '8px 12px',
                    background: 'var(--color-bg-card)',
                    borderLeft: '2px solid var(--color-accent-lime)',
                    borderRadius: '0 4px 4px 0',
                    marginBottom: 10,
                    position: 'relative',
                  }}>
                    <Body style={{ fontSize: 13, fontStyle: 'italic' }}>"{opp.hook}"</Body>
                    <button
                      onClick={() => copyHook(opp.hook, idx)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        padding: '2px 8px',
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontFamily: 'var(--font-jetbrains-mono)',
                        color: copiedHook === idx ? 'var(--color-accent-lime)' : 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {copiedHook === idx ? '✓ COPIAT' : 'COPIAZĂ'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Mono tone="muted" style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--color-border-default)', borderRadius: 3 }}>
                      {opp.theme.toUpperCase()}
                    </Mono>
                    <Mono tone="muted" style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--color-border-default)', borderRadius: 3 }}>
                      ⏰ {opp.bestTimeToPost}
                    </Mono>
                    <Mono style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--color-border-positive)', borderRadius: 3, color: 'var(--color-accent-lime-dim)' }}>
                      ER est. {opp.estimatedEr}
                    </Mono>
                  </div>
                  <Body tone="secondary" style={{ fontSize: 12 }}>{opp.rationale}</Body>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
```

### 11.3 Dashboard home widget

In `src/app/dashboard/page.tsx`, add a small agent widget in State C (after KPI cards):

```tsx
// Fetch latest agent insight
const { data: latestInsight } = await supabase
  .from('agent_insights')
  .select('run_type, run_at, opportunities')
  .eq('user_id', user.id)
  .order('run_at', { ascending: false })
  .limit(1)
  .single();

// Widget:
{latestInsight && (
  <div style={{ marginTop: 24 }}>
    <Eyebrow tone="muted">AGENT · ULTIMUL BRIEFING</Eyebrow>
    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <Body>
          {(latestInsight.opportunities as ContentOpportunity[])?.[0]?.title ?? 'Nicio oportunitate detectată'}
        </Body>
        <Mono tone="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {new Date(latestInsight.run_at).toLocaleDateString('ro-RO', {
            weekday: 'short', day: 'numeric', month: 'short'
          })}
        </Mono>
      </div>
      
        href="/dashboard/agent"
        style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid var(--color-border-default)',
          borderRadius: 6,
          color: 'var(--color-text-secondary)',
          textDecoration: 'none',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          textTransform: 'uppercase',
        }}
      >
        → TOATE BRIEFING-URILE
      </a>
    </div>
  </div>
)}
```

### 11.4 Sidebar update

Add "AGENT" to sidebar navigation after "ANALIZE":

```tsx
{ href: '/dashboard/agent', label: 'AGENT' },
```

---

## Deliverable 12: Weekly Summary enrichment

In `src/ai/analyses/data-builders.ts`, when building the weekly data bundle, fetch the latest agent insight if it exists and include relevant context:

```ts
// Fetch latest agent insight for context
const { data: latestAgentInsight } = await supabase
  .from('agent_insights')
  .select('industry_news, upcoming_events, opportunities')
  .eq('user_id', userId)
  .order('run_at', { ascending: false })
  .limit(1)
  .single();

// Add to bundle:
agentContext: latestAgentInsight ? {
  recentNews: (latestAgentInsight.industry_news as IndustryNewsItem[])
    ?.filter(n => n.relevance === 'high')
    .slice(0, 3)
    .map(n => `${n.title}: ${n.summary}`) ?? [],
  upcomingEvents: (latestAgentInsight.upcoming_events as UpcomingEvent[])
    ?.filter(e => e.urgency !== 'watch')
    .map(e => `${e.event} (${e.dateDescription})`) ?? [],
} : null,
```

In `buildWeeklySummaryPrompt`, add agent context section:

```ts
${data.agentContext ? `
=== CONTEXT PIEȚE (din ultima monitorizare agent) ===
Știri relevante:
${data.agentContext.recentNews.map(n => `• ${n}`).join('\n')}
${data.agentContext.upcomingEvents.length > 0 ? `
Evenimente programate:
${data.agentContext.upcomingEvents.map(e => `• ${e}`).join('\n')}` : ''}
` : ''}
```

---

## Verification checklist

1. `pnpm install` — `resend` package added
2. `pnpm build` succeeds, zero TypeScript errors
3. `pnpm lint` passes
4. **DB migration:** `0008_agent_insights.sql` applied. Table `agent_insights` exists.
5. **Manual agent trigger:** test the cron manually:
```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/cron/agent
   # Should return: { runType: "...", results: [{ status: "success" }] }
```
6. **Agent insight saved:** after manual trigger, check DB:
```sql
   SELECT id, run_type, run_at, email_sent,
     jsonb_array_length(opportunities) as opportunities_count
   FROM agent_insights ORDER BY run_at DESC LIMIT 1;
```
7. **Opportunities have hooks:** `opportunities[0].hook` is a full Romanian sentence, not empty.
8. **News is real:** `industry_news` contains actual news with titles and summaries (not empty array). Google Search grounding must be active.
9. **Email sent:** if `RESEND_API_KEY` and `ADMIN_EMAIL` are configured, `email_sent = true` after run.
10. **Email content:** received email has correct subject line, dark theme HTML, opportunities with hooks.
11. **Dashboard agent page:** navigate to `/dashboard/agent`. Shows latest insight feed.
12. **InsightCard expandable:** click on card → expands to show full content, opportunities, copy-hook buttons.
13. **Copy hook button:** click "COPIAZĂ" on an opportunity hook → hook text in clipboard → button shows "✓ COPIAT".
14. **Dashboard widget:** `/dashboard` shows latest agent briefing summary with link to agent page.
15. **Sidebar:** "AGENT" nav item present between ANALIZE and SETĂRI.
16. **Weekly Summary enriched:** generate a new Weekly Summary. If agent has run, the system prompt includes recent news context.
17. **3x/week schedule:** `vercel.json` has `0 6 * * 1,3,5`. Verify correct.

## Notes pentru Claude Code

- **Google Search grounding în industry-scout:** `runIndustryScout` calls `provider.generate()` which uses the standard Gemini API. For grounding to work, need to pass `useGoogleSearch: true` to the provider. Extend `AiGenerateInput` type with `useGoogleSearch?: boolean` and the Gemini provider implementation to include `{ googleSearch: {} }` in tools when set. This was already done for chat — reuse that pattern.
- **Resend sender:** For development, use `onboarding@resend.dev` as the `from` address — no domain verification needed. For production, verify your domain in Resend dashboard. Document in FORK.md.
- **`env.ADMIN_EMAIL`** must be set for emails to send. If not set, agent runs but skips email silently. This is intentional.
- **`runType` detection** in cron route uses `new Date().getDay()`. In Vercel's runtime, `new Date()` is UTC. Since cron runs at 06:00 UTC, and day changes at 00:00 UTC, the day detection is correct.
- **Mock accounts excluded** in `runAgent` with `.neq('provider_id', 'mock')`. This prevents the agent from analyzing fake data.
- **`sinceHours: 72` for Monday** covers the weekend gap (Fri 06:00 → Mon 06:00 = 72h).
- **Viewer users** do NOT receive agent emails (only admin users are targeted by the cron). Viewers can see the agent feed in `/dashboard/agent` since it's read-only.