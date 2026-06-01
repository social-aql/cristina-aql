import 'server-only';
import { getDefaultAiProvider } from '@/ai/registry';
import type { AccountPulse, IndustryNewsItem, UpcomingEvent, ContentOpportunity } from './types';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

Returnează DOAR JSON valid cu structura:
{"opportunities": [{"title": "...", "hook": "...", "format": "...", "theme": "...", "rationale": "...", "priority": "1|2|3", "urgency": "now|tomorrow|this-week", "best_time_to_post": "...", "estimated_er": "..."}]}`;

export async function detectOpportunities(params: {
  accountId: string;
  userId: string;
  pulse: AccountPulse;
  news: IndustryNewsItem[];
  events: UpcomingEvent[];
  supabaseClient?: SupabaseClient;
}): Promise<ContentOpportunity[]> {
  const provider = getDefaultAiProvider();
  const supabase = params.supabaseClient ?? (createSupabaseServiceClient() as unknown as SupabaseClient);

  const { data: themePosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('theme, er_by_reach, saves_per_reach, sends_per_reach')
    .eq('account_id', params.accountId)
    .gte('published_at', new Date(Date.now() - 90 * 86400000).toISOString())
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

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

  void params.userId;

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
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.5,
    maxOutputTokens: 2000,
    jsonMode: true,
  });

  const parsed = result.parsed as {
    opportunities?: Array<{
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

  return (parsed?.opportunities ?? []).map(o => ({
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
