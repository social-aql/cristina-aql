# Video Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add async video transcription via Gemini for Reels/Videos, enriching AI analyses with spoken content and visual descriptions.

**Architecture:** A Supabase job queue (`transcription_jobs`) decouples sync from transcription. The sync flow queues jobs; a `/api/cron/transcribe` route runs the worker every 5 min. Transcripts are stored on `posts` and fed into analysis data builders.

**Tech Stack:** Next.js App Router, Supabase, Gemini 2.5 Flash (inline + File API), TypeScript

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/0008_transcription_jobs.sql`

> Note: the spec says `0007` but `0007_fix_rls_recursion.sql` already exists — use `0008`.

- [ ] **Step 1: Create migration file**

```sql
-- =====================================================================
-- 0008: Transcription job queue + transcript columns on posts
-- =====================================================================

create table public.transcription_jobs (
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

alter table public.posts
  add column if not exists transcript text,
  add column if not exists transcript_segments jsonb,
  add column if not exists visual_description text,
  add column if not exists transcript_language text,
  add column if not exists transcript_model text,
  add column if not exists transcript_at timestamptz;

create or replace view public.posts_with_latest_metrics as
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

alter table public.transcription_jobs enable row level security;

create policy "transcription_jobs_owner" on public.transcription_jobs
  for all using (
    exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
  );

create trigger transcription_jobs_touch before update on public.transcription_jobs
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 2: Verify existing view columns to avoid breaking changes**

Check what columns the current view exposes (so we don't drop anything code relies on):
```bash
grep -r "posts_with_latest_metrics" src/ --include="*.ts" --include="*.tsx" -l
```

The view recreation in the migration must include ALL columns from the current view plus the new transcript ones. Compare against `supabase/migrations/0001_initial_schema.sql` if needed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_transcription_jobs.sql
git commit -m "feat: add transcription_jobs table and transcript columns on posts"
```

---

### Task 2: Transcription Types

**Files:**
- Create: `src/lib/transcription/types.ts`

- [ ] **Step 1: Create types file**

```ts
export type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TranscriptionSegment {
  start: string;
  end: string;
  text: string;
}

export interface TranscriptionResult {
  transcript: string;
  segments: TranscriptionSegment[];
  visualDescription: string;
  language: string;
  model: string;
  durationSeconds: number | null;
}

export interface TranscriptionJob {
  id: string;
  postId: string;
  accountId: string;
  status: TranscriptionStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  videoUrl: string | null;
  mediaType: string;
  createdAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/transcription/types.ts
git commit -m "feat: add transcription types"
```

---

### Task 3: Gemini Transcription Engine

**Files:**
- Create: `src/lib/transcription/gemini-transcribe.ts`

- [ ] **Step 1: Create Gemini transcription engine**

```ts
import 'server-only';
import { env } from '@/lib/env';
import type { TranscriptionResult } from './types';

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;

const TRANSCRIPTION_PROMPT = `Analizează acest video și returnează un JSON cu exact aceste câmpuri:

1. "transcript": textul complet al audio-ului, exact cum se aude, în limba originală (română sau engleză)

2. "segments": array de segmente cu timestamps, format:
   [{"start": "0:00", "end": "0:08", "text": "textul acestui segment"}]
   - Împarte pe propoziții logice, nu cuvânt cu cuvânt
   - Timestamps în format M:SS

3. "visual_description": o descriere detaliată a ce se vede în video:
   - Fundalul și decorul
   - Text grafic sau titluri afișate pe ecran (EXACT cum scrie)
   - Grafice, tabele, imagini dacă există
   - Mișcarea sau tăieturile (cuts) principale
   - Aspectul general (fața vorbitorului, studio, outdoor etc.)

4. "language": limba principală din video ("ro" sau "en")

5. "duration_seconds": durata totală estimată în secunde (număr)

Vocabular financiar specific de recunoscut corect:
FED, BCE, DXY, PIB, GDP, S&P 500, NASDAQ, FOMC, tapering, QE, spread,
inflație, dobândă, lichiditate, piețe emergente, bullish, bearish,
rezistență, suport, breakout, yield curve, T-bills

Returnează DOAR JSON valid. Fără text adițional, fără markdown, fără code fences.`;

export async function transcribeVideo(
  videoUrl: string,
): Promise<TranscriptionResult> {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured');
  }

  let videoBytes: Buffer;
  try {
    const response = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Video download failed: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    videoBytes = Buffer.from(arrayBuffer);
  } catch (err) {
    throw new Error(
      `Failed to download video: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  console.log(`[transcribe] video size: ${(videoBytes.length / 1024 / 1024).toFixed(2)}MB`);

  let geminiResponse: Response;
  if (videoBytes.length > MAX_VIDEO_SIZE_BYTES) {
    geminiResponse = await transcribeViaFileApi(videoBytes);
  } else {
    geminiResponse = await transcribeInline(videoBytes);
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text();
    throw new Error(`Gemini transcription failed: ${geminiResponse.status} — ${errText.slice(0, 300)}`);
  }

  const json = await geminiResponse.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new Error('Gemini returned empty transcription response');
  }

  let parsed: {
    transcript?: string;
    segments?: Array<{ start: string; end: string; text: string }>;
    visual_description?: string;
    language?: string;
    duration_seconds?: number;
  };

  try {
    const clean = text.replace(/```json\n?|```\n?/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Failed to parse Gemini JSON response: ${text.slice(0, 200)}`);
  }

  return {
    transcript: parsed.transcript ?? '',
    segments: parsed.segments ?? [],
    visualDescription: parsed.visual_description ?? '',
    language: parsed.language ?? 'ro',
    model: GEMINI_MODEL,
    durationSeconds: parsed.duration_seconds ?? null,
  };
}

async function transcribeInline(videoBytes: Buffer): Promise<Response> {
  const base64Video = videoBytes.toString('base64');
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            { inline_data: { mime_type: 'video/mp4', data: base64Video } },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 4096 },
      }),
    }
  );
}

async function transcribeViaFileApi(videoBytes: Buffer): Promise<Response> {
  console.log('[transcribe] video > 20MB, using File API');

  const uploadResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: videoBytes,
    }
  );

  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    throw new Error(`File API upload failed: ${err.slice(0, 200)}`);
  }

  const uploadJson = await uploadResponse.json() as {
    file?: { uri?: string };
  };
  const fileUri = uploadJson.file?.uri;
  if (!fileUri) {
    throw new Error('File API did not return a file URI');
  }

  console.log(`[transcribe] File API upload success: ${fileUri}`);

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 4096 },
      }),
    }
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep transcription
```

Expected: no errors in `src/lib/transcription/gemini-transcribe.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/transcription/gemini-transcribe.ts
git commit -m "feat: add Gemini video transcription engine"
```

---

### Task 4: Transcription Worker

**Files:**
- Create: `src/lib/transcription/worker.ts`

- [ ] **Step 1: Create worker**

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { transcribeVideo } from './gemini-transcribe';

const BATCH_SIZE = 3;

export interface WorkerResult {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function runTranscriptionWorker(): Promise<WorkerResult> {
  const supabase = await createSupabaseServerClient();

  const result: WorkerResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const { data: jobs, error: fetchError } = await supabase
    .from('transcription_jobs')
    .select('id, post_id, account_id, status, attempts, max_attempts, video_url, media_type')
    .or('status.eq.pending,and(status.eq.failed,attempts.lt.max_attempts)')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError || !jobs || jobs.length === 0) {
    console.log('[transcription worker] no pending jobs');
    return result;
  }

  console.log(`[transcription worker] processing ${jobs.length} jobs`);

  for (const job of jobs) {
    result.processed++;

    await supabase
      .from('transcription_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
      })
      .eq('id', job.id);

    try {
      const { data: post } = await supabase
        .from('posts')
        .select('media_url, media_type, transcript')
        .eq('id', job.post_id)
        .single();

      if (post?.transcript) {
        await supabase
          .from('transcription_jobs')
          .update({ status: 'skipped', completed_at: new Date().toISOString() })
          .eq('id', job.id);
        result.skipped++;
        continue;
      }

      const videoUrl = job.video_url || post?.media_url;
      if (!videoUrl) {
        throw new Error('No video URL available — URL may have expired');
      }

      const transcription = await transcribeVideo(videoUrl);

      await supabase
        .from('posts')
        .update({
          transcript: transcription.transcript,
          transcript_segments: transcription.segments,
          visual_description: transcription.visualDescription,
          transcript_language: transcription.language,
          transcript_model: transcription.model,
          transcript_at: new Date().toISOString(),
        })
        .eq('id', job.post_id);

      await supabase
        .from('transcription_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', job.id);

      result.completed++;
      console.log(`[transcription worker] completed job ${job.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[transcription worker] failed job ${job.id}:`, message);

      result.failed++;
      result.errors.push(`${job.id}: ${message}`);

      const newAttempts = job.attempts + 1;
      const isFinal = newAttempts >= job.max_attempts;

      await supabase
        .from('transcription_jobs')
        .update({
          status: isFinal ? 'failed' : 'pending',
          error_message: message,
          completed_at: isFinal ? new Date().toISOString() : null,
        })
        .eq('id', job.id);
    }
  }

  console.log(`[transcription worker] done: ${JSON.stringify(result)}`);
  return result;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep worker
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/transcription/worker.ts
git commit -m "feat: add transcription worker with retry logic"
```

---

### Task 5: Wire Job Queue into Sync

**Files:**
- Modify: `src/lib/sync/sync-account.ts`

The post upsert loop already calls `supabase.from('posts').upsert(...)` and returns `upsertedPost`. After each successful upsert we need to queue a transcription job for reels/videos. Do this after `postsInserted++` and the metrics snapshot insert, collecting all video posts first, then bulk-upsert at end of loop.

- [ ] **Step 1: Add job queueing after the post loop**

In `sync-account.ts`, add a collector array before the `for (const post of posts)` loop and bulk-insert at end. Find the line `return { postsInserted, snapshotsInserted };` and insert before it:

The full modified `sync-account.ts` — only the two additions needed:

**Addition 1:** After `const now = new Date().toISOString();` and before `let postsInserted = 0;`, add:
```ts
const transcriptionJobsToQueue: Array<{
  post_id: string;
  account_id: string;
  media_type: string;
  video_url: string | null;
  status: string;
}> = [];
```

**Addition 2:** Inside the `for (const post of posts)` loop, after the metrics snapshot insert (after `snapshotsInserted++;`), add:
```ts
      if (
        upsertedPost &&
        (post.mediaType === 'reel' || post.mediaType === 'video')
      ) {
        transcriptionJobsToQueue.push({
          post_id: upsertedPost.id,
          account_id: accountId,
          media_type: post.mediaType,
          video_url: post.mediaUrl ?? null,
          status: 'pending',
        });
      }
```

**Addition 3:** After the for loop closes (after `snapshotsInserted++` for the last snapshot), before `// 10. Update last_sync_at`, add:
```ts
    // Queue transcription jobs for new video posts
    if (transcriptionJobsToQueue.length > 0) {
      await supabase
        .from('transcription_jobs')
        .upsert(transcriptionJobsToQueue, {
          onConflict: 'post_id',
          ignoreDuplicates: true,
        });
      console.log(`[sync] queued ${transcriptionJobsToQueue.length} transcription jobs`);
    }
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep sync-account
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/sync-account.ts
git commit -m "feat: queue transcription jobs during post sync"
```

---

### Task 6: Cron Route

**Files:**
- Modify: `vercel.json`
- Create: `src/app/api/cron/transcribe/route.ts`

- [ ] **Step 1: Update vercel.json**

Replace the crons array content with:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-summary",
      "schedule": "0 16 * * 3"
    },
    {
      "path": "/api/cron/transcribe",
      "schedule": "0 * * * *"
    }
  ]
}
```

> Use `0 * * * *` (hourly) — Vercel Hobby free tier does not support `*/5 * * * *`. On Pro/Enterprise you can use `*/5 * * * *`.

- [ ] **Step 2: Create cron route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { runTranscriptionWorker } from '@/lib/transcription/worker';
import { env } from '@/lib/env';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  console.log('[cron/transcribe] starting worker');
  const startTime = Date.now();

  try {
    const result = await runTranscriptionWorker();
    const duration = Date.now() - startTime;
    console.log(`[cron/transcribe] done in ${duration}ms:`, result);
    return NextResponse.json({ success: true, result, durationMs: duration });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/transcribe] worker error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep transcribe
```

- [ ] **Step 4: Commit**

```bash
git add vercel.json src/app/api/cron/transcribe/route.ts
git commit -m "feat: add /api/cron/transcribe route"
```

---

### Task 7: Enrich Data Builders with Transcript

**Files:**
- Modify: `src/ai/analyses/data-builders.ts`

- [ ] **Step 1: Add transcript fields to PostForAnalysis interface**

In `data-builders.ts`, find the `PostForAnalysis` interface and add these fields at the end:

```ts
  // Transcript — null if not available
  hasTranscript: boolean;
  transcriptHook: string | null;
  transcriptStructure: string | null;
  transcriptKeywords: string[];
  visualDescription: string | null;
```

- [ ] **Step 2: Update toPostForAnalysis function signature to accept transcript fields**

The `p` parameter in `toPostForAnalysis` needs these new fields. Update the parameter type inline (add to the existing object type):

```ts
  transcript?: string | null;
  transcript_segments?: unknown;
  visual_description?: string | null;
```

- [ ] **Step 3: Add transcript extraction logic inside toPostForAnalysis return**

Add these lines after `const hashtags = ...` and before the return statement:

```ts
  const transcript = p.transcript ?? null;
  const segments = (Array.isArray(p.transcript_segments) ? p.transcript_segments : []) as Array<{ start: string; end: string; text: string }>;

  const transcriptHook = transcript
    ? transcript.split(/[.!?]/).filter(Boolean).slice(0, 2).join('. ').trim() + '.'
    : null;

  const transcriptStructure = segments.length > 0
    ? segments.map((s) => `${s.start}-${s.end}: "${s.text.slice(0, 60)}"`).join(' | ')
    : null;

  const financialKeywords = [
    'FED', 'BCE', 'inflație', 'dobândă', 'PIB', 'S&P', 'NASDAQ',
    'bitcoin', 'crypto', 'aur', 'dolar', 'lichiditate',
  ];
  const transcriptLower = (transcript ?? '').toLowerCase();
  const transcriptKeywords = financialKeywords.filter((k) =>
    transcriptLower.includes(k.toLowerCase())
  );
```

- [ ] **Step 4: Add new fields to the return object in toPostForAnalysis**

At the end of the return object (after `hourOfDay: dt.getHours()`), add:

```ts
    hasTranscript: !!transcript,
    transcriptHook,
    transcriptStructure,
    transcriptKeywords,
    visualDescription: p.visual_description ?? null,
```

- [ ] **Step 5: Update DB selects to include transcript fields**

In `buildWeeklyData`, find the two `.select(...)` calls on `posts_with_latest_metrics`. Add `transcript, transcript_segments, visual_description` to the first one (currentPeriod select — the one with all post fields):

Change:
```ts
      'id, caption, media_type, theme, theme_secondary, er_by_reach, saves_per_reach, sends_per_reach, reach, save_to_like_ratio, published_at, hashtags'
```
To:
```ts
      'id, caption, media_type, theme, theme_secondary, er_by_reach, saves_per_reach, sends_per_reach, reach, save_to_like_ratio, published_at, hashtags, transcript, transcript_segments, visual_description'
```

In `buildPatternsData`, same change to its `.select(...)` call.

- [ ] **Step 6: Update formatPost in weekly-summary.ts to include transcript data**

In `src/ai/analyses/weekly-summary.ts`, find the `formatPost` function and add transcript lines after the `Caption preview` line:

```ts
     ${p.hasTranscript ? `Hook verbal (din video): "${p.transcriptHook ?? ''}"` : 'Transcript video: indisponibil'}
     ${p.transcriptStructure ? `Structură video: ${p.transcriptStructure}` : ''}
     ${p.visualDescription ? `Descriere vizuală: ${p.visualDescription.slice(0, 150)}` : ''}
     ${p.transcriptKeywords.length > 0 ? `Cuvinte cheie video: ${p.transcriptKeywords.join(', ')}` : ''}
```

- [ ] **Step 7: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep -E "data-builders|weekly-summary"
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/ai/analyses/data-builders.ts src/ai/analyses/weekly-summary.ts
git commit -m "feat: enrich analysis data builders with transcript fields"
```

---

### Task 8: TranscriptSection UI Component

**Files:**
- Create: `src/components/posts/TranscriptSection.tsx`
- Modify: `src/app/dashboard/posts/[id]/page.tsx`

- [ ] **Step 1: Check what design-system components exist**

```bash
ls src/components/design-system/
```

Verify `Eyebrow`, `H3`, `Body`, `Mono`, `Card` exist before using them. If `H3` doesn't exist, use `H2` or find the correct name.

- [ ] **Step 2: Create TranscriptSection component**

```tsx
import type { TranscriptionSegment } from '@/lib/transcription/types';
import { Eyebrow, Body, Mono } from '@/components/design-system/Typography';
import { Card } from '@/components/design-system/Card';

interface Props {
  transcript: string | null;
  segments: TranscriptionSegment[] | null;
  visualDescription: string | null;
  transcriptAt: string | null;
  model: string | null;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
}

export function TranscriptSection({
  transcript,
  segments,
  visualDescription,
  transcriptAt,
  model,
  jobStatus,
}: Props) {
  if (!transcript && !jobStatus) return null;

  if (!transcript && (jobStatus === 'pending' || jobStatus === 'processing')) {
    return (
      <section style={{ marginTop: 40 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
            <Mono tone="muted" style={{ fontSize: 12 }}>
              ⏳ {jobStatus === 'processing' ? 'SE PROCESEAZĂ...' : 'ÎN COADĂ'}
            </Mono>
            <Body tone="secondary" style={{ fontSize: 13 }}>
              Transcrierea video-ului este în curs. Va fi disponibilă în câteva minute.
            </Body>
          </div>
        </Card>
      </section>
    );
  }

  if (!transcript && jobStatus === 'failed') {
    return (
      <section style={{ marginTop: 40 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        <Card style={{ marginTop: 12 }}>
          <Body tone="secondary" style={{ fontSize: 13 }}>
            Transcrierea a eșuat (URL video posibil expirat).
            Reels-urile trebuie transcrise în primele 24h după sync.
          </Body>
        </Card>
      </section>
    );
  }

  if (!transcript) return null;

  return (
    <section style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        {transcriptAt && (
          <Mono tone="muted" style={{ fontSize: 10 }}>
            {model?.toUpperCase()} · {new Date(transcriptAt).toLocaleDateString('ro-RO')}
          </Mono>
        )}
      </div>

      <Card style={{ marginBottom: 12 }}>
        <Eyebrow tone="muted" style={{ marginBottom: 8 }}>TRANSCRIPT AUDIO</Eyebrow>
        <Body style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {transcript}
        </Body>
      </Card>

      {segments && segments.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted" style={{ marginBottom: 8 }}>
            STRUCTURĂ · {segments.length} SEGMENTE
          </Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {segments.map((seg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 16,
                  borderLeft: '3px solid var(--color-border-default)',
                  paddingLeft: 12,
                }}
              >
                <Mono tone="muted" style={{ fontSize: 11, minWidth: 60, marginTop: 2 }}>
                  {seg.start}–{seg.end}
                </Mono>
                <Body style={{ fontSize: 14 }}>{seg.text}</Body>
              </div>
            ))}
          </div>
        </Card>
      )}

      {visualDescription && (
        <Card>
          <Eyebrow tone="muted" style={{ marginBottom: 8 }}>DESCRIERE VIZUALĂ</Eyebrow>
          <Body tone="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {visualDescription}
          </Body>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Wire into post detail page**

In `src/app/dashboard/posts/[id]/page.tsx`:

**Add import** near the top (after existing post component imports):
```tsx
import { TranscriptSection } from '@/components/posts/TranscriptSection';
import type { TranscriptionSegment } from '@/lib/transcription/types';
```

**Add DB fetch** — in the existing data fetching section (where `post` is fetched), add after the post fetch succeeds:
```ts
  const { data: transcriptionJob } = await supabase
    .from('transcription_jobs')
    .select('status')
    .eq('post_id', post.id)
    .maybeSingle();
```

**Add component** in JSX, after `<PostDiagnosticChecklist>` (or after `<PostKpiGrid>` if checklist doesn't exist — check page structure):
```tsx
<TranscriptSection
  transcript={post.transcript ?? null}
  segments={(post.transcript_segments as TranscriptionSegment[]) ?? null}
  visualDescription={post.visual_description ?? null}
  transcriptAt={post.transcript_at ?? null}
  model={post.transcript_model ?? null}
  jobStatus={transcriptionJob?.status ?? null}
/>
```

- [ ] **Step 4: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep -E "TranscriptSection|post.*page"
```

Expected: no errors.

- [ ] **Step 5: Full build**

```bash
pnpm build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/posts/TranscriptSection.tsx src/app/dashboard/posts/\[id\]/page.tsx
git commit -m "feat: add TranscriptSection UI component to post detail page"
```

---

### Task 9: Apply DB Migration & Verify

> This task is done by Andrei manually (requires Supabase dashboard or CLI access).

- [ ] **Step 1: Apply migration**

In Supabase dashboard → SQL Editor, run contents of `supabase/migrations/0008_transcription_jobs.sql`.

Or with CLI:
```bash
supabase db push
```

- [ ] **Step 2: Verify columns**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'posts' AND column_name LIKE 'transcript%';
```

Expected: `transcript`, `transcript_segments`, `transcript_language`, `transcript_model`, `transcript_at`

- [ ] **Step 3: Verify table**

```sql
SELECT COUNT(*) FROM transcription_jobs;
```

Expected: `0` (no jobs yet)

- [ ] **Step 4: Test cron manually**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/transcribe
```

Expected: `{"success":true,"result":{"processed":0,"completed":0,"failed":0,"skipped":0,"errors":[]}}`

- [ ] **Step 5: Trigger sync and check jobs**

Trigger a manual sync via the dashboard. Then:
```sql
SELECT COUNT(*) FROM transcription_jobs WHERE status = 'pending';
```

Expected: > 0 if account has Reels.

---

## Migration Number Note

The spec uses `0007` but this project already has `0007_fix_rls_recursion.sql`. The migration file is named `0008_transcription_jobs.sql` in this plan. Update references accordingly.

## Vercel Cron Note

`*/5 * * * *` requires Vercel Pro. This plan uses `0 * * * *` (hourly) which works on Hobby. Change to `*/5 * * * *` after upgrading if needed.
