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
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #0A0A0A; color: #F2EFE4; line-height: 1.5; }
    .container { max-width: 640px; margin: 0 auto; padding: 32px 24px; }
    .header { border-bottom: 1px solid #262626; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { font-size: 13px; letter-spacing: 0.1em; color: #C7F84C; font-weight: 700; }
    .runtype { font-size: 11px; color: #8A8A8A; margin-top: 4px; letter-spacing: 0.08em; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 10px; letter-spacing: 0.12em; color: #5A5A5A; text-transform: uppercase; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1A1A1A; }
    .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #141414; border-radius: 4px; margin-bottom: 6px; }
    .metric-label { font-size: 12px; color: #8A8A8A; }
    .metric-value { font-size: 13px; font-weight: 600; font-family: 'Courier New', monospace; }
    .lime { color: #C7F84C; }
    .coral { color: #FF5A4E; }
    .news-item { padding: 10px 12px; background: #141414; border-left: 3px solid #262626; border-radius: 0 4px 4px 0; margin-bottom: 8px; }
    .news-item.high { border-left-color: #C7F84C; }
    .news-item.medium { border-left-color: #7A9A2E; }
    .news-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .news-summary { font-size: 12px; color: #8A8A8A; }
    .event-item { padding: 8px 12px; border-radius: 4px; margin-bottom: 6px; }
    .event-urgent { background: #1A0908; border-left: 3px solid #FF5A4E; }
    .event-planned { background: #141414; border-left: 3px solid #C7F84C; }
    .event-label { font-size: 10px; letter-spacing: 0.08em; margin-bottom: 3px; }
    .event-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .event-desc { font-size: 12px; color: #8A8A8A; }
    .opportunity { background: #0E1A06; border: 1px solid #3A5C0F; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
    .opp-priority { font-size: 10px; letter-spacing: 0.1em; color: #C7F84C; margin-bottom: 8px; }
    .opp-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
    .opp-hook { font-size: 13px; font-style: italic; color: #F2EFE4; background: #141414; padding: 10px 12px; border-radius: 4px; border-left: 2px solid #C7F84C; margin-bottom: 10px; }
    .opp-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    .opp-badge { font-size: 10px; padding: 2px 8px; background: #141414; border: 1px solid #262626; border-radius: 3px; color: #8A8A8A; font-family: 'Courier New', monospace; }
    .opp-rationale { font-size: 12px; color: #8A8A8A; }
    .alert-box { padding: 12px 16px; background: #1A0908; border-left: 3px solid #FF5A4E; border-radius: 0 4px 4px 0; margin-bottom: 8px; }
    .cta-button { display: inline-block; padding: 12px 24px; background: #C7F84C; color: #000; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 24px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1A1A1A; font-size: 11px; color: #5A5A5A; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">AI LICHIDITATE</div>
      <div class="runtype">${runTypeLabels[runType]} · ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>

    <div class="section">
      <div class="section-title">CONT · ULTIMELE 48H</div>
      ${pulse.reachTrend === 'down' && Math.abs(pulse.reachDelta) > 15 ? `
        <div class="alert-box">⚠️ Reach în scădere: ${pulse.reachDelta}% față de perioada precedentă</div>
      ` : ''}
      ${pulse.daysSinceLastPost >= 3 ? `
        <div class="alert-box">⚠️ ${pulse.daysSinceLastPost} zile fără postare — consistența e cheie</div>
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

    <a href="${params.appUrl}/dashboard/agent" class="cta-button">→ DESCHIDE DASHBOARD COMPLET</a>

    <div class="footer">
      <p>AI LICHIDITATE · Agent Proactiv · ${runTypeLabels[runType]}</p>
      <p style="margin-top: 4px;">Următorul briefing: ${getNextRunLabel(runType)}</p>
    </div>
  </div>
</body>
</html>`;

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
