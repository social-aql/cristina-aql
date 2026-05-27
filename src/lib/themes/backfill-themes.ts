import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { classifyThemesBatch } from './classify-with-ai';
import { detectThemeByKeywords } from './detect-theme';
import { AiProviderError } from '@/ai/providers/types';
import type { ThemeDetectionResult } from './types';

const BATCH_SIZE = 8;
const MAX_BATCHES = 20;
const BATCH_DELAY_MS = 8000;
const RATE_LIMIT_RETRY_MS = 65000;

export async function backfillThemesForUser(userId: string): Promise<{
  processed: number;
  aiClassified: number;
  keywordClassified: number;
  aiErrors: number;
  errorSamples: string[];
  errors: number;
}> {
  const supabase = await createSupabaseServerClient();

  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, caption, hashtags, account_id')
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE * MAX_BATCHES);

  if (error || !posts) {
    throw new Error(`Failed to fetch posts: ${error?.message ?? 'unknown'}`);
  }

  let processed = 0;
  let aiClassified = 0;
  let keywordClassified = 0;
  let aiErrors = 0;
  const errorSamples: string[] = [];
  let errors = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    // Throttle to stay under Gemini free-tier RPM (10–15 RPM)
    if (i > 0) await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));

    const batch = posts.slice(i, i + BATCH_SIZE);
    const batchInputs = batch.map((p) => ({ caption: p.caption ?? '', hashtags: p.hashtags ?? [] }));

    let results: ThemeDetectionResult[];
    try {
      results = await classifyThemesBatch(batchInputs);
      aiClassified += results.length;
    } catch (err) {
      // Rate limited: wait 65s and retry once before falling back to keywords
      if (err instanceof AiProviderError && err.rateLimited) {
        console.warn(`[backfill] Batch ${i} rate limited, retrying after ${RATE_LIMIT_RETRY_MS / 1000}s…`);
        try {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
          results = await classifyThemesBatch(batchInputs);
          aiClassified += results.length;
        } catch (retryErr) {
          aiErrors += batch.length;
          if (errorSamples.length < 3) {
            errorSamples.push(retryErr instanceof Error ? retryErr.message : String(retryErr));
          }
          console.warn(`[backfill] Batch ${i} retry failed, using keyword fallback:`, retryErr);
          results = batch.map((p) => detectThemeByKeywords({ caption: p.caption, hashtags: p.hashtags ?? [] }));
          keywordClassified += results.length;
        }
      } else {
        aiErrors += batch.length;
        if (errorSamples.length < 3) {
          errorSamples.push(err instanceof Error ? err.message : String(err));
        }
        console.warn(`[backfill] Batch ${i} AI failed, using keyword fallback:`, err);
        results = batch.map((p) => detectThemeByKeywords({ caption: p.caption, hashtags: p.hashtags ?? [] }));
        keywordClassified += results.length;
      }
    }

    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const result = results[j];
      const { error: updateErr } = await supabase
        .from('posts')
        .update({
          theme: result.theme,
          theme_secondary: result.themeSecondary,
          theme_confidence: result.confidence,
        })
        .eq('id', post.id);

      if (updateErr) errors++;
      else processed++;
    }
  }

  return { processed, aiClassified, keywordClassified, aiErrors, errorSamples, errors };
}
