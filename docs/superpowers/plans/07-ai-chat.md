# AI LICHIDITATE — Prompt 07: AI Chat cu Function Calling + Streaming

## Context

The app has a complete analytics pipeline: synced Meta data, KPI engine, theme detection, diagnostic flags, AI analyses. This prompt adds an **AI Chat** feature — a conversational interface where the user asks anything about their account and Gemini responds using real data via function calling.

Unlike the existing one-shot analyses (Weekly Summary, Patterns, Ideation), chat is:
- **Multi-turn:** conversation history preserved across messages
- **Query-driven:** user asks anything, AI decides what data to fetch
- **Streamed:** response appears word-by-word, ChatGPT-style
- **Persistent:** conversations saved to DB

## Architecture

```
/dashboard/chat (new page)
├── Server Component: loads conversation list + active conversation
└── ChatInterface (Client Component)
    ├── ConversationList (left sidebar — past conversations)
    ├── MessageList (center — messages with markdown rendering)
    ├── TypingIndicator (animated dots while streaming)
    └── MessageInput (bottom — textarea + send button)

POST /api/chat/message (API Route — handles streaming)
├── Auth check
├── Load conversation history from DB
├── Build system prompt with account context
├── Call Gemini with tools enabled
├── Gemini calls tools → execute TypeScript queries → return data
├── Stream response back via ReadableStream
└── On completion: save both messages to DB

Tool functions (server-side, called by Gemini):
├── getAccountKpis(dateRange)
├── getTopPosts(metric, limit, dateRange)
├── getPostingTimingAnalysis()
├── comparePeriods(period1, period2)
├── getThemePerformance(theme?)
├── getHookTypeAnalysis()
├── getDiagnosticFlags()
└── getPostDetails(postId)
```

## SCOPE BOUNDARY

This prompt does FIVE things:
1. DB migration for chat tables
2. Tool functions (data layer)
3. API route with Gemini function calling + streaming
4. Chat UI page `/dashboard/chat`
5. Sidebar navigation update (add "Chat" item)

No changes to existing analyses, KPI engine, sync, or other pages.

## Carry-over (LOCKED)

- All design tokens, fonts, no-shadow rule
- All existing pages unchanged
- KPI engine, sync, theme detection, AI analyses — untouched
- Gemini provider — reused but extended for function calling + streaming

## Stack additions

- No new npm dependencies
- Gemini function calling via existing fetch-based provider (extended)
- Native Web Streams API for streaming (no SSE library needed)

## Files allowed to change

DB:
- New: `supabase/migrations/0005_chat_tables.sql`

Chat data layer:
- New: `src/ai/chat/tools.ts` — tool definitions + implementations
- New: `src/ai/chat/types.ts` — chat-specific types
- New: `src/ai/chat/system-prompt.ts` — system prompt builder

API:
- New: `src/app/api/chat/message/route.ts` — streaming API route
- New: `src/app/api/chat/conversations/route.ts` — CRUD for conversations

UI:
- New: `src/app/dashboard/chat/page.tsx`
- New: `src/components/chat/ChatInterface.tsx`
- New: `src/components/chat/ConversationList.tsx`
- New: `src/components/chat/MessageList.tsx`
- New: `src/components/chat/MessageBubble.tsx`
- New: `src/components/chat/MessageInput.tsx`
- New: `src/components/chat/TypingIndicator.tsx`

Navigation:
- `src/components/layout/Sidebar.tsx` — add Chat nav item

## DO NOT TOUCH

- KPI engine
- Sync logic
- Meta provider
- Existing AI analyses
- Diagnostic engine
- Dashboard, posts, analyses pages
- Gemini provider core (`src/ai/providers/gemini/index.ts`) — we extend separately

---

## Deliverable 1: DB migration

Create `supabase/migrations/0005_chat_tables.sql`:

```sql
-- =====================================================================
-- 0005: AI Chat — conversations and messages
-- =====================================================================

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  title text,                          -- auto-generated from first message
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  message_count integer not null default 0,
  last_message_preview text            -- for conversation list display
);

create index chat_conversations_user_id_idx
  on public.chat_conversations(user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_calls jsonb,                    -- if assistant called tools, stored here
  tool_results jsonb,                  -- tool execution results (for debugging)
  tokens_used integer,
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_id_idx
  on public.chat_messages(conversation_id, created_at asc);

-- RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_conversations_owner" on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_messages_owner" on public.chat_messages
  for all using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- updated_at trigger
create trigger chat_conversations_touch before update on public.chat_conversations
  for each row execute function public.touch_updated_at();
```

---

## Deliverable 2: Chat types

Create `src/ai/chat/types.ts`:

```ts
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  tokensUsed?: number;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  userId: string;
  accountId: string | null;
  title: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
  error?: string;
}

// Gemini function calling types
export interface GeminiTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, GeminiToolParam>;
    required?: string[];
  };
}

export interface GeminiToolParam {
  type: string;
  description: string;
  enum?: string[];
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
```

---

## Deliverable 3: Tool functions

Create `src/ai/chat/tools.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { GeminiTool } from './types';

// =====================================================================
// TOOL DEFINITIONS (sent to Gemini so it knows what tools exist)
// =====================================================================

export const CHAT_TOOLS: GeminiTool[] = [
  {
    name: 'getAccountKpis',
    description: 'Get key performance indicators for the connected Instagram account over a date range. Returns engagement rate, save rate, send rate, reach, and follower growth.',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          enum: ['7d', '14d', '30d', '90d'],
          description: 'Date range to analyze. Default: 30d',
        },
      },
    },
  },
  {
    name: 'getTopPosts',
    description: 'Get top performing posts ranked by a specific metric. Use to answer questions like "what are my best posts?" or "which posts got the most saves?"',
    parameters: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['er_by_reach', 'saves_per_reach', 'sends_per_reach', 'reach', 'likes'],
          description: 'Metric to rank posts by',
        },
        limit: {
          type: 'string',
          description: 'Number of posts to return (1-20). Default: 5',
        },
        dateRange: {
          type: 'string',
          enum: ['7d', '14d', '30d', '90d', 'all'],
          description: 'Date range. Default: 30d',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'getPostingTimingAnalysis',
    description: 'Analyze which days and times generate the best engagement. Use to answer questions about optimal posting times.',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          enum: ['30d', '90d', 'all'],
          description: 'Date range for analysis. More data = more reliable results.',
        },
      },
    },
  },
  {
    name: 'comparePeriods',
    description: 'Compare KPI performance between two time periods. Use to answer "how did I do this week vs last week?" or similar comparison questions.',
    parameters: {
      type: 'object',
      properties: {
        period1Days: {
          type: 'string',
          description: 'Number of days for current period (e.g., "7" for last 7 days)',
        },
        period2Days: {
          type: 'string',
          description: 'Number of days for comparison period (e.g., "7" for the 7 days before that). Usually same as period1Days.',
        },
      },
      required: ['period1Days', 'period2Days'],
    },
  },
  {
    name: 'getThemePerformance',
    description: 'Get performance metrics broken down by content theme (FED, crypto, macro, education, etc.). Use to answer questions about which topics work best.',
    parameters: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          description: 'Specific theme to analyze. If omitted, returns all themes.',
          enum: [
            'fed', 'crypto', 'stocks_us', 'gold', 'forex',
            'real_estate', 'economy_eu', 'macro',
            'education', 'investing_principles', 'trading_strategy',
            'emerging_markets', 'other',
          ],
        },
        dateRange: {
          type: 'string',
          enum: ['30d', '90d', 'all'],
          description: 'Date range. Default: 30d',
        },
      },
    },
  },
  {
    name: 'getHookTypeAnalysis',
    description: 'Analyze which types of opening hooks (question, statement, quote, number, command) perform best in terms of engagement rate.',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          enum: ['30d', '90d', 'all'],
          description: 'Date range. Default: 30d',
        },
      },
    },
  },
  {
    name: 'getDiagnosticFlags',
    description: 'Get the current list of detected issues and recommendations for the account. Use to answer questions about what needs improvement.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getPostDetails',
    description: 'Get detailed information about a specific post including all metrics. Use when the user asks about a specific post.',
    parameters: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The UUID of the post',
        },
      },
      required: ['postId'],
    },
  },
];

// =====================================================================
// TOOL IMPLEMENTATIONS (actual DB queries)
// =====================================================================

interface ToolContext {
  userId: string;
  accountId: string;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const supabase = await createSupabaseServerClient();

  switch (name) {
    case 'getAccountKpis':
      return getAccountKpis(supabase, ctx, String(args.dateRange ?? '30d'));

    case 'getTopPosts':
      return getTopPosts(
        supabase, ctx,
        String(args.metric ?? 'er_by_reach'),
        parseInt(String(args.limit ?? '5'), 10),
        String(args.dateRange ?? '30d'),
      );

    case 'getPostingTimingAnalysis':
      return getPostingTimingAnalysis(supabase, ctx, String(args.dateRange ?? '30d'));

    case 'comparePeriods':
      return comparePeriods(
        supabase, ctx,
        parseInt(String(args.period1Days ?? '7'), 10),
        parseInt(String(args.period2Days ?? '7'), 10),
      );

    case 'getThemePerformance':
      return getThemePerformance(
        supabase, ctx,
        args.theme ? String(args.theme) : undefined,
        String(args.dateRange ?? '30d'),
      );

    case 'getHookTypeAnalysis':
      return getHookTypeAnalysis(supabase, ctx, String(args.dateRange ?? '30d'));

    case 'getDiagnosticFlags':
      return getDiagnosticFlags(supabase, ctx);

    case 'getPostDetails':
      return getPostDetails(supabase, ctx, String(args.postId ?? ''));

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- Individual tool implementations ----

function buildDateFilter(dateRange: string): string {
  const days: Record<string, number> = {
    '7d': 7, '14d': 14, '30d': 30, '90d': 90, 'all': 36500,
  };
  const d = days[dateRange] ?? 30;
  return new Date(Date.now() - d * 86400000).toISOString();
}

async function getAccountKpis(supabase: any, ctx: ToolContext, dateRange: string) {
  const since = buildDateFilter(dateRange);
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, saves_per_reach, sends_per_reach, reach, published_at')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (!posts || posts.length === 0) {
    return { error: 'No data for this period', postCount: 0 };
  }

  const safeAvg = (vals: number[]) => {
    const v = vals.filter(x => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  return {
    period: dateRange,
    postCount: posts.length,
    avgErByReach: safeAvg(posts.map((p: any) => p.er_by_reach)),
    avgSavesPerReach: safeAvg(posts.map((p: any) => p.saves_per_reach).filter(Boolean)),
    avgSendsPerReach: safeAvg(posts.map((p: any) => p.sends_per_reach).filter(Boolean)),
    avgReach: safeAvg(posts.map((p: any) => p.reach).filter(Boolean)),
    benchmarks: {
      erByReach: { excellent: 6, good: 4, average: 2 },
      savesPerReach: { excellent: 3, good: 1, average: 0.5 },
      sendsPerReach: { excellent: 1.5, good: 0.5, average: 0.1 },
    },
  };
}

async function getTopPosts(
  supabase: any, ctx: ToolContext,
  metric: string, limit: number, dateRange: string,
) {
  const since = buildDateFilter(dateRange);
  const { data } = await supabase
    .from('posts_with_latest_metrics')
    .select(`
      id, caption, media_type, theme, published_at,
      er_by_reach, saves_per_reach, sends_per_reach, reach
    `)
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not(metric, 'is', null)
    .gt(metric, 0)
    .order(metric, { ascending: false })
    .limit(Math.min(limit, 20));

  return (data ?? []).map((p: any) => ({
    id: p.id,
    caption: (p.caption ?? '').slice(0, 120),
    mediaType: p.media_type,
    theme: p.theme,
    publishedAt: p.published_at,
    erByReach: p.er_by_reach,
    savesPerReach: p.saves_per_reach,
    sendsPerReach: p.sends_per_reach,
    reach: p.reach,
  }));
}

async function getPostingTimingAnalysis(supabase: any, ctx: ToolContext, dateRange: string) {
  const since = buildDateFilter(dateRange);
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select('published_at, er_by_reach, reach')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (!posts || posts.length === 0) return { error: 'Insufficient data' };

  const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const byDay: Record<string, number[]> = {};
  const byHour: Record<number, number[]> = {};

  for (const p of posts) {
    const d = new Date(p.published_at);
    const day = days[d.getDay()];
    const hour = d.getHours();
    if (!byDay[day]) byDay[day] = [];
    if (!byHour[hour]) byHour[hour] = [];
    byDay[day].push(p.er_by_reach);
    byHour[hour].push(p.er_by_reach);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const dayStats = Object.entries(byDay)
    .map(([day, ers]) => ({ day, postCount: ers.length, avgEr: avg(ers) }))
    .sort((a, b) => b.avgEr - a.avgEr);

  const hourStats = Object.entries(byHour)
    .map(([hour, ers]) => ({ hour: parseInt(hour), postCount: ers.length, avgEr: avg(ers) }))
    .sort((a, b) => b.avgEr - a.avgEr)
    .slice(0, 5);

  return {
    bestDays: dayStats.slice(0, 3),
    worstDays: dayStats.slice(-2),
    bestHours: hourStats,
    totalPostsAnalyzed: posts.length,
    note: posts.length < 10 ? 'Date limitate — recomandare cu rezerve' : null,
  };
}

async function comparePeriods(
  supabase: any, ctx: ToolContext,
  period1Days: number, period2Days: number,
) {
  const now = Date.now();
  const p1Start = new Date(now - period1Days * 86400000).toISOString();
  const p2Start = new Date(now - (period1Days + period2Days) * 86400000).toISOString();
  const p2End = new Date(now - period1Days * 86400000).toISOString();

  const fetchPeriod = async (from: string, to: string) => {
    const { data } = await supabase
      .from('posts_with_latest_metrics')
      .select('er_by_reach, saves_per_reach, sends_per_reach, reach')
      .eq('account_id', ctx.accountId)
      .gte('published_at', from)
      .lte('published_at', to)
      .not('er_by_reach', 'is', null)
      .gt('er_by_reach', 0);
    return data ?? [];
  };

  const p1 = await fetchPeriod(p1Start, new Date(now).toISOString());
  const p2 = await fetchPeriod(p2Start, p2End);

  const safeAvg = (posts: any[], key: string) => {
    const vals = posts.map((p: any) => p[key]).filter((v: any) => v != null && v > 0);
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
  };

  const delta = (curr: number | null, prev: number | null) => {
    if (!curr || !prev) return null;
    return ((curr - prev) / prev * 100).toFixed(1) + '%';
  };

  const p1Stats = {
    postCount: p1.length,
    avgEr: safeAvg(p1, 'er_by_reach'),
    avgSaves: safeAvg(p1, 'saves_per_reach'),
    avgSends: safeAvg(p1, 'sends_per_reach'),
    avgReach: safeAvg(p1, 'reach'),
  };

  const p2Stats = {
    postCount: p2.length,
    avgEr: safeAvg(p2, 'er_by_reach'),
    avgSaves: safeAvg(p2, 'saves_per_reach'),
    avgSends: safeAvg(p2, 'sends_per_reach'),
    avgReach: safeAvg(p2, 'reach'),
  };

  return {
    currentPeriod: { days: period1Days, ...p1Stats },
    previousPeriod: { days: period2Days, ...p2Stats },
    deltas: {
      er: delta(p1Stats.avgEr, p2Stats.avgEr),
      saves: delta(p1Stats.avgSaves, p2Stats.avgSaves),
      sends: delta(p1Stats.avgSends, p2Stats.avgSends),
      reach: delta(p1Stats.avgReach, p2Stats.avgReach),
    },
  };
}

async function getThemePerformance(
  supabase: any, ctx: ToolContext,
  theme: string | undefined, dateRange: string,
) {
  const since = buildDateFilter(dateRange);
  let query = supabase
    .from('posts_with_latest_metrics')
    .select('theme, er_by_reach, saves_per_reach, sends_per_reach, reach, caption, published_at')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (theme) query = query.eq('theme', theme);

  const { data: posts } = await query;
  if (!posts || posts.length === 0) return { error: 'No data', theme };

  if (theme) {
    const safeAvg = (arr: number[]) => {
      const v = arr.filter(x => x > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      theme,
      postCount: posts.length,
      avgEr: safeAvg(posts.map((p: any) => p.er_by_reach)),
      avgSaves: safeAvg(posts.map((p: any) => p.saves_per_reach).filter(Boolean)),
      avgSends: safeAvg(posts.map((p: any) => p.sends_per_reach).filter(Boolean)),
      topPost: posts.sort((a: any, b: any) => b.er_by_reach - a.er_by_reach)[0],
    };
  }

  // Group by theme
  const grouped: Record<string, any[]> = {};
  for (const p of posts) {
    const t = p.theme ?? 'other';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(p);
  }

  return Object.entries(grouped).map(([t, ps]) => {
    const safeAvg = (arr: number[]) => {
      const v = arr.filter(x => x > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      theme: t,
      postCount: ps.length,
      avgEr: safeAvg(ps.map((p: any) => p.er_by_reach)),
      avgSaves: safeAvg(ps.map((p: any) => p.saves_per_reach).filter(Boolean)),
      avgSends: safeAvg(ps.map((p: any) => p.sends_per_reach).filter(Boolean)),
    };
  }).sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0));
}

async function getHookTypeAnalysis(supabase: any, ctx: ToolContext, dateRange: string) {
  const since = buildDateFilter(dateRange);
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select('caption, er_by_reach, saves_per_reach')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (!posts || posts.length === 0) return { error: 'Insufficient data' };

  // Import the classifyHookType utility
  const { classifyHookType } = await import('@/lib/content-analysis/caption-utils');

  const byType: Record<string, number[]> = {};
  for (const p of posts) {
    const hookType = classifyHookType(p.caption);
    if (!byType[hookType]) byType[hookType] = [];
    byType[hookType].push(p.er_by_reach);
  }

  return Object.entries(byType).map(([type, ers]) => ({
    hookType: type,
    postCount: ers.length,
    avgEr: ers.reduce((a, b) => a + b, 0) / ers.length,
  })).sort((a, b) => b.avgEr - a.avgEr);
}

async function getDiagnosticFlags(supabase: any, ctx: ToolContext) {
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select(`
      id, caption, media_type, theme, theme_confidence, hashtags,
      er_by_reach, saves_per_reach, sends_per_reach, reach,
      save_to_like_ratio, published_at
    `)
    .eq('account_id', ctx.accountId)
    .gte('published_at', buildDateFilter('30d'));

  if (!posts || posts.length === 0) return { flags: [], message: 'Insufficient data' };

  const { computeDiagnosticFlags } = await import('@/lib/dashboard/data');
  const { detectSaveCta, classifyHookType, countCaptionWords } =
    await import('@/lib/content-analysis/caption-utils');

  const enriched = posts.map((p: any) => ({
    ...p,
    hasSaveCta: detectSaveCta(p.caption),
    hookType: classifyHookType(p.caption),
    captionWordCount: countCaptionWords(p.caption),
    hashtagCount: (p.hashtags ?? []).length,
  }));

  const safeAvg = (vals: number[]) => {
    const v = vals.filter(x => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const flags = computeDiagnosticFlags(enriched, {
    postCount: posts.length,
    avgErByReach: safeAvg(posts.map((p: any) => p.er_by_reach)),
    avgSavesPerReach: safeAvg(posts.map((p: any) => p.saves_per_reach).filter(Boolean)),
    avgSendsPerReach: safeAvg(posts.map((p: any) => p.sends_per_reach).filter(Boolean)),
    avgReach: safeAvg(posts.map((p: any) => p.reach).filter(Boolean)),
    followerStart: null,
    followerEnd: null,
    sampleSizeWarning: posts.length < 5,
    totalReach: null,
  });

  return flags.map(f => ({
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    affectedCount: f.affectedPostIds.length,
    benchmark: f.benchmark,
  }));
}

async function getPostDetails(supabase: any, ctx: ToolContext, postId: string) {
  const { data } = await supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .eq('id', postId)
    .eq('account_id', ctx.accountId)
    .single();

  if (!data) return { error: 'Post not found' };

  return {
    id: data.id,
    caption: data.caption,
    mediaType: data.media_type,
    theme: data.theme,
    publishedAt: data.published_at,
    erByReach: data.er_by_reach,
    savesPerReach: data.saves_per_reach,
    sendsPerReach: data.sends_per_reach,
    reach: data.reach,
    likes: data.likes,
    saves: data.saves,
    shares: data.shares,
    comments: data.comments,
    saveToLikeRatio: data.save_to_like_ratio,
    permalink: data.permalink,
  };
}
```

---

## Deliverable 4: System prompt

Create `src/ai/chat/system-prompt.ts`:

```ts
import 'server-only';
import forkConfig from '../../../fork-config';

interface AccountContext {
  displayName: string;
  handle: string;
  platform: string;
  followerCount: number | null;
}

export function buildChatSystemPrompt(account: AccountContext): string {
  return `Ești un expert în social media analytics specializat în conținut financiar și economic, cu acces complet la datele contului Instagram @${account.handle} (${account.displayName}).

## Identitatea ta

Ești un consultant de social media extrem de priceput, care:
- Cunoaște algoritmul Instagram în profunzime (2026)
- Înțelege nișa creatorilor financiari (macro, investiții, trading, economie)
- Vorbește român fluent cu diacritice corecte
- Răspunde concis și acționabil — nu generic
- Citează mereu datele concrete din contul utilizatorului

## Contul analizat

- Handle: @${account.handle}
- Urmăritori: ${account.followerCount ?? 'necunoscut'}
- Platformă: ${account.platform}
- Nișă: ${forkConfig.contentNiche.label}

## Cum folosești tool-urile

Când utilizatorul pune o întrebare care necesită date, APELEZI tool-ul corespunzător ÎNAINTE să răspunzi. Nu presupune date — cere-le.

Exemple:
- "Care e cel mai bun moment să postez?" → apelezi getPostingTimingAnalysis()
- "Cum merge contul?" → apelezi getAccountKpis('30d')
- "Ce postări au mers bine?" → apelezi getTopPosts('er_by_reach', 5, '30d')
- "Compară săptămâna asta vs trecuta" → apelezi comparePeriods('7', '7')
- "Ce temă funcționează cel mai bine?" → apelezi getThemePerformance()
- "Ce trebuie să îmbunătățesc?" → apelezi getDiagnosticFlags()

Poți apela mai multe tool-uri consecutiv dacă întrebarea necesită date din surse multiple.

## Benchmarks industrie 2026 (creator financiar)

Folosește-le când compari performanța cu industria:
- Engagement Rate by Reach: >6% = excelent, >4% = bun, 2-4% = mediu, <2% = slab
- Save Rate: >3% = excelent, >1% = bun, >0.5% = acceptabil, <0.5% = problematic
- Send Rate: >1.5% = excelent, >0.5% = bun, >0.1% = acceptabil
- Reach Rate (reach/followers): >30% = excelent, >15% = bun, >8% = mediu
- Save-to-Like Ratio: >0.3 = conținut de referință, <0.1 = entertainment

## Stil de răspuns

- **Specific cu cifre:** "ER-ul tău de 9.4% depășește benchmark-ul de 6%" nu "performezi bine"
- **Acționabil:** fiecare insight trebuie să aibă o implicație practică
- **Concis:** nu mai mult de 3-4 paragrafe per răspuns, dacă nu e cerut explicit mai mult
- **Markdown ușor:** folosește **bold** pentru cifre cheie, liste pentru recomandări multiple
- **Ton:** profesional dar direct, ca un consultant care vrea binele creatorului
- **Limbă:** română cu diacritice corecte

## Ce NU faci

- Nu inventezi date — dacă tool-ul returnează "eroare" sau "date insuficiente", spui asta explicit
- Nu dai sfaturi generice de social media când ai date specifice disponibile
- Nu repeti aceeași informație de mai multe ori în același răspuns
- Nu spui "Ca AI, nu pot..." — ești un expert consultant, nu un chatbot generic`;
}
```

---

## Deliverable 5: Streaming API route

Create `src/app/api/chat/message/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { buildChatSystemPrompt } from '@/ai/chat/system-prompt';
import { CHAT_TOOLS, executeTool } from '@/ai/chat/tools';
import { env } from '@/lib/env';
import type { ChatMessage } from '@/ai/chat/types';

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 5; // prevent infinite tool calling loops

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    message: string;
    conversationId: string | null;
    accountId: string;
  };

  const { message, conversationId, accountId } = body;

  // Verify account ownership
  const { data: account } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .insert({
        user_id: user.id,
        account_id: accountId,
        title: message.slice(0, 60),
        last_message_preview: message.slice(0, 100),
      })
      .select('id')
      .single();
    convId = conv!.id;
  }

  // Load conversation history (last 20 messages)
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(20);

  // Save user message
  await supabase.from('chat_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: message,
  });

  // Build Gemini request
  const systemPrompt = buildChatSystemPrompt({
    displayName: account.display_name,
    handle: account.handle ?? account.display_name,
    platform: account.provider_id,
    followerCount: null,
  });

  const contents = [
    ...(history ?? []).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  // Tool definitions for Gemini
  const toolsForGemini = {
    functionDeclarations: CHAT_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };

  // Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let currentContents = contents;
        let toolRound = 0;
        let finalText = '';
        const allToolCalls: object[] = [];
        const allToolResults: object[] = [];

        // Agentic loop: keep going until Gemini stops calling tools
        while (toolRound < MAX_TOOL_ROUNDS) {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: currentContents,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [toolsForGemini],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                },
              }),
            }
          );

          if (!geminiRes.ok) {
            const err = await geminiRes.text();
            console.error('[chat] Gemini error:', err);
            send({ type: 'error', message: 'Eroare la generarea răspunsului.' });
            controller.close();
            return;
          }

          const geminiJson = await geminiRes.json() as any;
          const candidate = geminiJson.candidates?.[0];
          const parts = candidate?.content?.parts ?? [];

          // Check if Gemini wants to call tools
          const functionCalls = parts.filter((p: any) => p.functionCall);
          const textParts = parts.filter((p: any) => p.text);

          if (functionCalls.length > 0) {
            // Execute tool calls
            send({ type: 'tool_start', tools: functionCalls.map((p: any) => p.functionCall.name) });

            const toolResponseParts = [];
            for (const part of functionCalls) {
              const { name, args } = part.functionCall;
              allToolCalls.push({ name, args });

              let result: unknown;
              try {
                result = await executeTool(name, args, { userId: user.id, accountId });
                console.log(`[chat] tool ${name} executed successfully`);
              } catch (err) {
                result = { error: err instanceof Error ? err.message : 'Tool execution failed' };
                console.error(`[chat] tool ${name} failed:`, err);
              }

              allToolResults.push({ name, result });
              toolResponseParts.push({
                functionResponse: { name, response: result },
              });
            }

            // Continue conversation with tool results
            currentContents = [
              ...currentContents,
              { role: 'model', parts },
              { role: 'user', parts: toolResponseParts },
            ];

            toolRound++;
            continue; // go around again
          }

          // No more tool calls — stream the final text response
          if (textParts.length > 0) {
            finalText = textParts.map((p: any) => p.text).join('');

            // Stream word by word (simulate streaming since Gemini REST doesn't stream)
            // For true streaming, use Gemini's streamGenerateContent endpoint
            const words = finalText.split(' ');
            for (let i = 0; i < words.length; i++) {
              const chunk = i === 0 ? words[i] : ' ' + words[i];
              send({ type: 'chunk', text: chunk });
              // Small delay to simulate streaming effect
              await new Promise(r => setTimeout(r, 15));
            }
          }

          break; // exit agentic loop
        }

        // Save assistant message to DB
        await supabase.from('chat_messages').insert({
          conversation_id: convId,
          role: 'assistant',
          content: finalText,
          tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
          tool_results: allToolResults.length > 0 ? allToolResults : null,
        });

        // Update conversation metadata
        await supabase
          .from('chat_conversations')
          .update({
            last_message_preview: finalText.slice(0, 100),
            updated_at: new Date().toISOString(),
          })
          .eq('id', convId);

        // Send completion event with conversationId (for new conversations)
        send({ type: 'done', conversationId: convId });
        controller.close();

      } catch (err) {
        console.error('[chat] stream error:', err);
        send({ type: 'error', message: 'A apărut o eroare neașteptată.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Note on streaming:** The Gemini REST API (`generateContent`) is not truly streaming. The code above simulates streaming by splitting the response into words with a small delay. For true token-by-token streaming, use Gemini's `streamGenerateContent` endpoint — but that requires a different response parsing approach. The word-by-word simulation works well for POC and feels responsive. Document this in code comments and upgrade to true streaming in a later prompt if desired.

---

## Deliverable 6: Conversations API route

Create `src/app/api/chat/conversations/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';

// GET /api/chat/conversations?accountId=...
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get('accountId');

  let query = supabase
    .from('chat_conversations')
    .select('id, title, updated_at, message_count, last_message_preview, account_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (accountId) query = query.eq('account_id', accountId);

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

// DELETE /api/chat/conversations/:id
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
```

---

## Deliverable 7: Chat UI

### 7.1 Page

Create `src/app/dashboard/chat/page.tsx` (Server Component):

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ChatInterface } from '@/components/chat/ChatInterface';

interface Props {
  searchParams: Promise<{ conversation?: string; account?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;

  // Get user's active accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at');

  if (!accounts || accounts.length === 0) {
    redirect('/dashboard/accounts');
  }

  const activeAccountId = params.account ?? accounts[0].id;
  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? accounts[0];

  // Load initial conversation if specified
  let initialMessages = [];
  if (params.conversation) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', params.conversation)
      .order('created_at', { ascending: true });
    initialMessages = msgs ?? [];
  }

  return (
    <ChatInterface
      accounts={accounts}
      activeAccount={activeAccount}
      initialConversationId={params.conversation ?? null}
      initialMessages={initialMessages}
    />
  );
}
```

### 7.2 ChatInterface

Create `src/components/chat/ChatInterface.tsx` (Client Component):

```tsx
'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { Eyebrow, H3, Mono } from '@/components/design-system';
import type { ChatMessage, ChatConversation } from '@/ai/chat/types';

interface Props {
  accounts: Array<{ id: string; display_name: string; handle: string | null; provider_id: string }>;
  activeAccount: { id: string; display_name: string; handle: string | null };
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
}

export function ChatInterface({ accounts, activeAccount, initialConversationId, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolNames, setActiveToolNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: conversationId ?? '',
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingText('');
    setActiveToolNames([]);
    setError(null);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
          accountId: activeAccount.id,
        }),
      });

      if (!res.ok) throw new Error('Request failed');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'chunk') {
            accumulated += data.text;
            setStreamingText(accumulated);
          } else if (data.type === 'tool_start') {
            setActiveToolNames(data.tools);
          } else if (data.type === 'done') {
            if (data.conversationId && !conversationId) {
              setConversationId(data.conversationId);
              router.replace(`/dashboard/chat?conversation=${data.conversationId}&account=${activeAccount.id}`, { scroll: false });
            }
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              conversationId: data.conversationId ?? conversationId ?? '',
              role: 'assistant',
              content: accumulated,
              createdAt: new Date().toISOString(),
            }]);
            setStreamingText('');
            setActiveToolNames([]);
          } else if (data.type === 'error') {
            setError(data.message);
          }
        }
      }
    } catch (err) {
      setError('Eroare de conexiune. Încearcă din nou.');
      console.error('[chat]', err);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setActiveToolNames([]);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setStreamingText('');
    setError(null);
    router.replace(`/dashboard/chat?account=${activeAccount.id}`, { scroll: false });
  };

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 64px)',  // full height minus TopBar
      overflow: 'hidden',
    }}>
      {/* Left sidebar: conversation list */}
      <div style={{
        width: 260,
        borderRight: '1px solid var(--color-border-default)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <Eyebrow tone="muted">CONVERSAȚII</Eyebrow>
          <button
            onClick={startNewConversation}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 8,
              padding: '8px 12px',
              background: 'var(--color-accent-lime)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            + CONVERSAȚIE NOUĂ
          </button>
        </div>
        <ConversationList
          accountId={activeAccount.id}
          activeConversationId={conversationId}
          onSelect={(id) => {
            router.push(`/dashboard/chat?conversation=${id}&account=${activeAccount.id}`);
          }}
        />
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Chat header */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <Mono style={{ fontSize: 11 }} tone="muted">EXPERT AI · {activeAccount.handle ?? activeAccount.display_name}</Mono>
            <H3 style={{ margin: 0 }}>Chat Analytics</H3>
          </div>
          {activeToolNames.length > 0 && (
            <Mono tone="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
              ⚡ {activeToolNames.join(', ')}
            </Mono>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {messages.length === 0 && !isStreaming && (
            <WelcomeScreen handle={activeAccount.handle ?? activeAccount.display_name} onSuggestion={sendMessage} />
          )}
          <MessageList messages={messages} />
          {isStreaming && streamingText && (
            <MessageBubbleStreaming text={streamingText} />
          )}
          {isStreaming && !streamingText && (
            <TypingIndicator toolNames={activeToolNames} />
          )}
          {error && (
            <div style={{ color: 'var(--color-accent-coral)', padding: '8px 0', fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid var(--color-border-default)',
          padding: '16px 24px',
        }}>
          <MessageInput onSend={sendMessage} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ handle, onSuggestion }: { handle: string; onSuggestion: (s: string) => void }) {
  const suggestions = [
    'Care e cel mai bun moment să postez?',
    'Cum merge contul în ultimele 30 de zile?',
    'Ce temă funcționează cel mai bine?',
    'Compară săptămâna asta cu cea trecută',
    'Ce trebuie să îmbunătățesc urgent?',
    'Care sunt cele mai bune postări ale mele?',
  ];

  return (
    <div style={{ textAlign: 'center', padding: '40px 0 32px' }}>
      <Mono style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>💬</Mono>
      <H3>Bun venit în Chat Analytics</H3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Întreabă orice despre contul @{handle}. Am acces la toate datele tale.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 600, margin: '0 auto' }}>
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            style={{
              padding: '8px 14px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-inter)',
              textAlign: 'left',
              transition: 'border-color 0.15s',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 7.3 MessageList, MessageBubble, ConversationList, MessageInput, TypingIndicator

**`MessageList.tsx`:**
Renders an array of `ChatMessage`. Each message uses `MessageBubble`.

**`MessageBubble.tsx`:**
```tsx
// User messages: right-aligned, lime background, black text
// Assistant messages: left-aligned, bgCard background, textPrimary
// Renders markdown: bold with <strong>, lists, line breaks
// Shows timestamp in mono muted at bottom
```

For markdown rendering in assistant messages, handle minimally:
- `**text**` → `<strong>text</strong>`
- Lines starting with `- ` or `* ` → bullet list items
- `\n\n` → paragraph breaks
- ` ` → code

No heavy markdown library needed for chat — implement a simple renderer with regex replace.

**`MessageBubbleStreaming.tsx`:**
Same as `MessageBubble` for assistant but with a blinking cursor `▊` appended.

**`ConversationList.tsx`:**
- Fetches conversations from `/api/chat/conversations?accountId=...`
- Shows title (first message truncated) + relative time
- Active conversation highlighted with lime left-border
- Delete button on hover (small ×)

**`MessageInput.tsx`:**
- Textarea that auto-expands (up to 5 rows)
- Send on Enter (Shift+Enter for newline)
- Send button: lime, disabled when empty or streaming
- Character hint: "Enter pentru trimite, Shift+Enter pentru rând nou"

**`TypingIndicator.tsx`:**
```tsx
// Animated 3 dots (CSS animation)
// If activeToolNames.length > 0: shows "⚡ Caut date: getTopPosts..."
// Otherwise: shows "Scriu..."
```

---

## Deliverable 8: Sidebar navigation update

In `src/components/layout/Sidebar.tsx`, add "CHAT" nav item between "ANALIZE" and "SETĂRI":

```tsx
{ href: '/dashboard/chat', label: 'CHAT' },
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **DB migration:** apply `0005_chat_tables.sql` in Supabase. Tables `chat_conversations` and `chat_messages` exist with RLS enabled.
4. **Navigation:** "CHAT" appears in sidebar between ANALIZE and SETĂRI. Clicking navigates to `/dashboard/chat`.
5. **Welcome screen:** on first visit (no conversation), welcome screen shows with 6 suggestion buttons.
6. **Send a message:** type "Cum merge contul?" and press Enter. Within 2-3 seconds, response starts appearing word by word.
7. **Tool calling visible:** during response generation, the header area briefly shows "⚡ getAccountKpis" — confirming tools are being called.
8. **Response is data-driven:** the response mentions real KPI values (ER%, Save Rate%) from the account, not generic advice.
9. **Streaming works:** text appears word by word, not all at once.
10. **Conversation persists:** refresh the page — the conversation history is still visible.
11. **New conversation button:** click "+ CONVERSAȚIE NOUĂ" — messages clear, new conversation on next send.
12. **Conversation list:** after 2 conversations, they appear in the left sidebar with titles.
13. **Switch conversations:** clicking a past conversation in the sidebar loads its messages.
14. **Tool test — timing:** ask "Care e cel mai bun moment să postez?" — response should mention specific days and hours with ER data.
15. **Tool test — comparison:** ask "Compară săptămâna asta cu cea trecută" — response should show period deltas.
16. **Tool test — themes:** ask "Ce temă funcționează cel mai bine?" — response should list themes with ER values.
17. **Tool test — diagnostic:** ask "Ce trebuie să îmbunătățesc?" — response should list diagnostic flags with specifics.
18. **Romanian language:** all AI responses in Romanian with correct diacritics.
19. **No shadows** on any new component.
20. **RLS:** a different logged-in user cannot access another user's conversations (verify by checking RLS in Supabase).
21. **Error handling:** if Gemini API key is temporarily wrong, error message appears in chat (not a crash).
22. **Mobile basic:** chat layout doesn't overflow horizontally on 375px viewport.

## Notes for Claude Code

- **Simulated streaming** is fine for POC. The word-split with 15ms delay creates a smooth typing effect. Document in code that true token streaming requires `streamGenerateContent` endpoint.
- **Tool calling loop** has a `MAX_TOOL_ROUNDS = 5` safety limit. This prevents Gemini from calling tools infinitely if something goes wrong.
- **The agentic loop pattern** (call Gemini → check for function calls → execute → continue) is standard for function calling. Don't try to shortcut it.
- **`any` types** are used for Supabase query results in tools.ts for brevity — acceptable given the volume of queries. Add proper types if TypeScript complains.
- **Conversation title** defaults to the first message truncated to 60 chars. Could be improved to AI-generated title but that's overkill for POC.
- **The welcome screen suggestions** are hardcoded in Romanian. Make sure they match the system prompt's capabilities.
- **MessageBubble markdown rendering** should handle the most common patterns from Gemini responses: bold, lists, code snippets. Don't implement full CommonMark — just the patterns that appear in practice.
- **`crypto.randomUUID()`** is available in modern browsers and Node 18+. No polyfill needed.
- **The chat layout** uses `height: calc(100vh - 64px)` — this assumes the TopBar is 64px tall. Verify and adjust if different.

## What Andrei will do after this prompt

1. Apply `0005_chat_tables.sql` in Supabase Dashboard
2. `pnpm dev`, verify build clean
3. Click "CHAT" in sidebar
4. Test 6 suggestion questions — verify each gets a data-driven response
5. Ask a custom question: "Care sunt cei mai buni 5 urmăritori ai mei ca engagement?" (should gracefully say it doesn't have follower-level data)
6. Verify conversation persists after refresh
7. Create 3 conversations, verify they appear in sidebar
8. Report:
   - Quality of responses (specific? data-driven? in Romanian?)
   - Which tool calls were triggered for which questions
   - Any errors or unexpected behavior
   - Latency (how long before first word appears?)