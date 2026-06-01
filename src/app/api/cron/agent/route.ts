import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAgent } from '@/lib/agent/runner';
import { env } from '@/lib/env';

export const maxDuration = 300;

function getRunType(): 'monday' | 'wednesday' | 'friday' {
  const day = new Date().getDay();
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
