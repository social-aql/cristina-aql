import 'server-only';
import { env } from '@/lib/env';
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

Returnează DOAR JSON valid în formatul cerut. Bazează-te pe rezultatele căutărilor web.`;

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

export async function runIndustryScout(runType: 'monday' | 'wednesday' | 'friday'): Promise<{
  news: IndustryNewsItem[];
  upcomingEvents: UpcomingEvent[];
}> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.warn('[industry-scout] GOOGLE_GENERATIVE_AI_API_KEY not set, returning empty');
    return { news: [], upcomingEvents: [] };
  }

  const today = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const themes = forkConfig.contentNiche.themes.join(', ');

  void runType;

  const userPrompt = `Astăzi este ${today}.

Caută pe web știrile financiare relevante din ultimele 48 de ore și evenimentele programate în următoarele 72 de ore.

Focus pe teme relevante pentru un creator financiar român: ${themes}

Returnează știrile cu relevanță HIGH și MEDIUM pentru audiența de retail investors din România.
Maxim 6 știri + maxim 4 upcoming events.

Returnează STRICT în format JSON (fără markdown, fără \`\`\`):
{
  "news": [{"title": "...", "summary": "...", "source": "...", "url": "...", "relevance": "high|medium|low", "theme": "...", "published_at": "..."}],
  "upcoming_events": [{"event": "...", "date_description": "...", "theme": "...", "urgency": "urgent|planned|watch", "description": "..."}]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SCOUT_SYSTEM_PROMPT }] },
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      }),
    }
  );

  if (!response.ok) {
    console.error('[industry-scout] Gemini REST error:', await response.text());
    return { news: [], upcomingEvents: [] };
  }

  const json = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const textParts = json.candidates?.[0]?.content?.parts?.filter(p => p.text) ?? [];
  const rawText = textParts.map(p => p.text ?? '').join('');

  if (!rawText) {
    console.warn('[industry-scout] empty response from Gemini');
    return { news: [], upcomingEvents: [] };
  }

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) ??
    rawText.match(/```\n?([\s\S]*?)\n?```/);
  const jsonText = jsonMatch ? jsonMatch[1] : rawText;

  let parsed: {
    news?: Array<{
      title: string;
      summary: string;
      source: string;
      url?: string;
      relevance: string;
      theme?: string;
      published_at?: string;
    }>;
    upcoming_events?: Array<{
      event: string;
      date_description: string;
      theme: string;
      urgency: string;
      description: string;
    }>;
  } = {};

  try {
    parsed = JSON.parse(jsonText.trim());
  } catch {
    // Try to find JSON object in the text
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]); } catch { /* ignore */ }
    }
    if (!parsed.news) {
      console.warn('[industry-scout] could not parse JSON, raw:', rawText.slice(0, 300));
    }
  }

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
