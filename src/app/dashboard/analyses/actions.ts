'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/ai/analyses/runner';
import { checkAdmin } from '@/lib/roles';
import type { AnalysisType } from '@/ai/analyses/types';
import { computeTranscriptMetrics } from '@/lib/transcription/transcript-metrics';
import { generatePostCritique } from '@/lib/transcription/post-critique';
import type { TranscriptionSegment } from '@/lib/transcription/types';

export async function runAnalysisAction(
  analysisType: AnalysisType,
  accountId: string
): Promise<{ success: true; analysisId: string } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return {
      success: false,
      error: roleCheck.error === 'forbidden'
        ? 'Generarea de analize este disponibilă doar pentru admin.'
        : roleCheck.error,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();
  if (!account) return { success: false, error: 'account_not_found' };

  const result = await runAnalysis({
    userId: user.id,
    accountId,
    analysisType,
    triggerSource: 'manual',
  });

  if (result.status === 'failed') {
    return { success: false, error: result.error ?? 'analysis_failed' };
  }

  revalidatePath('/dashboard/analyses');
  revalidatePath('/dashboard');
  return { success: true, analysisId: result.analysisId };
}

export async function runPostCritiqueAction(
  postId: string,
): Promise<{ success: true; critiqueId: string } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return { success: false, error: 'forbidden' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  const { data: post } = await supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .eq('id', postId)
    .single();

  if (!post) return { success: false, error: 'post_not_found' };
  if (!post.transcript) return { success: false, error: 'no_transcript' };

  const segments = (post.transcript_segments ?? []) as TranscriptionSegment[];

  const { data: accountPostIds } = await supabase
    .from('posts')
    .select('id')
    .eq('account_id', post.account_id);

  const ids = (accountPostIds ?? []).map((p: { id: string }) => p.id);

  const { data: accountPosts } = await supabase
    .from('post_metrics_snapshots')
    .select('er_by_reach')
    .in('post_id', ids)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  const avgEr = accountPosts && accountPosts.length > 0
    ? accountPosts.reduce((s: number, p: { er_by_reach: number }) => s + p.er_by_reach, 0) / accountPosts.length
    : null;

  const metrics = computeTranscriptMetrics(
    post.transcript,
    segments,
    post.visual_description ?? null,
  );

  const critique = await generatePostCritique({
    caption: post.caption,
    transcript: post.transcript,
    segments,
    visualDescription: post.visual_description ?? null,
    metrics,
    postMetrics: {
      erByReach: post.er_by_reach,
      savesPerReach: post.saves_per_reach,
      sendsPerReach: post.sends_per_reach,
      reach: post.reach,
    },
    accountAvgEr: avgEr,
  });

  const { data: analysis } = await supabase
    .from('ai_analyses')
    .insert({
      user_id: user.id,
      account_id: post.account_id,
      analysis_type: 'post_critique',
      model: 'gemini-2.5-flash',
      output_markdown: critique.narrativeMarkdown,
      structured_output: {
        ...critique,
        metrics,
        postId,
      },
      status: 'completed',
      trigger_source: 'manual',
    })
    .select('id')
    .single();

  revalidatePath(`/dashboard/posts/${postId}`);
  return { success: true, critiqueId: analysis!.id };
}
