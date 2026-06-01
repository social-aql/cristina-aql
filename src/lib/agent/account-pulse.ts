import 'server-only';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import type { AccountPulse } from './types';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function buildAccountPulse(
  userId: string,
  accountId: string,
  sinceHours: number = 48,
  supabaseClient?: SupabaseClient,
): Promise<AccountPulse> {
  const supabase = supabaseClient ?? (createSupabaseServiceClient() as unknown as SupabaseClient);
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();

  const { data: recentPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('id, caption, media_type, theme, er_by_reach, saves_per_reach, sends_per_reach, published_at')
    .eq('account_id', accountId)
    .gte('published_at', since)
    .order('published_at', { ascending: false });

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

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const recentReach = allPosts?.filter(p => p.published_at >= sevenDaysAgo)
    .reduce((s, p) => s + (p.reach ?? 0), 0) ?? 0;
  const prevReach = allPosts?.filter(p => p.published_at < sevenDaysAgo)
    .reduce((s, p) => s + (p.reach ?? 0), 0) ?? 0;

  const reachDelta = prevReach > 0 ? ((recentReach - prevReach) / prevReach) * 100 : 0;
  const reachTrend: AccountPulse['reachTrend'] =
    reachDelta > 10 ? 'up' : reachDelta < -10 ? 'down' : 'stable';

  const lastPost = allPosts?.sort((a, b) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  )[0];
  const daysSinceLastPost = lastPost
    ? Math.floor((Date.now() - new Date(lastPost.published_at).getTime()) / 86400000)
    : 99;

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

  const topPost = postsPublishedSinceLastRun.length > 0
    ? postsPublishedSinceLastRun.sort(
        (a, b) => (b.erByReach ?? 0) - (a.erByReach ?? 0)
      )[0]
    : null;

  void userId; // used for RLS context via server client

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
