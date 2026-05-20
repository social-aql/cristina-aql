# AI Provider Layer + Meta Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement pluggable AI provider layer (Gemini + Claude adapters, three analysis types, cron scheduling) and a real Meta Instagram social provider.

**Architecture:** AI providers follow a typed interface (AiProvider) with tier-based routing (batch→Gemini, deep→Claude). Data flows from DB via buildAnalysisBundle → runAnalysis → AI provider → ai_analyses table. Meta provider implements the existing SocialProvider interface exactly; sync-account.ts requires zero changes.

**Tech Stack:** @google/generative-ai, @anthropic-ai/sdk (already installed), react-markdown + remark-gfm, Next.js 14 server actions, Supabase, fetch (for Meta Graph API — no SDK)

---

## Phase Overview

- **Phase A** (Tasks 1–23): AI provider layer — types, adapters, registry, bundle, templates, config, run logic, cron, UI components, pages, settings.
- **Phase B** (Tasks 24–35): Meta Instagram provider — types, graph client, OAuth, mappers, callback route, account select page, providers config update.

---

## PHASE A: AI Provider Layer

### Task 1: Install deps + update env

- [ ] Run: `pnpm add @google/generative-ai react-markdown remark-gfm`

- [ ] Replace `src/lib/env.ts` with:

```ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ENCRYPTION_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  GOOGLE_AI_API_KEY: z.string().min(1),
  AI_DEFAULT_TIER: z.enum(['batch', 'deep']).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_ENABLE_MOCK_PROVIDER: z.string().optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
  AI_DEFAULT_TIER: process.env.AI_DEFAULT_TIER,
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_ENABLE_MOCK_PROVIDER: process.env.NEXT_PUBLIC_ENABLE_MOCK_PROVIDER,
});
```

- [ ] Append to `.env.example`:

```
# AI
GOOGLE_AI_API_KEY=          # https://aistudio.google.com/apikey (free)
AI_DEFAULT_TIER=batch       # 'batch' | 'deep'

# Cron
CRON_SECRET=                # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Feature flags
NEXT_PUBLIC_ENABLE_MOCK_PROVIDER=true
```

- [ ] Add `GOOGLE_AI_API_KEY=<your-key>` to `.env.local` (get from https://aistudio.google.com/apikey — free tier).

**Verification:** `pnpm build` fails with Zod validation error mentioning `GOOGLE_AI_API_KEY` if the key is missing from `.env.local`. Once added, build proceeds.

---

### Task 2: AI provider types + DataRow neutral tone

- [ ] Create `src/ai/providers/types.ts`:

```ts
import type { z } from 'zod';

export type AiTier = 'batch' | 'deep';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AiContentBlock[];
}

export interface AiContentBlock {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageBase64?: string;
}

export interface AiGenerateInput {
  systemPrompt: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  responseSchema?: z.ZodTypeAny;
}

export interface AiGenerateOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: 'stop' | 'length' | 'error';
  raw?: unknown;
}

export class AiProviderError extends Error {
  retryable: boolean;
  rateLimited: boolean;
  constructor(message: string, opts: { retryable: boolean; rateLimited: boolean }) {
    super(message);
    this.name = 'AiProviderError';
    this.retryable = opts.retryable;
    this.rateLimited = opts.rateLimited;
  }
}

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  readonly tier: AiTier;
  readonly model: string;
  readonly supportsImages: boolean;
  readonly costPerMillionInputTokens: number;
  readonly costPerMillionOutputTokens: number;
  readonly rateLimit: { requestsPerMinute: number; requestsPerDay?: number };
  generate(input: AiGenerateInput): Promise<AiGenerateOutput>;
  isAvailable(): boolean;
}
```

- [ ] Modify `src/components/design-system/DataRow.tsx` — add `'neutral'` to tone:
  - Change the tone prop type from `tone: 'positive' | 'negative'` to `tone: 'positive' | 'negative' | 'neutral'`
  - In the `accentColor` (or equivalent color selection) expression, add the neutral case mapping to `colors.textSecondary`. Example: if the existing code is `tone === 'positive' ? colors.accentLime : colors.accentCoral`, change it to `tone === 'positive' ? colors.accentLime : tone === 'neutral' ? colors.textSecondary : colors.accentCoral`

---

### Task 3: Gemini adapter

- [ ] Create `src/ai/providers/gemini/index.ts`:

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/lib/env';
import { AiProviderError } from '../types';
import type { AiProvider, AiGenerateInput, AiGenerateOutput } from '../types';

export const geminiProvider: AiProvider = {
  id: 'gemini',
  displayName: 'Gemini 2.5 Flash',
  tier: 'batch',
  model: 'gemini-2.5-flash',
  supportsImages: true,
  costPerMillionInputTokens: 0,
  costPerMillionOutputTokens: 0,
  rateLimit: { requestsPerMinute: 15, requestsPerDay: 1500 },

  isAvailable(): boolean {
    return Boolean(env.GOOGLE_AI_API_KEY);
  },

  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    const genAI = new GoogleGenerativeAI(env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: input.systemPrompt,
    });

    const contents = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (typeof m.content === 'string') {
          return { role, parts: [{ text: m.content }] };
        }
        const parts = m.content.flatMap((block) => {
          if (block.type === 'text' && block.text) return [{ text: block.text }];
          if (block.type === 'image' && block.imageBase64) {
            return [{ inlineData: { mimeType: 'image/jpeg', data: block.imageBase64 } }];
          }
          return [];
        });
        return { role, parts };
      });

    try {
      const result = await model.generateContent({
        contents,
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? 2048,
          temperature: input.temperature ?? 0.6,
        },
      });
      const text = result.response.text();
      const usage = result.response.usageMetadata;
      const finishReason = result.response.candidates?.[0]?.finishReason;
      return {
        text,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        model: this.model,
        finishReason: finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
        raw: result,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRate = msg.includes('429') || msg.toLowerCase().includes('quota');
      throw new AiProviderError(`Gemini error: ${msg}`, { retryable: isRate, rateLimited: isRate });
    }
  },
};
```

---

### Task 4: Claude adapter

- [ ] Create `src/ai/providers/claude/index.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { AiProviderError } from '../types';
import type { AiProvider, AiGenerateInput, AiGenerateOutput, AiMessage } from '../types';

const PREFERRED = 'claude-opus-4-7';
const FALLBACK = 'claude-opus-4-6';
let resolvedModel: string | null = null;

function toAnthropicMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (typeof m.content === 'string') return { role, content: m.content } as Anthropic.MessageParam;
      const content: Anthropic.ContentBlockParam[] = m.content.flatMap((b) => {
        if (b.type === 'text' && b.text) return [{ type: 'text' as const, text: b.text }];
        if (b.type === 'image' && b.imageBase64) {
          return [{
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/jpeg' as const,
              data: b.imageBase64,
            },
          }];
        }
        return [];
      });
      return { role, content } as Anthropic.MessageParam;
    });
}

export const claudeProvider: AiProvider = {
  id: 'claude',
  displayName: 'Claude Opus 4.7',
  tier: 'deep',
  model: PREFERRED,
  supportsImages: true,
  costPerMillionInputTokens: 15,
  costPerMillionOutputTokens: 75,
  rateLimit: { requestsPerMinute: 5 },

  isAvailable(): boolean {
    return Boolean(env.ANTHROPIC_API_KEY);
  },

  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msgs = toAnthropicMessages(input.messages);

    const call = (model: string) =>
      client.messages.create({
        model,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.6,
        system: input.systemPrompt,
        messages: msgs,
      });

    const normalize = (r: Anthropic.Message, model: string): AiGenerateOutput => ({
      text: r.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join(''),
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      model,
      finishReason: r.stop_reason === 'max_tokens' ? 'length' : 'stop',
      raw: r,
    });

    try {
      if (!resolvedModel) {
        try {
          const r = await call(PREFERRED);
          resolvedModel = PREFERRED;
          return normalize(r, PREFERRED);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('model') || msg.includes('404') || msg.includes('not_found')) {
            console.warn(`[claude] ${PREFERRED} unavailable, falling back to ${FALLBACK}`);
            resolvedModel = FALLBACK;
          } else {
            throw e;
          }
        }
      }
      const model = resolvedModel ?? FALLBACK;
      const r = await call(model);
      return normalize(r, model);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRate = msg.includes('429') || msg.toLowerCase().includes('rate_limit');
      throw new AiProviderError(`Claude error: ${msg}`, { retryable: isRate, rateLimited: isRate });
    }
  },
};
```

---

### Task 5: AI registry

- [ ] Create `src/ai/registry.ts`:

```ts
import { geminiProvider } from './providers/gemini';
import { claudeProvider } from './providers/claude';
import type { AiProvider, AiTier } from './providers/types';
import { AiProviderError } from './providers/types';

export const aiProviders: AiProvider[] = [geminiProvider, claudeProvider];

export function getAiProvider(id: string): AiProvider | undefined {
  return aiProviders.find((p) => p.id === id);
}

export function getProviderForTier(tier: AiTier): AiProvider {
  const provider = aiProviders.find((p) => p.tier === tier && p.isAvailable());
  if (!provider) {
    throw new AiProviderError(
      `No available AI provider for tier "${tier}". Check that the required API key is set.`,
      { retryable: false, rateLimited: false }
    );
  }
  return provider;
}
```

---

### Task 6: Bundle types

- [ ] Create `src/lib/ai/bundle-types.ts`:

```ts
export interface NormalizedAnalysisBundle {
  account: {
    displayName: string;
    handle: string | null;
    platform: string;
    currentFollowers: number | null;
  };
  dateRange: { from: string; to: string };
  accountTimeline: Array<{
    date: string;
    followers: number | null;
    reach: number | null;
    impressions: number | null;
  }>;
  posts: Array<{
    externalId: string;
    publishedAt: string;
    mediaType: string;
    captionPreview: string;
    hashtags: string[];
    thumbnailUrl: string | null;
    metrics: {
      impressions: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
      videoViews: number | null;
      engagementRate: number | null;
    };
  }>;
  aggregates: {
    totalPosts: number;
    avgEngagementRate: number | null;
    bestPostId: string | null;
    worstPostId: string | null;
    medianImpressions: number | null;
  };
}
```

---

### Task 7: Analysis templates

- [ ] Create `src/lib/ai/templates.ts`:

```ts
import type { NormalizedAnalysisBundle } from './bundle-types';

export function weeklyUserTemplate(input: NormalizedAnalysisBundle): string {
  const { account, dateRange, accountTimeline, posts, aggregates } = input;

  const timelineStr = accountTimeline
    .map(
      (d) =>
        `${d.date}: followers=${d.followers ?? '?'}, reach=${d.reach ?? '?'}, impressions=${d.impressions ?? '?'}`
    )
    .join('\n');

  const topPosts = [...posts]
    .sort((a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0))
    .slice(0, 10)
    .map(
      (p) =>
        `- [${p.mediaType}] ${p.publishedAt.slice(0, 10)}: ER=${p.metrics.engagementRate?.toFixed(2) ?? '?'}%, impresii=${p.metrics.impressions ?? '?'}, likes=${p.metrics.likes ?? '?'} — "${p.captionPreview}"`
    )
    .join('\n');

  return `Cont: ${account.displayName} (@${account.handle ?? 'n/a'}), platforma: ${account.platform}
Perioadă: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)}
Urmăritori curenți: ${account.currentFollowers ?? '?'}

TIMELINE CONT:
${timelineStr || 'Nicio dată'}

REZUMAT:
- Total postări: ${aggregates.totalPosts}
- ER mediu: ${aggregates.avgEngagementRate?.toFixed(2) ?? '?'}%
- Median impresii: ${aggregates.medianImpressions ?? '?'}

TOP POSTĂRI (după engagement rate):
${topPosts || 'Nicio postare în perioadă'}

Generează un rezumat săptămânal în Markdown. Include: performanță generală, tendințe observate, 3 observații rapide, o recomandare concretă. Fii direct.`;
}

export function patternsUserTemplate(input: NormalizedAnalysisBundle): string {
  const { account, dateRange, posts, aggregates } = input;

  const postsList = posts
    .map((p) => {
      const tags =
        p.hashtags.length > 0 ? ` | hashtags: ${p.hashtags.slice(0, 5).join(', ')}` : '';
      return `- [${p.mediaType}] ${p.publishedAt.slice(0, 10)}: ER=${p.metrics.engagementRate?.toFixed(2) ?? '?'}%, reach=${p.metrics.reach ?? '?'}, likes=${p.metrics.likes ?? '?'}, saves=${p.metrics.saves ?? '?'}${tags} — "${p.captionPreview}"`;
    })
    .join('\n');

  return `Cont: ${account.displayName} (@${account.handle ?? 'n/a'}), platforma: ${account.platform}
Perioadă: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)} (30 zile)
Urmăritori: ${account.currentFollowers ?? '?'}

STATISTICI AGREGATE:
- Total postări: ${aggregates.totalPosts}
- ER mediu: ${aggregates.avgEngagementRate?.toFixed(2) ?? '?'}%
- Median impresii: ${aggregates.medianImpressions ?? '?'}

TOATE POSTĂRILE:
${postsList || 'Nicio postare'}

Analizează pattern-urile de conținut. Returnează Markdown cu secțiunile: ## Ce funcționează, ## Ce nu funcționează, ## Ipoteze, ## Recomandări. Include exemple concrete.`;
}

export function topPerformersUserTemplate(input: NormalizedAnalysisBundle): string {
  const { account, dateRange, posts, aggregates } = input;

  const sorted = [...posts].sort(
    (a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0)
  );
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5).reverse();

  const fmt = (p: (typeof posts)[0], rank: string) =>
    `${rank}. [${p.mediaType}] ${p.publishedAt.slice(0, 10)}: ER=${p.metrics.engagementRate?.toFixed(2) ?? '?'}%, reach=${p.metrics.reach ?? '?'}, likes=${p.metrics.likes ?? '?'}, comments=${p.metrics.comments ?? '?'}, saves=${p.metrics.saves ?? '?'}\n   caption: "${p.captionPreview}"`;

  return `Cont: ${account.displayName} (@${account.handle ?? 'n/a'}), platforma: ${account.platform}
Perioadă: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)}
Total postări analizate: ${aggregates.totalPosts}, ER mediu: ${aggregates.avgEngagementRate?.toFixed(2) ?? '?'}%

TOP 5 POSTĂRI:
${top5.map((p, i) => fmt(p, `#${i + 1}`)).join('\n\n') || 'Insuficiente date'}

BOTTOM 5 POSTĂRI:
${bottom5.map((p, i) => fmt(p, `#${i + 1}`)).join('\n\n') || 'Insuficiente date'}

Interpretează diferența. Ce au top-performerele în comun? Ce lipsește din bottom? Răspunde în Markdown sintetic.`;
}
```

---

### Task 8: Replace ai.config.ts

- [ ] Replace entire `src/config/ai.config.ts` with:

```ts
import type { AiTier } from '@/ai/providers/types';
import type { NormalizedAnalysisBundle } from '@/lib/ai/bundle-types';
import {
  weeklyUserTemplate,
  patternsUserTemplate,
  topPerformersUserTemplate,
} from '@/lib/ai/templates';

export interface AnalysisDefinition {
  id: string;
  displayName: string;
  description: string;
  tier: AiTier;
  systemPrompt: string;
  userTemplate: (input: NormalizedAnalysisBundle) => string;
  includeImages: boolean;
  outputFormat: 'markdown';
}

export const aiConfig: {
  defaultTier: AiTier;
  maxTokens: { batch: number; deep: number };
  temperature: number;
  analyses: Record<string, AnalysisDefinition>;
} = {
  defaultTier: (process.env.AI_DEFAULT_TIER as AiTier) ?? 'batch',
  maxTokens: { batch: 2048, deep: 4096 },
  temperature: 0.6,
  analyses: {
    weekly_summary: {
      id: 'weekly_summary',
      displayName: 'Rezumat săptămânal',
      description: 'Performanță pe ultimele 7 zile cu observații rapide.',
      tier: 'batch',
      includeImages: false,
      outputFormat: 'markdown',
      systemPrompt: `Ești un analist de marketing de conținut. Vorbești în română, direct, fără politețuri. Folosești terminologie de social media în engleză când este standard (reach, impressions, engagement). Răspunzi în Markdown structurat.`,
      userTemplate: weeklyUserTemplate,
    },
    content_patterns: {
      id: 'content_patterns',
      displayName: 'Tipare de conținut',
      description:
        'Analiză de pattern-uri ce funcționează vs. ce nu, pe baza ultimelor 30 de zile.',
      tier: 'deep',
      includeImages: true,
      outputFormat: 'markdown',
      systemPrompt: `Ești un strategist senior de social media. Analizezi pattern-uri în conținut și performanță. Vorbești română, direct, cu observații concrete și acționabile. Returnezi Markdown cu secțiuni clare: Ce funcționează, Ce nu funcționează, Ipoteze, Recomandări.`,
      userTemplate: patternsUserTemplate,
    },
    top_performers: {
      id: 'top_performers',
      displayName: 'Top postări',
      description: 'Top 5 și bottom 5 postări cu interpretare a diferențelor.',
      tier: 'batch',
      includeImages: false,
      outputFormat: 'markdown',
      systemPrompt: `Ești un analist de date. Vorbești română, sintetic. Răspunzi în Markdown.`,
      userTemplate: topPerformersUserTemplate,
    },
  },
};
```

---

### Task 9: Rate limiter

- [ ] Create `src/lib/ai/rate-limiter.ts`:

```ts
import type { AiProvider } from '@/ai/providers/types';
import { AiProviderError } from '@/ai/providers/types';

interface ProviderState {
  minuteRequests: number;
  minuteResetAt: number;
  dayRequests: number;
  dayResetAt: number;
}

const state = new Map<string, ProviderState>();

function getState(id: string): ProviderState {
  if (!state.has(id)) {
    const now = Date.now();
    state.set(id, {
      minuteRequests: 0,
      minuteResetAt: now + 60_000,
      dayRequests: 0,
      dayResetAt: now + 86_400_000,
    });
  }
  return state.get(id)!;
}

export function acquireRateLimit(provider: AiProvider): void {
  const s = getState(provider.id);
  const now = Date.now();

  if (now >= s.minuteResetAt) {
    s.minuteRequests = 0;
    s.minuteResetAt = now + 60_000;
  }
  if (now >= s.dayResetAt) {
    s.dayRequests = 0;
    s.dayResetAt = now + 86_400_000;
  }

  const { requestsPerMinute, requestsPerDay } = provider.rateLimit;

  if (s.minuteRequests >= requestsPerMinute) {
    const waitSec = Math.ceil((s.minuteResetAt - now) / 1000);
    throw new AiProviderError(
      `Rate limit: ${provider.id} hit ${requestsPerMinute} RPM. Wait ${waitSec}s.`,
      { retryable: true, rateLimited: true }
    );
  }
  if (requestsPerDay !== undefined && s.dayRequests >= requestsPerDay) {
    throw new AiProviderError(
      `Daily limit: ${provider.id} hit ${requestsPerDay} req/day.`,
      { retryable: false, rateLimited: true }
    );
  }

  s.minuteRequests++;
  s.dayRequests++;
}
```

---

### Task 10: Add Supabase service client

- [ ] Open `src/lib/supabase/server.ts` and **append** (do not replace existing content) the following:

```ts
import { createClient } from '@supabase/supabase-js';

export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key);
}
```

Note: `createClient` may already be imported at the top of the file. If so, do not add a duplicate import — only add the function.

---

### Task 11: Build analysis bundle

- [ ] Create `src/lib/ai/build-bundle.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedAnalysisBundle } from './bundle-types';

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export async function buildAnalysisBundle(params: {
  accountId: string;
  userId: string;
  range: { from: string; to: string };
  supabase: SupabaseClient;
}): Promise<NormalizedAnalysisBundle> {
  const { accountId, userId, range, supabase } = params;

  // 1. Account
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('external_account_id, display_name, handle, provider_id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();
  if (accErr || !account) throw new Error(`Account not found: ${accErr?.message}`);

  // 2. Account snapshots for range
  const { data: snapshots } = await supabase
    .from('account_metrics_snapshots')
    .select('captured_at, followers, reach, impressions')
    .eq('account_id', accountId)
    .gte('captured_at', range.from)
    .lte('captured_at', range.to)
    .order('captured_at', { ascending: false });

  // Dedupe: one per day (latest captured_at per day)
  const dailyMap = new Map<string, (typeof snapshots)[0]>();
  for (const s of snapshots ?? []) {
    const day = s.captured_at.slice(0, 10);
    if (!dailyMap.has(day)) dailyMap.set(day, s);
  }
  const accountTimeline = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({
      date,
      followers: s.followers,
      reach: s.reach,
      impressions: s.impressions,
    }));

  const currentFollowers = snapshots?.[0]?.followers ?? null;

  // 3. Posts in range
  const { data: posts } = await supabase
    .from('posts')
    .select('id, external_post_id, published_at, media_type, caption, hashtags, thumbnail_url')
    .eq('account_id', accountId)
    .gte('published_at', range.from)
    .lte('published_at', range.to)
    .order('published_at', { ascending: false });

  const postList = posts ?? [];
  const postIds = postList.map((p) => p.id);

  // 4. Latest metrics per post
  const latestMetrics = new Map<
    string,
    {
      impressions: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
      video_views: number | null;
      engagement_rate: number | null;
    }
  >();

  if (postIds.length > 0) {
    const { data: allMetrics } = await supabase
      .from('post_metrics_snapshots')
      .select(
        'post_id, impressions, reach, likes, comments, shares, saves, video_views, engagement_rate'
      )
      .in('post_id', postIds)
      .order('captured_at', { ascending: false });

    for (const m of allMetrics ?? []) {
      if (!latestMetrics.has(m.post_id)) latestMetrics.set(m.post_id, m);
    }
  }

  // 5. Assemble posts
  const normalizedPosts = postList.map((p) => {
    const m = latestMetrics.get(p.id);
    return {
      externalId: p.external_post_id,
      publishedAt: p.published_at,
      mediaType: p.media_type,
      captionPreview: (p.caption ?? '').slice(0, 200),
      hashtags: p.hashtags ?? [],
      thumbnailUrl: p.thumbnail_url,
      metrics: {
        impressions: m?.impressions ?? null,
        reach: m?.reach ?? null,
        likes: m?.likes ?? null,
        comments: m?.comments ?? null,
        shares: m?.shares ?? null,
        saves: m?.saves ?? null,
        videoViews: m?.video_views ?? null,
        engagementRate: m?.engagement_rate ?? null,
      },
    };
  });

  // 6. Aggregates
  const erValues = normalizedPosts
    .map((p) => p.metrics.engagementRate)
    .filter((v): v is number => v !== null);
  const impValues = normalizedPosts
    .map((p) => p.metrics.impressions)
    .filter((v): v is number => v !== null);
  const sortedByER = [...normalizedPosts].sort(
    (a, b) => (b.metrics.engagementRate ?? -1) - (a.metrics.engagementRate ?? -1)
  );

  return {
    account: {
      displayName: account.display_name,
      handle: account.handle,
      platform: account.provider_id,
      currentFollowers,
    },
    dateRange: range,
    accountTimeline,
    posts: normalizedPosts,
    aggregates: {
      totalPosts: normalizedPosts.length,
      avgEngagementRate:
        erValues.length > 0
          ? erValues.reduce((a, b) => a + b, 0) / erValues.length
          : null,
      bestPostId: sortedByER[0]?.externalId ?? null,
      worstPostId: sortedByER[sortedByER.length - 1]?.externalId ?? null,
      medianImpressions: median(impValues),
    },
  };
}
```

---

### Task 12: Run analysis

- [ ] Create `src/lib/ai/run-analysis.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiTier, AiGenerateInput } from '@/ai/providers/types';
import { AiProviderError } from '@/ai/providers/types';
import { getProviderForTier } from '@/ai/registry';
import { aiConfig } from '@/config/ai.config';
import { buildAnalysisBundle } from './build-bundle';
import { acquireRateLimit } from './rate-limiter';

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```markdown\s*\n?/i, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
}

export async function runAnalysis(params: {
  analysisType: string;
  accountId: string;
  userId: string;
  range: { from: string; to: string };
  overrideTier?: AiTier;
  supabase: SupabaseClient;
}): Promise<{ analysisId: string; outputMarkdown: string }> {
  const { analysisType, accountId, userId, range, overrideTier, supabase } = params;

  const definition = aiConfig.analyses[analysisType];
  if (!definition) throw new Error(`Unknown analysis type: ${analysisType}`);

  const effectiveTier = overrideTier ?? definition.tier;
  const provider = getProviderForTier(effectiveTier);

  const bundle = await buildAnalysisBundle({ accountId, userId, range, supabase });

  const userMessage = definition.userTemplate(bundle);

  const imageBlocks: Array<{ type: 'image'; imageBase64: string }> = [];
  if (definition.includeImages) {
    const topPosts = bundle.posts
      .filter((p) => p.thumbnailUrl !== null)
      .sort((a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0))
      .slice(0, 10);

    const results = await Promise.allSettled(
      topPosts.map(async (p) => {
        const res = await fetch(p.thumbnailUrl!);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return {
          type: 'image' as const,
          imageBase64: Buffer.from(buf).toString('base64'),
        };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) imageBlocks.push(r.value);
    }
  }

  const generateInput: AiGenerateInput = {
    systemPrompt: definition.systemPrompt,
    messages: [
      {
        role: 'user',
        content:
          imageBlocks.length > 0
            ? [{ type: 'text', text: userMessage }, ...imageBlocks]
            : userMessage,
      },
    ],
    maxTokens: aiConfig.maxTokens[effectiveTier],
    temperature: aiConfig.temperature,
  };

  const persist = async (outputText: string, model: string, inputTokens: number, outputTokens: number, finishReason: string) => {
    const clean = stripMarkdownFences(outputText);
    const { data: row } = await supabase
      .from('ai_analyses')
      .insert({
        user_id: userId,
        account_id: accountId,
        analysis_type: analysisType,
        input_range_from: range.from,
        input_range_to: range.to,
        model,
        output_markdown: clean,
        input_summary: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          finish_reason: finishReason,
        },
      })
      .select('id')
      .single();
    return { analysisId: row!.id, outputMarkdown: clean };
  };

  if (effectiveTier === 'batch') {
    let lastError: Error | null = null;
    let delay = 2000;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        acquireRateLimit(provider);
        const output = await provider.generate(generateInput);
        return await persist(output.text, output.model, output.inputTokens, output.outputTokens, output.finishReason);
      } catch (err) {
        if (err instanceof AiProviderError && err.rateLimited && attempt < 2) {
          lastError = err;
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
    throw lastError ?? new Error('Analysis failed after 3 attempts');
  } else {
    // Deep tier: fail fast
    acquireRateLimit(provider);
    const output = await provider.generate(generateInput);
    return await persist(output.text, output.model, output.inputTokens, output.outputTokens, output.finishReason);
  }
}
```

---

### Task 13: Cron route + vercel.json

- [ ] Create `src/app/api/cron/daily-analysis/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/lib/ai/run-analysis';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, user_id')
    .eq('status', 'active');

  const now = new Date().toISOString();
  const from7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const from30d = new Date(Date.now() - 30 * 86400_000).toISOString();

  const results: Array<{
    accountId: string;
    type: string;
    status: string;
    error?: string;
  }> = [];

  for (const account of accounts ?? []) {
    for (const [type, from] of [
      ['weekly_summary', from7d],
      ['top_performers', from30d],
    ] as const) {
      try {
        await runAnalysis({
          analysisType: type,
          accountId: account.id,
          userId: account.user_id,
          range: { from, to: now },
          supabase,
        });
        results.push({ accountId: account.id, type, status: 'ok' });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.push({ accountId: account.id, type, status: 'error', error });
      }
    }
  }

  return NextResponse.json({ results, ranAt: now });
}
```

- [ ] Create `vercel.json` at repo root:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-analysis",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

### Task 14: DataRow neutral tone (code-level)

- [ ] Read the current `src/components/design-system/DataRow.tsx` and confirm the exact location of the `tone` prop type and color selection.
- [ ] Change `tone: 'positive' | 'negative'` to `tone: 'positive' | 'negative' | 'neutral'`.
- [ ] In the color mapping expression, add the neutral case. The new mapping must be: `positive → colors.accentLime`, `neutral → colors.textSecondary`, `negative → colors.accentCoral` (or whatever the negative token is). Exact change depends on the current implementation — adapt accordingly.

---

### Task 15: AnalysisMarkdown component

- [ ] Create `src/components/ai/AnalysisMarkdown.tsx`:

```tsx
'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  markdown: string;
}

export function AnalysisMarkdown({ markdown }: Props) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-inter), sans-serif',
        lineHeight: 1.6,
        color: colors.textPrimary,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 28,
                fontWeight: 700,
                color: colors.textPrimary,
                marginTop: 32,
                marginBottom: 12,
              }}
            >
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 22,
                fontWeight: 700,
                color: colors.textPrimary,
                marginTop: 24,
                marginBottom: 10,
              }}
            >
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 18,
                fontWeight: 600,
                color: colors.textPrimary,
                marginTop: 20,
                marginBottom: 8,
              }}
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 12 }}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong style={{ color: colors.accentLime, fontWeight: 600 }}>{children}</strong>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return (
                <pre
                  style={{
                    background: colors.bgCard,
                    border: `1px solid ${colors.borderDefault}`,
                    borderRadius: 4,
                    padding: '12px 16px',
                    overflowX: 'auto',
                    marginBottom: 12,
                  }}
                >
                  <code
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 13,
                      color: colors.accentLime,
                    }}
                  >
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 13,
                  color: colors.accentLime,
                  background: colors.bgCard,
                  padding: '1px 6px',
                  borderRadius: 3,
                }}
              >
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul style={{ paddingLeft: 20, marginBottom: 12, color: colors.textSecondary }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ paddingLeft: 20, marginBottom: 12, color: colors.textSecondary }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 6, fontSize: 15 }}>{children}</li>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 13,
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderBottom: `2px solid ${colors.borderDefault}`,
                color: colors.accentLime,
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.borderDefault}`,
                color: colors.textSecondary,
              }}
            >
              {children}
            </td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

---

### Task 16: Analysis run buttons

- [ ] Create `src/components/ai/AnalysisRunButton.tsx`:

```tsx
'use client';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/design-system/Button';

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function AnalysisRunButton({ onClick, loading, disabled }: Props) {
  const [cursor, setCursor] = useState('_');
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setCursor((c) => (c === '_' ? ' ' : '_')), 500);
    return () => clearInterval(iv);
  }, [loading]);

  return (
    <Button variant="primary" onClick={onClick} disabled={disabled || loading}>
      {loading ? `ANALIZEZ${cursor}` : 'RULEAZĂ'}
    </Button>
  );
}
```

- [ ] Create `src/components/ai/DeepAnalysisButton.tsx`:

```tsx
'use client';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/design-system/Button';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function DeepAnalysisButton({ onClick, loading, disabled, disabledReason }: Props) {
  const [cursor, setCursor] = useState('_');
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setCursor((c) => (c === '_' ? ' ' : '_')), 500);
    return () => clearInterval(iv);
  }, [loading]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled || loading}
        title={disabled ? disabledReason : undefined}
        style={{
          color: disabled ? colors.textMuted : colors.accentLime,
          border: `1px solid ${disabled ? colors.borderDefault : colors.accentLime}`,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? `→ ANALIZEZ DEEP${cursor}` : '→ DEEP ANALYSIS (CLAUDE)'}
      </Button>
    </div>
  );
}
```

---

### Task 17: Analyses server actions

- [ ] Create `src/app/(dashboard)/analyses/actions.ts`:

```ts
'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/lib/ai/run-analysis';
import type { AiTier } from '@/ai/providers/types';

export async function runAnalysisAction(params: {
  accountId: string;
  analysisType: string;
  rangeFrom: string;
  rangeTo: string;
  overrideTier?: AiTier;
}): Promise<{ analysisId: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const result = await runAnalysis({
    analysisType: params.analysisType,
    accountId: params.accountId,
    userId: user.id,
    range: { from: params.rangeFrom, to: params.rangeTo },
    overrideTier: params.overrideTier,
    supabase,
  });

  return { analysisId: result.analysisId };
}
```

---

### Task 18: Analyses form

- [ ] Create `src/app/(dashboard)/analyses/AnalysisForm.tsx`:

```tsx
'use client';
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Mono } from '@/components/design-system/Typography';
import { AnalysisRunButton } from '@/components/ai/AnalysisRunButton';
import { DeepAnalysisButton } from '@/components/ai/DeepAnalysisButton';
import { runAnalysisAction } from './actions';
import type { AiTier } from '@/ai/providers/types';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
}
interface AnalysisOption {
  id: string;
  displayName: string;
  description: string;
  tier: AiTier;
}

interface Props {
  accounts: Account[];
  analyses: AnalysisOption[];
  claudeAvailable: boolean;
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 13,
  background: 'transparent',
  border: `1px solid ${colors.borderDefault}`,
  borderRadius: 4,
  color: colors.textPrimary,
  padding: '8px 12px',
  width: '100%',
};

export function AnalysisForm({ accounts, analyses, claudeAvailable }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeepPending, startDeepTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [analysisType, setAnalysisType] = useState(analyses[0]?.id ?? '');
  const [rangeFrom, setRangeFrom] = useState(thirtyAgo);
  const [rangeTo, setRangeTo] = useState(today);

  const handle = (overrideTier?: AiTier) => {
    setError(null);
    const go = async () => {
      try {
        await runAnalysisAction({
          accountId,
          analysisType,
          rangeFrom,
          rangeTo,
          overrideTier,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută');
      }
    };
    if (overrideTier === 'deep') {
      startDeepTransition(go);
    } else {
      startTransition(go);
    }
  };

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '16px 0' }}>
        <Mono tone="muted">
          NICIUN CONT CONECTAT.{' '}
          <a href="/accounts" style={{ color: colors.accentLime }}>
            CONECTEAZĂ UN CONT
          </a>
        </Mono>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">CONT</Mono>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            style={inputStyle}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
                {a.handle ? ` (@${a.handle})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">TIP ANALIZĂ</Mono>
          <select
            value={analysisType}
            onChange={(e) => setAnalysisType(e.target.value)}
            style={inputStyle}
          >
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">DE LA</Mono>
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">PÂNĂ LA</Mono>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <AnalysisRunButton
          onClick={() => handle()}
          loading={isPending}
          disabled={isDeepPending}
        />
        <DeepAnalysisButton
          onClick={() => handle('deep')}
          loading={isDeepPending}
          disabled={isPending || !claudeAvailable}
          disabledReason={!claudeAvailable ? 'ANTHROPIC_API_KEY nu este setat' : undefined}
        />
      </div>

      {error && (
        <div
          style={{
            color: colors.accentCoral,
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 13,
          }}
        >
          EROARE: {error}
        </div>
      )}
    </div>
  );
}
```

---

### Task 19: Analyses list page

- [ ] Replace `src/app/(dashboard)/analyses/page.tsx` with:

```tsx
import React from 'react';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { aiConfig } from '@/config/ai.config';
import { claudeProvider } from '@/ai/providers/claude';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { DataRow } from '@/components/design-system/DataRow';
import { AnalysisForm } from './AnalysisForm';

export default async function AnalysesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: accounts }, { data: analyses }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, display_name, handle')
      .eq('user_id', user!.id)
      .eq('status', 'active'),
    supabase
      .from('ai_analyses')
      .select(
        'id, analysis_type, model, created_at, account_id, input_range_from, input_range_to'
      )
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const analysisOptions = Object.values(aiConfig.analyses).map((a) => ({
    id: a.id,
    displayName: a.displayName,
    description: a.description,
    tier: a.tier,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <Eyebrow>ANALIZE · AI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>ANALIZE AI</H2>
        </div>
      </div>

      <AnalysisForm
        accounts={accounts ?? []}
        analyses={analysisOptions}
        claudeAvailable={claudeProvider.isAvailable()}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Eyebrow>ANALIZE ANTERIOARE</Eyebrow>
        {!analyses || analyses.length === 0 ? (
          <Mono tone="muted">NICIO ANALIZĂ RULATĂ ÎNCĂ.</Mono>
        ) : (
          analyses.map((a: any) => (
            <Link key={a.id} href={`/analyses/${a.id}`} style={{ textDecoration: 'none' }}>
              <DataRow
                label={aiConfig.analyses[a.analysis_type]?.displayName ?? a.analysis_type}
                description={`${a.input_range_from?.slice(0, 10) ?? '?'} → ${a.input_range_to?.slice(0, 10) ?? '?'}`}
                status={a.model}
                tone={a.model?.includes('claude') ? 'positive' : 'neutral'}
              />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
```

---

### Task 20: Analysis detail page

- [ ] Create `src/app/(dashboard)/analyses/[id]/page.tsx`:

```tsx
import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { aiConfig } from '@/config/ai.config';
import { Eyebrow, Mono } from '@/components/design-system/Typography';
import { AnalysisMarkdown } from '@/components/ai/AnalysisMarkdown';
import { colors } from '@/themes/ai-lichiditate/tokens';

export default async function AnalysisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: analysis } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user!.id)
    .single();

  if (!analysis) notFound();

  const def = aiConfig.analyses[analysis.analysis_type];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
      <div>
        <Link
          href="/analyses"
          style={{
            color: colors.textMuted,
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 12,
            textDecoration: 'none',
          }}
        >
          ← ÎNAPOI LA ANALIZE
        </Link>
        <div style={{ marginTop: 12 }}>
          <Eyebrow tone="lime">{def?.displayName ?? analysis.analysis_type}</Eyebrow>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
          <Mono tone="muted">
            {analysis.input_range_from?.slice(0, 10)} →{' '}
            {analysis.input_range_to?.slice(0, 10)}
          </Mono>
          <Mono tone={analysis.model?.includes('claude') ? 'lime' : 'muted'}>
            {analysis.model}
          </Mono>
          <Mono tone="muted">
            {new Date(analysis.created_at).toLocaleString('ro-RO')}
          </Mono>
        </div>
      </div>

      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '24px 28px',
        }}
      >
        <AnalysisMarkdown markdown={analysis.output_markdown} />
      </div>
    </div>
  );
}
```

---

### Task 21: Dashboard page — latest analysis widget

- [ ] Open `src/app/(dashboard)/page.tsx` and read the current content.
- [ ] Add the following query after the accounts query (adjust placement to fit existing query structure):

```ts
const { data: latestAnalysis } = await supabase
  .from('ai_analyses')
  .select('id, analysis_type, output_markdown, model, created_at')
  .eq('user_id', user!.id)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

- [ ] Add a `Link` import if not already present: `import Link from 'next/link';`
- [ ] Add `import { colors } from '@/themes/ai-lichiditate/tokens';` if not already present.
- [ ] Add the following JSX block **before** the accounts grid (inside the existing layout container), only rendered when `accounts && accounts.length > 0`:

```tsx
{accounts && accounts.length > 0 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Eyebrow>AI · CEA MAI RECENTĂ ANALIZĂ</Eyebrow>
      <Link
        href="/analyses"
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          color: colors.accentLime,
          textDecoration: 'none',
        }}
      >
        VEZI TOATE →
      </Link>
    </div>
    {latestAnalysis ? (
      <Link href={`/analyses/${latestAnalysis.id}`} style={{ textDecoration: 'none' }}>
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: '16px 20px',
          }}
        >
          <Mono tone="muted">
            {new Date(latestAnalysis.created_at).toLocaleString('ro-RO')} ·{' '}
            {latestAnalysis.model}
          </Mono>
          <div
            style={{
              marginTop: 8,
              color: colors.textSecondary,
              fontFamily: 'var(--font-inter)',
              fontSize: 14,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {latestAnalysis.output_markdown.slice(0, 300)}...
          </div>
        </div>
      </Link>
    ) : (
      <Link href="/analyses" style={{ textDecoration: 'none' }}>
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: '16px 20px',
            textAlign: 'center',
          }}
        >
          <Mono tone="lime">RULEAZĂ PRIMA ANALIZĂ →</Mono>
        </div>
      </Link>
    )}
  </div>
)}
```

---

### Task 22: Settings page — AI section

- [ ] Open `src/app/(dashboard)/settings/page.tsx` and read the current content.
- [ ] Add imports at top:

```ts
import { aiProviders } from '@/ai/registry';
import { aiConfig } from '@/config/ai.config';
```

- [ ] Append this JSX block after the existing settings cards:

```tsx
<div>
  <div style={{ marginTop: 32, marginBottom: 16 }}>
    <H2>AI</H2>
  </div>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {aiProviders.map((provider) => (
      <div
        key={provider.id}
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <Mono>{provider.displayName}</Mono>
          <div style={{ marginTop: 4 }}>
            <Mono tone="muted">
              {provider.tier.toUpperCase()} · {provider.rateLimit.requestsPerMinute} RPM
              {provider.rateLimit.requestsPerDay
                ? ` · ${provider.rateLimit.requestsPerDay}/zi`
                : ''}
            </Mono>
          </div>
        </div>
        <Mono tone={provider.isAvailable() ? 'lime' : 'coral'}>
          {provider.isAvailable() ? 'DISPONIBIL' : 'LIPSĂ API KEY'}
        </Mono>
      </div>
    ))}
    <div
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: 6,
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <Mono tone="muted">TIER IMPLICIT</Mono>
      <Mono tone="lime">{aiConfig.defaultTier.toUpperCase()}</Mono>
    </div>
  </div>
</div>
```

Note: If `colors` and `H2`/`Mono` are not yet imported in settings/page.tsx, add those imports.

---

### Task 23: Phase A build + commit

- [ ] Run: `pnpm build`
- [ ] Run: `pnpm lint`
- [ ] Fix all TypeScript and lint errors before proceeding.
- [ ] Commit with message: `feat: AI provider layer — Gemini + Claude adapters, three analysis types, cron, analyses pages`

---

## PHASE A CHECKPOINT — STOP

**STOP. Run the verification checklist below. Only proceed to Phase B after ALL Phase A checks pass. Commit Phase A before starting Phase B.**

### Phase A Verification Checklist

- [ ] `pnpm build` exits with code 0 — no TypeScript errors
- [ ] `pnpm lint` exits with code 0 — no lint errors
- [ ] `src/ai/providers/types.ts` exists with `AiProvider` interface and `AiProviderError` class
- [ ] `src/ai/providers/gemini/index.ts` exports `geminiProvider` with `tier: 'batch'`
- [ ] `src/ai/providers/claude/index.ts` exports `claudeProvider` with `tier: 'deep'` and model fallback logic
- [ ] `src/ai/registry.ts` exports `getProviderForTier` — throws `AiProviderError` if no provider available
- [ ] `src/lib/ai/bundle-types.ts` exports `NormalizedAnalysisBundle`
- [ ] `src/lib/ai/templates.ts` exports all three template functions: `weeklyUserTemplate`, `patternsUserTemplate`, `topPerformersUserTemplate`
- [ ] `src/lib/ai/build-bundle.ts` exports `buildAnalysisBundle` — queries accounts, snapshots, posts, metrics from Supabase
- [ ] `src/lib/ai/run-analysis.ts` exports `runAnalysis` — batch tier has 3-attempt retry, deep tier fails fast
- [ ] `src/lib/ai/rate-limiter.ts` exports `acquireRateLimit` — throws on RPM/daily limit exceeded
- [ ] `src/lib/supabase/server.ts` now exports `createSupabaseServiceClient()` alongside existing functions
- [ ] `src/config/ai.config.ts` has `analyses` with keys `weekly_summary`, `content_patterns`, `top_performers`
- [ ] `src/app/api/cron/daily-analysis/route.ts` exists — returns 401 if `x-cron-secret` header missing
- [ ] `vercel.json` exists at repo root with cron schedule
- [ ] `src/components/design-system/DataRow.tsx` accepts `tone: 'positive' | 'negative' | 'neutral'` — neutral maps to `colors.textSecondary`
- [ ] `src/components/ai/AnalysisMarkdown.tsx` exists — renders markdown with design tokens
- [ ] `src/components/ai/AnalysisRunButton.tsx` and `DeepAnalysisButton.tsx` exist
- [ ] `src/app/(dashboard)/analyses/page.tsx` renders `AnalysisForm` and list of past analyses
- [ ] `src/app/(dashboard)/analyses/[id]/page.tsx` renders full analysis with `AnalysisMarkdown`
- [ ] `src/app/(dashboard)/analyses/actions.ts` has `runAnalysisAction` as a `'use server'` action
- [ ] Dashboard page has latest-analysis widget
- [ ] Settings page shows AI provider availability
- [ ] `.env.example` has `GOOGLE_AI_API_KEY`, `AI_DEFAULT_TIER`, `CRON_SECRET`, `NEXT_PUBLIC_ENABLE_MOCK_PROVIDER`

**After all checks pass:** `git add` the Phase A files and commit.

---

## PHASE B: Meta Instagram Provider

### Task 24: Update env for Meta

- [ ] Add to the Zod schema in `src/lib/env.ts` (inside the `z.object({...})` and the `envSchema.parse({...})`):

```ts
// In z.object({...}):
META_APP_ID: z.string().min(1).optional(),
META_APP_SECRET: z.string().min(1).optional(),
META_GRAPH_API_VERSION: z.string().optional(),
META_REDIRECT_URI: z.string().url().optional(),

// In envSchema.parse({...}):
META_APP_ID: process.env.META_APP_ID,
META_APP_SECRET: process.env.META_APP_SECRET,
META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
META_REDIRECT_URI: process.env.META_REDIRECT_URI,
```

- [ ] Append to `.env.example`:

```
# Meta (Phase B)
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0
META_REDIRECT_URI=http://localhost:3000/auth/callback/meta
```

---

### Task 25: Meta types

- [ ] Create `src/providers/meta-instagram/types.ts`:

```ts
export interface MetaTokenBundle {
  userAccessToken: string;
  pageAccessToken: string;
  pageId: string;
  expiresAt: string;
}

export interface GraphPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

export interface GraphIgAccount {
  id: string;
  name: string;
  username: string;
  profile_picture_url: string | null;
  followers_count: number;
  follows_count: number;
  media_count: number;
}

export interface GraphMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'REELS' | 'FEED' | 'STORY';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

export interface GraphInsightValue {
  value: number;
  end_time: string;
}

export interface GraphInsight {
  id: string;
  name: string;
  period: string;
  values: GraphInsightValue[];
}

export interface GraphError {
  message: string;
  type: string;
  code: number;
  fbtrace_id?: string;
}

export interface GraphErrorResponse {
  error: GraphError;
}
```

---

### Task 26: Insights config

- [ ] Create `src/providers/meta-instagram/insights-config.ts`:

```ts
export const POST_METRICS_BY_TYPE: Record<string, string[]> = {
  IMAGE:    ['impressions', 'reach', 'saved', 'likes', 'comments', 'shares'],
  VIDEO:    ['impressions', 'reach', 'saved', 'likes', 'comments', 'shares', 'video_views'],
  REEL:     ['reach', 'saved', 'likes', 'comments', 'shares', 'plays', 'total_interactions'],
  CAROUSEL: ['impressions', 'reach', 'saved', 'likes', 'comments', 'shares'],
  STORY:    ['impressions', 'reach', 'replies', 'taps_forward', 'taps_back', 'exits'],
};

export const ACCOUNT_METRICS = ['impressions', 'reach', 'profile_views'];
```

---

### Task 27: Graph API client

- [ ] Create `src/providers/meta-instagram/graph-client.ts`:

```ts
import type { GraphErrorResponse } from './types';

const BASE = (version: string) => `https://graph.facebook.com/${version}`;

export class GraphApiError extends Error {
  code: number;
  retryable: boolean;
  tokenInvalid: boolean;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'GraphApiError';
    this.code = code;
    this.retryable = code === 4 || code === 17;
    this.tokenInvalid = code === 190;
  }
}

async function request<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  version = process.env.META_GRAPH_API_VERSION ?? 'v21.0'
): Promise<T> {
  const url = new URL(`${BASE(version)}${path}`);
  url.searchParams.set('access_token', accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = (await res.json()) as T | GraphErrorResponse;

  if ('error' in (json as object)) {
    const err = (json as GraphErrorResponse).error;
    throw new GraphApiError(
      `Meta Graph API error: ${err.message} (code ${err.code})`,
      err.code
    );
  }

  return json as T;
}

interface PaginatedResponse<T> {
  data: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export async function requestPaginated<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  maxItems = 500
): Promise<T[]> {
  const items: T[] = [];
  const version = process.env.META_GRAPH_API_VERSION ?? 'v21.0';
  let nextUrl: string | null = null;

  const first = await request<PaginatedResponse<T>>(path, params, accessToken, version);
  items.push(...first.data);
  nextUrl = first.paging?.next ?? null;

  while (nextUrl && items.length < maxItems) {
    const res = await fetch(nextUrl);
    const page = (await res.json()) as PaginatedResponse<T>;
    if ('error' in (page as object)) break;
    items.push(...page.data);
    nextUrl = page.paging?.next ?? null;
  }

  return items.slice(0, maxItems);
}

export { request as graphRequest };
```

---

### Task 28: Meta OAuth helpers

- [ ] Create `src/providers/meta-instagram/oauth.ts`:

```ts
import type { ProviderToken } from '@/lib/normalized-types';
import type { MetaTokenBundle } from './types';
import { graphRequest } from './graph-client';

const APP_ID = () => process.env.META_APP_ID!;
const APP_SECRET = () => process.env.META_APP_SECRET!;
const GRAPH_VERSION = () => process.env.META_GRAPH_API_VERSION ?? 'v21.0';
const BASE = () => `https://graph.facebook.com/${GRAPH_VERSION()}`;

const SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

export function buildAuthUrl(params: { state: string; redirectUri: string }): string {
  const url = new URL('https://www.facebook.com/dialog/oauth');
  url.searchParams.set('client_id', APP_ID());
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', params.state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function exchangeShortToLong(
  shortToken: string
): Promise<{ token: string; expiresIn: number }> {
  const url = new URL(`${BASE()}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', APP_ID());
  url.searchParams.set('client_secret', APP_SECRET());
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString());
  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    error?: unknown;
  };
  if (json.error) throw new Error(`Token exchange failed: ${JSON.stringify(json.error)}`);
  return { token: json.access_token, expiresIn: json.expires_in ?? 5184000 };
}

async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const pages = await graphRequest<{ data: Array<{ id: string; access_token: string }> }>(
    '/me/accounts',
    { fields: 'id,access_token' },
    userToken
  );
  const page = pages.data.find((p) => p.id === pageId);
  if (!page) throw new Error(`Page ${pageId} not found in user accounts`);
  return page.access_token;
}

export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
}): Promise<{ userToken: string; expiresAt: string }> {
  // Step 1: short-lived token
  const shortUrl = new URL(`${BASE()}/oauth/access_token`);
  shortUrl.searchParams.set('client_id', APP_ID());
  shortUrl.searchParams.set('client_secret', APP_SECRET());
  shortUrl.searchParams.set('redirect_uri', params.redirectUri);
  shortUrl.searchParams.set('code', params.code);

  const shortRes = await fetch(shortUrl.toString());
  const shortJson = (await shortRes.json()) as {
    access_token: string;
    error?: unknown;
  };
  if (shortJson.error)
    throw new Error(`Code exchange failed: ${JSON.stringify(shortJson.error)}`);

  // Step 2: long-lived
  const { token: userToken, expiresIn } = await exchangeShortToLong(shortJson.access_token);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { userToken, expiresAt };
}

export async function buildTokenForPage(
  userToken: string,
  pageId: string,
  expiresAt: string
): Promise<ProviderToken> {
  const pageToken = await getPageToken(userToken, pageId);
  const bundle: MetaTokenBundle = {
    userAccessToken: userToken,
    pageAccessToken: pageToken,
    pageId,
    expiresAt,
  };
  return {
    accessToken: pageToken,
    refreshToken: userToken,
    expiresAt,
    raw: bundle,
  };
}

export async function refreshUserToken(
  userToken: string
): Promise<{ token: string; expiresAt: string }> {
  const { token, expiresIn } = await exchangeShortToLong(userToken);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { token, expiresAt };
}
```

---

### Task 29: Meta mappers

- [ ] Create `src/providers/meta-instagram/mappers.ts`:

```ts
import type {
  NormalizedAccount,
  NormalizedPost,
  NormalizedPostMetrics,
  NormalizedAccountMetrics,
} from '@/lib/normalized-types';
import type { GraphIgAccount, GraphMedia, GraphInsight } from './types';

const HASHTAG_RE = /#[\p{L}0-9_]+/gu;
const MENTION_RE = /@[\p{L}0-9_.]+/gu;

function mediaType(item: GraphMedia): NormalizedPost['mediaType'] {
  if (item.media_product_type === 'STORY') return 'story';
  if (item.media_product_type === 'REELS' || item.media_type === 'VIDEO') return 'reel';
  if (item.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (item.media_type === 'VIDEO') return 'video';
  return 'image';
}

export function mapAccount(
  ig: GraphIgAccount,
  providerId = 'meta-instagram'
): NormalizedAccount {
  return {
    externalId: ig.id,
    providerId,
    platform: 'meta',
    displayName: ig.name,
    handle: ig.username,
    avatarUrl: ig.profile_picture_url,
    followerCount: ig.followers_count,
    followingCount: ig.follows_count,
    postCount: ig.media_count,
    raw: ig as unknown as Record<string, unknown>,
  };
}

export function mapPost(item: GraphMedia, accountExternalId: string): NormalizedPost {
  const caption = item.caption ?? null;
  return {
    externalId: item.id,
    accountExternalId,
    publishedAt: item.timestamp,
    mediaType: mediaType(item),
    caption,
    mediaUrl: item.media_url ?? null,
    thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
    permalink: item.permalink,
    hashtags: caption ? (caption.match(HASHTAG_RE) ?? []) : [],
    mentions: caption ? (caption.match(MENTION_RE) ?? []) : [],
    raw: item as unknown as Record<string, unknown>,
  };
}

export function mapPostMetrics(
  postExternalId: string,
  insightValues: Record<string, number | null>,
  _mediaType: string
): NormalizedPostMetrics {
  const likes = insightValues['likes'] ?? null;
  const comments = insightValues['comments'] ?? null;
  const shares = insightValues['shares'] ?? null;
  const saves = insightValues['saved'] ?? null;
  const reach = insightValues['reach'] ?? null;

  let engagementRate: number | null = null;
  if (reach && reach > 0) {
    const eng = (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0);
    engagementRate = (eng / reach) * 100;
  }

  return {
    postExternalId,
    capturedAt: new Date().toISOString(),
    impressions: insightValues['impressions'] ?? null,
    reach,
    likes,
    comments,
    shares,
    saves,
    videoViews: insightValues['video_views'] ?? insightValues['plays'] ?? null,
    watchTimeSeconds: null,
    engagementRate,
    raw: insightValues as unknown as Record<string, unknown>,
  };
}

export function mapAccountMetrics(
  accountExternalId: string,
  insights: GraphInsight[],
  currentFollowers: number | null
): NormalizedAccountMetrics {
  const latest = (name: string): number | null => {
    const insight = insights.find((i) => i.name === name);
    const vals = insight?.values ?? [];
    return vals.length > 0 ? vals[vals.length - 1].value : null;
  };

  return {
    accountExternalId,
    capturedAt: new Date().toISOString(),
    followers: currentFollowers,
    reach: latest('reach'),
    impressions: latest('impressions'),
    profileViews: latest('profile_views'),
    websiteClicks: null,
    raw: { insights },
  };
}
```

---

### Task 30: Meta provider index

- [ ] Create `src/providers/meta-instagram/index.ts`:

```ts
import type { SocialProvider, OAuthConfig } from '@/providers/types';
import type {
  ProviderToken,
  NormalizedAccount,
  NormalizedAccountMetrics,
  NormalizedPost,
  NormalizedPostMetrics,
  DateRange,
} from '@/lib/normalized-types';
import type { MetaTokenBundle } from './types';
import {
  buildAuthUrl,
  exchangeCodeForToken,
  buildTokenForPage,
  refreshUserToken,
} from './oauth';
import { graphRequest, requestPaginated } from './graph-client';
import { mapAccount, mapPost, mapPostMetrics, mapAccountMetrics } from './mappers';
import { POST_METRICS_BY_TYPE, ACCOUNT_METRICS } from './insights-config';
import type { GraphPage, GraphIgAccount, GraphMedia, GraphInsight } from './types';

const oauth: OAuthConfig = {
  authUrl: 'https://www.facebook.com/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/oauth/access_token',
  scopes: [
    'instagram_basic',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ],
  redirectPath: '/auth/callback/meta',
  requiresPkce: false,
};

function getBundle(token: ProviderToken): MetaTokenBundle {
  return token.raw as MetaTokenBundle;
}

export const metaInstagramProvider: SocialProvider = {
  id: 'meta-instagram',
  platform: 'meta',
  displayName: 'Instagram',
  description:
    'Conectează contul tău Instagram Business sau Creator via Meta Graph API.',
  iconUrl: null,
  oauth,

  buildAuthUrl(params: { state: string; redirectUri: string }): string {
    return buildAuthUrl(params);
  },

  async exchangeCodeForToken(params: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderToken> {
    // Returns partial token — caller calls listAccounts then buildTokenForPage
    const { userToken, expiresAt } = await exchangeCodeForToken(params);
    return {
      accessToken: userToken,
      expiresAt,
      raw: { userToken, pendingPageSelection: true },
    };
  },

  async refreshToken(token: ProviderToken): Promise<ProviderToken> {
    const bundle = getBundle(token);
    const { token: newUserToken, expiresAt } = await refreshUserToken(bundle.userAccessToken);
    return buildTokenForPage(newUserToken, bundle.pageId, expiresAt);
  },

  isTokenExpired(token: ProviderToken): boolean {
    if (!token.expiresAt) return false;
    const expiresAt = new Date(token.expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() >= expiresAt - sevenDays;
  },

  async listAccounts(token: ProviderToken): Promise<NormalizedAccount[]> {
    const userToken = (token.raw as { userToken: string }).userToken ?? token.accessToken;
    const pages = await graphRequest<{ data: GraphPage[] }>(
      '/me/accounts',
      { fields: 'id,name,access_token,instagram_business_account' },
      userToken
    );

    const accounts: NormalizedAccount[] = [];
    for (const page of pages.data) {
      if (!page.instagram_business_account?.id) continue;
      const igId = page.instagram_business_account.id;
      const ig = await graphRequest<GraphIgAccount>(
        `/${igId}`,
        {
          fields:
            'id,name,username,profile_picture_url,followers_count,follows_count,media_count',
        },
        page.access_token
      );
      accounts.push({
        ...mapAccount(ig),
        raw: { ...ig, pageId: page.id } as unknown as Record<string, unknown>,
      });
    }
    return accounts;
  },

  async fetchAccountMetrics(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedAccountMetrics> {
    const bundle = getBundle(token);
    const since = Math.floor(new Date(range.from).getTime() / 1000).toString();
    const until = Math.floor(new Date(range.to).getTime() / 1000).toString();

    const [insightsRes, accountRes] = await Promise.all([
      graphRequest<{ data: GraphInsight[] }>(
        `/${accountExternalId}/insights`,
        { metric: ACCOUNT_METRICS.join(','), period: 'day', since, until },
        bundle.pageAccessToken
      ).catch(() => ({ data: [] })),
      graphRequest<{ followers_count: number }>(
        `/${accountExternalId}`,
        { fields: 'followers_count' },
        bundle.pageAccessToken
      ).catch(() => ({ followers_count: null })),
    ]);

    return mapAccountMetrics(
      accountExternalId,
      insightsRes.data,
      (accountRes as { followers_count: number | null }).followers_count ?? null
    );
  },

  async listPosts(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedPost[]> {
    const bundle = getBundle(token);
    const all = await requestPaginated<GraphMedia>(
      `/${accountExternalId}/media`,
      {
        fields:
          'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp',
      },
      bundle.pageAccessToken
    );

    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();
    return all
      .filter((m) => {
        const t = new Date(m.timestamp).getTime();
        return t >= from && t <= to;
      })
      .map((m) => mapPost(m, accountExternalId));
  },

  async fetchPostMetrics(
    token: ProviderToken,
    postExternalId: string
  ): Promise<NormalizedPostMetrics> {
    const bundle = getBundle(token);

    // Determine media type first
    const mediaInfo = await graphRequest<{
      media_type: string;
      media_product_type?: string;
    }>(
      `/${postExternalId}`,
      { fields: 'media_type,media_product_type' },
      bundle.pageAccessToken
    );

    const typeKey =
      mediaInfo.media_product_type === 'REELS'
        ? 'REEL'
        : mediaInfo.media_product_type === 'STORY'
        ? 'STORY'
        : mediaInfo.media_type === 'CAROUSEL_ALBUM'
        ? 'CAROUSEL'
        : mediaInfo.media_type === 'VIDEO'
        ? 'VIDEO'
        : 'IMAGE';

    const metricsList = POST_METRICS_BY_TYPE[typeKey] ?? POST_METRICS_BY_TYPE['IMAGE'];

    // Fetch metrics — try bulk first, fall back to individual
    const values: Record<string, number | null> = {};
    try {
      const res = await graphRequest<{
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(
        `/${postExternalId}/insights`,
        { metric: metricsList.join(',') },
        bundle.pageAccessToken
      );
      for (const insight of res.data) {
        values[insight.name] = insight.values[0]?.value ?? null;
      }
    } catch {
      // Partial failure — try metrics individually
      for (const metric of metricsList) {
        try {
          const res = await graphRequest<{
            data: Array<{ name: string; values: Array<{ value: number }> }>;
          }>(
            `/${postExternalId}/insights`,
            { metric },
            bundle.pageAccessToken
          );
          values[metric] = res.data[0]?.values[0]?.value ?? null;
        } catch {
          values[metric] = null;
        }
      }
    }

    return mapPostMetrics(postExternalId, values, typeKey);
  },
};
```

---

### Task 31: Meta OAuth callback route

- [ ] Create `src/app/(auth)/auth/callback/meta/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { metaInstagramProvider } from '@/providers/meta-instagram';
import { buildTokenForPage } from '@/providers/meta-instagram/oauth';
import { encryptJson } from '@/lib/crypto';

const REDIRECT_URI = () =>
  process.env.META_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/meta`;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(`${origin}/accounts?error=meta_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/accounts?error=meta_no_code`);
  }

  // CSRF: verify state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('meta_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${origin}/accounts?error=meta_csrf`);
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${origin}/login`);

    // Exchange code → user access token
    const partialToken = await metaInstagramProvider.exchangeCodeForToken({
      code,
      redirectUri: REDIRECT_URI(),
    });
    const userToken = (partialToken.raw as { userToken: string }).userToken;

    // List IG accounts
    const igAccounts = await metaInstagramProvider.listAccounts(partialToken);

    if (igAccounts.length === 0) {
      return NextResponse.redirect(`${origin}/accounts?error=meta_no_ig_account`);
    }

    if (igAccounts.length === 1) {
      const ig = igAccounts[0];
      const pageId = (ig.raw as { pageId: string }).pageId;
      const token = await buildTokenForPage(
        userToken,
        pageId,
        partialToken.expiresAt ??
          new Date(Date.now() + 5_184_000_000).toISOString()
      );

      await supabase.from('accounts').upsert(
        {
          user_id: user.id,
          provider_id: 'meta-instagram',
          external_account_id: ig.externalId,
          display_name: ig.displayName,
          handle: ig.handle,
          avatar_url: ig.avatarUrl,
          encrypted_tokens: encryptJson(token),
          status: 'active',
        },
        { onConflict: 'user_id,provider_id,external_account_id' }
      );

      const response = NextResponse.redirect(`${origin}/accounts`);
      response.cookies.delete('meta_oauth_state');
      return response;
    }

    // Multiple accounts — store options in cookie and redirect to select page
    const selectData = igAccounts.map((a) => ({
      externalId: a.externalId,
      displayName: a.displayName,
      handle: a.handle,
      pageId: (a.raw as { pageId: string }).pageId,
    }));

    const response = NextResponse.redirect(`${origin}/accounts/select`);
    response.cookies.set('meta_pending_accounts', JSON.stringify(selectData), {
      httpOnly: true,
      maxAge: 600,
    });
    response.cookies.set('meta_pending_user_token', userToken, {
      httpOnly: true,
      maxAge: 600,
    });
    response.cookies.set(
      'meta_pending_expires',
      partialToken.expiresAt ?? '',
      { httpOnly: true, maxAge: 600 }
    );
    response.cookies.delete('meta_oauth_state');
    return response;
  } catch (err) {
    console.error('[meta callback]', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/accounts?error=meta_callback_failed`);
  }
}
```

- [ ] Open `src/app/(dashboard)/accounts/actions.ts` and append:

```ts
import { metaInstagramProvider } from '@/providers/meta-instagram';

export async function getMetaAuthUrl(): Promise<string> {
  const { cookies } = await import('next/headers');
  const { randomBytes } = await import('crypto');
  const state = randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('meta_oauth_state', state, { httpOnly: true, maxAge: 600 });
  return metaInstagramProvider.buildAuthUrl({
    state,
    redirectUri:
      process.env.META_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/meta`,
  });
}
```

Note: If `metaInstagramProvider` is already imported at top of actions.ts, do not duplicate the import — only add the function.

---

### Task 32: Account select page

- [ ] Create `src/app/(dashboard)/accounts/select/page.tsx`:

```tsx
import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildTokenForPage } from '@/providers/meta-instagram/oauth';
import { encryptJson } from '@/lib/crypto';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface AccountOption {
  externalId: string;
  displayName: string;
  handle: string | null;
  pageId: string;
}

async function selectAccount(formData: FormData) {
  'use server';
  const externalId = formData.get('externalId') as string;
  const cookieStore = await cookies();
  const accountsRaw = cookieStore.get('meta_pending_accounts')?.value;
  const userToken = cookieStore.get('meta_pending_user_token')?.value;
  const expiresAt = cookieStore.get('meta_pending_expires')?.value;

  if (!accountsRaw || !userToken || !externalId)
    redirect('/accounts?error=meta_select_failed');

  const accounts: AccountOption[] = JSON.parse(accountsRaw);
  const chosen = accounts.find((a) => a.externalId === externalId);
  if (!chosen) redirect('/accounts?error=meta_select_invalid');

  const token = await buildTokenForPage(
    userToken,
    chosen.pageId,
    expiresAt ?? new Date(Date.now() + 5_184_000_000).toISOString()
  );

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await supabase.from('accounts').upsert(
    {
      user_id: user.id,
      provider_id: 'meta-instagram',
      external_account_id: chosen.externalId,
      display_name: chosen.displayName,
      handle: chosen.handle,
      avatar_url: null,
      encrypted_tokens: encryptJson(token),
      status: 'active',
    },
    { onConflict: 'user_id,provider_id,external_account_id' }
  );

  cookieStore.delete('meta_pending_accounts');
  cookieStore.delete('meta_pending_user_token');
  cookieStore.delete('meta_pending_expires');

  redirect('/accounts');
}

export default async function AccountSelectPage() {
  const cookieStore = await cookies();
  const accountsRaw = cookieStore.get('meta_pending_accounts')?.value;
  if (!accountsRaw) redirect('/accounts');

  const accounts: AccountOption[] = JSON.parse(accountsRaw);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 500 }}>
      <div>
        <Eyebrow>META · SELECTEAZĂ CONT</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>SELECTEAZĂ CONTUL INSTAGRAM</H2>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map((a) => (
          <form key={a.externalId} action={selectAccount}>
            <input type="hidden" name="externalId" value={a.externalId} />
            <button
              type="submit"
              style={{
                width: '100%',
                background: colors.bgCard,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 6,
                padding: '16px 20px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <Mono>{a.displayName}</Mono>
                {a.handle && (
                  <div style={{ marginTop: 4 }}>
                    <Mono tone="muted">@{a.handle}</Mono>
                  </div>
                )}
              </div>
              <Mono tone="lime">SELECTEAZĂ →</Mono>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
```

---

### Task 33: Update providers config

- [ ] Replace `src/config/providers.config.ts` with:

```ts
import { mockProvider } from '@/providers/mock';
import { metaInstagramProvider } from '@/providers/meta-instagram';
import type { SocialProvider } from '@/providers/types';

const providers: SocialProvider[] = [metaInstagramProvider];

if (process.env.NEXT_PUBLIC_ENABLE_MOCK_PROVIDER !== 'false') {
  providers.push(mockProvider);
}

export const registeredProviders = providers;

const registry = new Map(providers.map((p) => [p.id, p]));

export function getProvider(id: string): SocialProvider | undefined {
  return registry.get(id);
}

export function listProviders(): SocialProvider[] {
  return providers;
}
```

Note: Check if `src/providers/registry.ts` re-exports from `providers.config.ts`. If so, no changes needed there.

---

### Task 34: Meta app setup documentation

- [ ] Create `docs/meta-app-setup.md` with the following content:

```markdown
# Meta App Setup Guide

## 1. Create a Meta App

1. Go to https://developers.facebook.com/apps/
2. Click **Create App**
3. Select **Business** type
4. Fill in app name (e.g. "ai-lichiditate") and contact email
5. Click **Create App**

## 2. Add Products

In your app dashboard, add these products:
- **Facebook Login** — for OAuth flow
- **Instagram Graph API** — for Instagram data

## 3. Configure Facebook Login

Under Facebook Login → Settings:
- Add to **Valid OAuth Redirect URIs**: `http://localhost:3000/auth/callback/meta` (dev) and your production URL
- Enable **Client OAuth Login** and **Web OAuth Login**

## 4. Configure Permissions

Under App Review → Permissions and Features, request:
- `instagram_basic`
- `instagram_manage_insights`
- `pages_show_list`
- `pages_read_engagement`
- `business_management`

**Development mode:** All permissions work without App Review for app admins/testers. You can add test users under Roles → Test Users.

**Production:** You must submit for App Review to use these permissions with accounts that are not app admins. The review process requires a privacy policy URL, use case descriptions, and screen recordings.

## 5. Get Your App Credentials

Under App Settings → Basic:
- Copy **App ID** → `META_APP_ID`
- Copy **App Secret** (click Show) → `META_APP_SECRET`

## 6. Set Environment Variables

```env
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_GRAPH_API_VERSION=v21.0
META_REDIRECT_URI=http://localhost:3000/auth/callback/meta
```

## 7. Requirements for Testing

Your Instagram account must be:
- A **Business** or **Creator** account (not Personal)
- Connected to a **Facebook Page**
- Added as an admin/tester to your Meta app

## 8. API Version

This integration uses Graph API `v21.0`. Meta deprecates old versions ~2 years after release. Check https://developers.facebook.com/docs/graph-api/changelog for the latest version and update `META_GRAPH_API_VERSION` accordingly.
```

---

### Task 35: Phase B build + commit

- [ ] Run: `pnpm build`
- [ ] Run: `pnpm lint`
- [ ] Fix all TypeScript and lint errors.
- [ ] Commit with message: `feat: Meta Instagram social provider — OAuth, Graph API client, mappers, callback, account select`

---

## PHASE B VERIFICATION CHECKLIST

- [ ] `pnpm build` exits with code 0
- [ ] `pnpm lint` exits with code 0
- [ ] `src/providers/meta-instagram/types.ts` exports `MetaTokenBundle`, `GraphPage`, `GraphIgAccount`, `GraphMedia`, `GraphInsight`
- [ ] `src/providers/meta-instagram/insights-config.ts` exports `POST_METRICS_BY_TYPE` and `ACCOUNT_METRICS`
- [ ] `src/providers/meta-instagram/graph-client.ts` exports `graphRequest`, `requestPaginated`, `GraphApiError`
- [ ] `src/providers/meta-instagram/oauth.ts` exports `buildAuthUrl`, `exchangeCodeForToken`, `buildTokenForPage`, `refreshUserToken`
- [ ] `src/providers/meta-instagram/mappers.ts` exports all four mapper functions
- [ ] `src/providers/meta-instagram/index.ts` exports `metaInstagramProvider` that satisfies `SocialProvider` interface
- [ ] `src/app/(auth)/auth/callback/meta/route.ts` exists — handles single and multiple IG account scenarios
- [ ] `src/app/(dashboard)/accounts/select/page.tsx` exists — server action calls `buildTokenForPage` then upserts to `accounts`
- [ ] `src/app/(dashboard)/accounts/actions.ts` has `getMetaAuthUrl` function
- [ ] `src/config/providers.config.ts` lists `metaInstagramProvider` first; mock is conditional on `NEXT_PUBLIC_ENABLE_MOCK_PROVIDER !== 'false'`
- [ ] `docs/meta-app-setup.md` exists with steps for creating Meta app, configuring permissions, and App Review note
- [ ] `src/lib/env.ts` includes `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `META_REDIRECT_URI` (all optional)

---

## File Index

### New files created in Phase A

| File | Purpose |
|------|---------|
| `src/ai/providers/types.ts` | AiProvider interface, AiProviderError, AiTier |
| `src/ai/providers/gemini/index.ts` | Gemini 2.5 Flash adapter |
| `src/ai/providers/claude/index.ts` | Claude Opus adapter with model fallback |
| `src/ai/registry.ts` | Provider registry, getProviderForTier |
| `src/lib/ai/bundle-types.ts` | NormalizedAnalysisBundle type |
| `src/lib/ai/templates.ts` | Three prompt template functions |
| `src/lib/ai/build-bundle.ts` | Supabase query → NormalizedAnalysisBundle |
| `src/lib/ai/run-analysis.ts` | Orchestrates bundle + provider + DB persist |
| `src/lib/ai/rate-limiter.ts` | In-memory RPM/daily rate limiter |
| `src/app/api/cron/daily-analysis/route.ts` | Cron endpoint for automated analysis |
| `vercel.json` | Vercel cron schedule |
| `src/components/ai/AnalysisMarkdown.tsx` | Markdown renderer with design tokens |
| `src/components/ai/AnalysisRunButton.tsx` | Batch tier run button |
| `src/components/ai/DeepAnalysisButton.tsx` | Deep tier run button (Claude) |
| `src/app/(dashboard)/analyses/actions.ts` | runAnalysisAction server action |
| `src/app/(dashboard)/analyses/AnalysisForm.tsx` | Client form for running analyses |
| `src/app/(dashboard)/analyses/[id]/page.tsx` | Analysis detail page |

### Modified files in Phase A

| File | Change |
|------|--------|
| `src/lib/env.ts` | Add GOOGLE_AI_API_KEY, AI_DEFAULT_TIER, CRON_SECRET, NEXT_PUBLIC_ENABLE_MOCK_PROVIDER |
| `src/config/ai.config.ts` | Full replacement with three analysis definitions |
| `src/lib/supabase/server.ts` | Append createSupabaseServiceClient |
| `src/components/design-system/DataRow.tsx` | Add 'neutral' tone |
| `src/app/(dashboard)/analyses/page.tsx` | Full replacement with form + list |
| `src/app/(dashboard)/page.tsx` | Add latestAnalysis query + widget |
| `src/app/(dashboard)/settings/page.tsx` | Add AI providers section |
| `.env.example` | Add AI and cron vars |

### New files created in Phase B

| File | Purpose |
|------|---------|
| `src/providers/meta-instagram/types.ts` | Meta/Graph API types |
| `src/providers/meta-instagram/insights-config.ts` | Metrics lists by media type |
| `src/providers/meta-instagram/graph-client.ts` | fetch wrapper + pagination |
| `src/providers/meta-instagram/oauth.ts` | OAuth flow, token exchange, refresh |
| `src/providers/meta-instagram/mappers.ts` | Graph → Normalized type mappers |
| `src/providers/meta-instagram/index.ts` | SocialProvider implementation |
| `src/app/(auth)/auth/callback/meta/route.ts` | OAuth callback handler |
| `src/app/(dashboard)/accounts/select/page.tsx` | Multi-account selection page |
| `docs/meta-app-setup.md` | Meta developer app setup guide |

### Modified files in Phase B

| File | Change |
|------|--------|
| `src/lib/env.ts` | Add META_APP_ID, META_APP_SECRET, META_GRAPH_API_VERSION, META_REDIRECT_URI |
| `src/config/providers.config.ts` | Add metaInstagramProvider, conditional mock |
| `src/app/(dashboard)/accounts/actions.ts` | Add getMetaAuthUrl server action |
| `.env.example` | Add Meta vars |
