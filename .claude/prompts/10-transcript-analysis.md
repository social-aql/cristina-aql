# AI LICHIDITATE — Prompt 10: Transcript Analysis — Metrici + Critică AI

## Context

Transcripturile video sunt acum disponibile în DB (din Prompt 09). Această funcționalitate le transformă în insights acționabile prin două mecanisme:

1. **Transcript Metrics Engine** — calcule TypeScript pure, fără AI: words per minute, hook score, CTA score, ritm narativ, densitate keywords
2. **AI Critique per-post** — Gemini analizează transcriptul + metricile + descrierea vizuală și produce o critică dură, specifică, acționabilă în română
3. **Enrichment rapoarte săptămânale** — data builder-ul pentru Weekly Summary și Content Patterns include acum metricile de transcript + hook verbals pentru toate video-urile

## SCOPE BOUNDARY

Acest prompt face PATRU lucruri:
1. `src/lib/transcription/transcript-metrics.ts` — engine de metrici calculabile
2. `src/lib/transcription/post-critique.ts` — Gemini critique per-post
3. Post detail page — secțiune nouă "Critică AI" + metrici transcript
4. Data builders enrichment pentru analizele săptămânale

Nu se adaugă tabele noi. Critica per-post se salvează în `ai_analyses` (tabelul existent, cu `analysis_type = 'post_critique'`). Nu se modifică sync, cron, sau alte pagini.

## Carry-over (LOCKED)

- Transcript section existentă în post detail (Prompt 09) — neatinsă
- Post diagnostic checklist (Prompt 05a) — neatins
- Analyses runner și pages — neatinse (doar data builders se îmbogățesc)
- Design system, tokens, no-shadow rule

## Files allowed to change

New:
- `src/lib/transcription/transcript-metrics.ts`
- `src/lib/transcription/transcript-metrics-types.ts`
- `src/lib/transcription/post-critique.ts`
- `src/components/posts/TranscriptMetricsCard.tsx`
- `src/components/posts/PostCritiqueSection.tsx`

Modified:
- `src/app/dashboard/posts/[id]/page.tsx` — adaugă metrici + critică
- `src/app/dashboard/analyses/actions.ts` — adaugă `runPostCritiqueAction`
- `src/ai/analyses/data-builders.ts` — enrichment cu transcript metrics

## DO NOT TOUCH

- `src/lib/transcription/gemini-transcribe.ts`
- `src/lib/transcription/worker.ts`
- `src/app/api/cron/transcribe/route.ts`
- Sync logic
- Chat
- Roluri
- Toate celelalte pagini

---

## Deliverable 1: Transcript Metrics Engine

Create `src/lib/transcription/transcript-metrics-types.ts`:

```ts
export type HookType =
  | 'question'      // deschide cu o întrebare
  | 'problem'       // prezintă o problemă/durere
  | 'number'        // deschide cu o cifră sau statistică
  | 'contradiction' // contrazice o credință comună ("Nu, X nu înseamnă Y")
  | 'statement'     // afirmație simplă
  | 'platitude';    // clișeu sau observație evidentă

export type CtaType =
  | 'save'
  | 'follow'
  | 'share'
  | 'question'      // CTA prin întrebare care invită comentarii
  | 'none';

export type CtaPosition = 'early' | 'middle' | 'end' | 'absent';

export type RhythmQuality = 'excellent' | 'good' | 'uneven' | 'monotone';

export interface TranscriptMetrics {
  // ── Basics ──────────────────────────────────────────────
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  wordsPerMinuteBenchmark: 'too_slow' | 'natural' | 'fast' | 'too_fast';

  // ── Hook (primele 8 secunde) ─────────────────────────────
  hookText: string;               // textul primelor 8 secunde
  hookWordCount: number;
  hookType: HookType;
  hookScore: number;              // 0-100
  hookScoreReason: string;        // de ce a primit acest scor

  // ── CTA ─────────────────────────────────────────────────
  hasCta: boolean;
  ctaType: CtaType;
  ctaText: string | null;         // textul exact al CTA
  ctaPosition: CtaPosition;
  ctaScore: number;               // 0-100

  // ── Ritm narativ ────────────────────────────────────────
  segmentCount: number;
  avgSegmentDurationSeconds: number;
  rhythmQuality: RhythmQuality;
  rhythmScore: number;            // 0-100
  longestSegmentSeconds: number;  // segment-ul cel mai lung (monotonie?)
  longestSegmentText: string;     // textul acelui segment

  // ── Conținut financiar ───────────────────────────────────
  financialKeywords: string[];    // lista keywords detectate
  financialKeywordDensity: number;// % din total cuvinte
  conceptsIntroduced: number;     // câte concepte noi introduce video-ul

  // ── Aliniere vizual-audio ────────────────────────────────
  hasOnScreenText: boolean;       // există text grafic pe ecran
  hasCallToAction: boolean;       // există CTA vizual (text on screen)
  visualCtaMatchesAudioCta: boolean;

  // ── Scor compus ─────────────────────────────────────────
  overallScore: number;           // 0-100, ponderat
  scoreBreakdown: {
    hook: number;
    cta: number;
    rhythm: number;
    content: number;
  };
}
```

Create `src/lib/transcription/transcript-metrics.ts`:

```ts
import type { TranscriptionSegment } from './types';
import type {
  TranscriptMetrics,
  HookType,
  CtaType,
  CtaPosition,
  RhythmQuality,
} from './transcript-metrics-types';

// ── Constants ────────────────────────────────────────────────────────

const FINANCIAL_KEYWORDS = [
  'fed', 'federal reserve', 'bce', 'fomc', 'powell', 'lagarde',
  'dobândă', 'dobanda', 'rata dobânzii', 'rata dobanzii',
  'inflație', 'inflatie', 'deflație', 'deflatie',
  'pib', 'gdp', 'recesiune', 'recession',
  'lichiditate', 'liquidity', 'spread',
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cripto',
  's&p', 'sp500', 'nasdaq', 'dow', 'wall street',
  'nvidia', 'nvda', 'apple', 'aapl', 'microsoft',
  'aur', 'xau', 'gold', 'argint', 'silver',
  'dxy', 'dolar', 'dollar', 'eur/usd', 'forex',
  'imobiliar', 'ipotecă', 'ipoteca', 'mortgage',
  'obligațiuni', 'obligatiuni', 'bonds', 'yield',
  'portofoliu', 'portfolio', 'diversificare', 'risc',
  'bull market', 'bear market', 'bullish', 'bearish',
  'breakout', 'rezistență', 'rezistenta', 'suport',
  'randament', 'dividend', 'profit', 'pierdere',
  'piețe emergente', 'piete emergente', 'emerging markets',
  'capitalul', 'capital', 'investiție', 'investitie',
  'tapering', 'qe', 'quantitative easing',
  'trezorerie', 'treasury', 't-bills',
];

const CTA_PATTERNS_SAVE = /salvează|salvati|save this|bookmark|păstrează/i;
const CTA_PATTERNS_FOLLOW = /urmărește|urmareste|follow|abonează|aboneaza|subscribe/i;
const CTA_PATTERNS_SHARE = /distribuie|share|trimite|trimite-le|dă mai departe/i;
const CTA_PATTERNS_QUESTION = /ce crezi|lasă un comentariu|spune-mi|tu cum|ai întrebări/i;

// ── Main function ────────────────────────────────────────────────────

export function computeTranscriptMetrics(
  transcript: string,
  segments: TranscriptionSegment[],
  visualDescription: string | null,
): TranscriptMetrics {
  const duration = computeDuration(segments);
  const wordCount = countWords(transcript);
  const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;

  const hookData = analyzeHook(segments);
  const ctaData = analyzeCta(transcript, segments);
  const rhythmData = analyzeRhythm(segments);
  const contentData = analyzeContent(transcript);
  const visualData = analyzeVisualAlignment(visualDescription, ctaData.hasCta);

  // Scores
  const hookScore = computeHookScore(hookData);
  const ctaScore = computeCtaScore(ctaData);
  const rhythmScore = computeRhythmScore(rhythmData);
  const contentScore = Math.min(100,
    contentData.financialKeywordDensity * 2000 + // 5% density = 100 pts
    contentData.conceptsIntroduced * 10           // 10 concepts = 100 pts
  );

  // Weighted overall: hook 35%, cta 25%, rhythm 20%, content 20%
  const overallScore = Math.round(
    hookScore * 0.35 +
    ctaScore * 0.25 +
    rhythmScore * 0.20 +
    contentScore * 0.20
  );

  return {
    wordCount,
    durationSeconds: duration,
    wordsPerMinute: wpm,
    wordsPerMinuteBenchmark: classifyWpm(wpm),

    hookText: hookData.hookText,
    hookWordCount: hookData.hookWordCount,
    hookType: hookData.hookType,
    hookScore,
    hookScoreReason: getHookScoreReason(hookData.hookType, hookScore),

    hasCta: ctaData.hasCta,
    ctaType: ctaData.ctaType,
    ctaText: ctaData.ctaText,
    ctaPosition: ctaData.ctaPosition,
    ctaScore,

    segmentCount: segments.length,
    avgSegmentDurationSeconds: rhythmData.avgDuration,
    rhythmQuality: rhythmData.quality,
    rhythmScore,
    longestSegmentSeconds: rhythmData.longestDuration,
    longestSegmentText: rhythmData.longestText,

    financialKeywords: contentData.financialKeywords,
    financialKeywordDensity: contentData.financialKeywordDensity,
    conceptsIntroduced: contentData.conceptsIntroduced,

    hasOnScreenText: visualData.hasOnScreenText,
    hasCallToAction: visualData.hasVisualCta,
    visualCtaMatchesAudioCta: visualData.ctaMatch,

    overallScore,
    scoreBreakdown: {
      hook: hookScore,
      cta: ctaScore,
      rhythm: rhythmScore,
      content: Math.round(contentScore),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseTimeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}

function computeDuration(segments: TranscriptionSegment[]): number {
  if (segments.length === 0) return 0;
  return parseTimeToSeconds(segments[segments.length - 1].end);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function classifyWpm(wpm: number): TranscriptMetrics['wordsPerMinuteBenchmark'] {
  if (wpm < 100) return 'too_slow';
  if (wpm <= 155) return 'natural';
  if (wpm <= 190) return 'fast';
  return 'too_fast';
}

function analyzeHook(segments: TranscriptionSegment[]) {
  // Primele 8 secunde
  const hookSegments = segments.filter(
    s => parseTimeToSeconds(s.end) <= 8
  );
  const hookText = hookSegments.map(s => s.text).join(' ').trim();
  const hookWordCount = countWords(hookText);
  const hookType = classifyHookType(hookText);

  return { hookText, hookWordCount, hookType };
}

function classifyHookType(text: string): HookType {
  if (!text) return 'platitude';
  const lower = text.toLowerCase();

  if (text.trim().endsWith('?') || lower.includes('de ce') || lower.includes('cum ')) {
    return 'question';
  }
  if (/^\d|\d%|\d miliard|\d trilion/i.test(text)) {
    return 'number';
  }
  if (/nu,|nu este|greșit|opusul|contrar|paradox/i.test(lower)) {
    return 'contradiction';
  }
  if (/problemă|risc|pericol|pierd|eșec|scade|cade|criza/i.test(lower)) {
    return 'problem';
  }

  // Check for platitudes — common obvious statements
  const platitudePatterns = [
    /par interesante/i,
    /toată lumea știe/i,
    /este important/i,
    /trebuie să știi/i,
    /astăzi vorbim despre/i,
    /în episodul de azi/i,
    /^bună ziua/i,
  ];
  if (platitudePatterns.some(p => p.test(text))) {
    return 'platitude';
  }

  return 'statement';
}

function analyzeCta(transcript: string, segments: TranscriptionSegment[]) {
  let ctaType: CtaType = 'none';
  let ctaText: string | null = null;
  let ctaPosition: CtaPosition = 'absent';

  // Find CTA in text
  const lines = transcript.split(/[.!?\n]/).map(l => l.trim()).filter(Boolean);
  let ctaLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (CTA_PATTERNS_SAVE.test(line)) { ctaType = 'save'; ctaText = line; ctaLineIndex = i; break; }
    if (CTA_PATTERNS_SHARE.test(line)) { ctaType = 'share'; ctaText = line; ctaLineIndex = i; break; }
    if (CTA_PATTERNS_FOLLOW.test(line)) { ctaType = 'follow'; ctaText = line; ctaLineIndex = i; break; }
    if (CTA_PATTERNS_QUESTION.test(line)) { ctaType = 'question'; ctaText = line; ctaLineIndex = i; break; }
  }

  const hasCta = ctaType !== 'none';

  if (hasCta && ctaLineIndex >= 0) {
    const position = ctaLineIndex / lines.length;
    if (position < 0.25) ctaPosition = 'early';
    else if (position < 0.75) ctaPosition = 'middle';
    else ctaPosition = 'end';
  }

  return { hasCta, ctaType, ctaText, ctaPosition };
}

function analyzeRhythm(segments: TranscriptionSegment[]) {
  if (segments.length === 0) {
    return { avgDuration: 0, quality: 'monotone' as RhythmQuality, longestDuration: 0, longestText: '' };
  }

  const durations = segments.map(s =>
    parseTimeToSeconds(s.end) - parseTimeToSeconds(s.start)
  );
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const longestIdx = durations.indexOf(maxDuration);
  const longestText = segments[longestIdx]?.text ?? '';

  // Variance in segment durations
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  let quality: RhythmQuality;
  if (avgDuration >= 4 && avgDuration <= 9 && stdDev < 4) quality = 'excellent';
  else if (avgDuration >= 3 && avgDuration <= 12 && stdDev < 6) quality = 'good';
  else if (maxDuration > 15) quality = 'monotone'; // un segment prea lung
  else quality = 'uneven';

  return { avgDuration, quality, longestDuration: maxDuration, longestText };
}

function analyzeContent(transcript: string) {
  const lower = transcript.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const foundKeywords = FINANCIAL_KEYWORDS.filter(kw =>
    lower.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );

  const wordCount = countWords(transcript);
  const density = wordCount > 0 ? foundKeywords.length / wordCount : 0;

  // Estimate unique concepts: count distinct financial keywords found
  const uniqueConcepts = new Set(foundKeywords.map(k => k.split(' ')[0])).size;

  return {
    financialKeywords: foundKeywords,
    financialKeywordDensity: density,
    conceptsIntroduced: uniqueConcepts,
  };
}

function analyzeVisualAlignment(visualDescription: string | null, audioHasCta: boolean) {
  if (!visualDescription) {
    return { hasOnScreenText: false, hasVisualCta: false, ctaMatch: false };
  }

  const lower = visualDescription.toLowerCase();
  const hasOnScreenText = /text|titlu|cuvinte|scrie|afișează|font/i.test(lower);
  const hasVisualCta = /urmărește|salvează|follow|subscribe|cta/i.test(lower);
  const ctaMatch = audioHasCta === hasVisualCta;

  return { hasOnScreenText, hasVisualCta, ctaMatch };
}

function computeHookScore(hook: { hookText: string; hookWordCount: number; hookType: HookType }): number {
  let score = 0;

  // Tip de hook
  const typeScores: Record<HookType, number> = {
    'contradiction': 90,
    'number': 85,
    'problem': 80,
    'question': 75,
    'statement': 50,
    'platitude': 15,
  };
  score = typeScores[hook.hookType];

  // Penalizare pentru hook prea scurt (<8 cuvinte) sau prea lung (>30 cuvinte)
  if (hook.hookWordCount < 8) score = Math.max(0, score - 20);
  if (hook.hookWordCount > 30) score = Math.max(0, score - 10);

  return Math.round(score);
}

function computeCtaScore(cta: { hasCta: boolean; ctaType: CtaType; ctaPosition: CtaPosition }): number {
  if (!cta.hasCta) return 0;

  const typeScores: Record<CtaType, number> = {
    'save': 90,
    'question': 85,
    'share': 75,
    'follow': 50,
    'none': 0,
  };
  let score = typeScores[cta.ctaType];

  // Bonus pentru CTA la final (cel mai eficient)
  if (cta.ctaPosition === 'end') score = Math.min(100, score + 10);
  if (cta.ctaPosition === 'early') score = Math.max(0, score - 20);

  return Math.round(score);
}

function computeRhythmScore(rhythm: { avgDuration: number; quality: RhythmQuality; longestDuration: number }): number {
  const qualityScores: Record<RhythmQuality, number> = {
    'excellent': 90,
    'good': 70,
    'uneven': 40,
    'monotone': 20,
  };
  let score = qualityScores[rhythm.quality];

  // Penalizare suplimentară pentru segmente extrem de lungi
  if (rhythm.longestDuration > 20) score = Math.max(0, score - 20);

  return Math.round(score);
}

function getHookScoreReason(type: HookType, score: number): string {
  const reasons: Record<HookType, string> = {
    'contradiction': 'Hook de contradicție — contrazice o credință comună, creează tensiune imediată',
    'number': 'Hook cu cifră — concret și credibil, captează atenția instantaneu',
    'problem': 'Hook pe problemă — audiența se identifică și vrea soluția',
    'question': 'Hook cu întrebare — invită audiența să gândească și să rămână',
    'statement': 'Hook cu afirmație — neutru, nu creează tensiune',
    'platitude': 'Hook clișeu — nu diferențiază, audiența poate da skip imediat',
  };
  return reasons[type];
}
```

---

## Deliverable 2: Post Critique Engine

Create `src/lib/transcription/post-critique.ts`:

```ts
import 'server-only';
import { getDefaultAiProvider } from '@/config/ai-providers.config';
import type { TranscriptMetrics } from './transcript-metrics-types';
import type { TranscriptionSegment } from './types';

export interface PostCritique {
  overallVerdict: string;           // 1 propoziție brutală
  score: number;                    // 0-100 (AI evaluat, diferit de metric score)
  
  sections: PostCritiqueSection[];  // critici pe secțiuni
  
  topStrengths: string[];           // max 2 — ce merge bine
  topWeaknesses: string[];          // max 3 — ce trebuie schimbat urgent
  
  rewrittenHook: string;            // hook rescris de AI (gata de folosit)
  rewrittenCta: string;             // CTA rescris de AI (gata de folosit)
  
  narrativeMarkdown: string;        // critica completă în proză
}

export interface PostCritiqueSection {
  section: 'hook' | 'structure' | 'cta' | 'visual' | 'content';
  label: string;                    // "HOOK (0:00-0:08)"
  verdict: 'strong' | 'acceptable' | 'weak' | 'critical';
  finding: string;                  // ce am găsit specific
  fix: string | null;               // ce să faci concret (null dacă e strong)
  exampleFix: string | null;        // exemplu concret rescris
}

const CRITIQUE_SYSTEM_PROMPT = `Ești un critic de social media extrem de exigent, specializat în conținut financiar românesc pentru Instagram Reels.

Rolul tău: analizezi video-uri de 30-90 secunde despre economie, piețe, investiții și dai feedback DIRECT, SPECIFIC și BRUTAL DE ONEST.

## Principii fundamentale

**Nu ești politicos.** Un creator care primește feedback vag nu crește. Spui exact ce nu merge și de ce.

**Fiecare problemă are un fix concret.** Nu e suficient "hook-ul e slab" — trebuie să rescrii hook-ul exact cum ar trebui să sune.

**Citatele din transcript sunt obligatorii.** Când critici ceva, citezi textul exact din video cu timestamp.

**Benchmarks sunt cifre, nu impresii:**
- Hook eficient: contradiction/number/problem în primele 5 cuvinte, 10-25 cuvinte total
- Ritm optim: segmente de 4-8 secunde, fără pauze > 15s fără content nou
- CTA: save > share > follow ca eficiență. CTA tip "urmărește" fără motiv = cel mai slab.
- Densitate financiară: minim 3% keywords pentru conținut de nișă
- WPM: 120-160 = natural pentru română educațională, >180 = prea rapid

## Ce evaluezi în ordine

1. **HOOK (0:00 — ~0:08):** Captează atenția sau nu? Tip de hook? Ce ar funcționa mai bine?
2. **STRUCTURĂ:** Logica narativă. Există o progresie clară? Unde se pierde audiența?
3. **CTA:** Ce tip, unde e, cât de eficient. Rescrie CTA mai bun.
4. **VIZUAL vs AUDIO:** Elementele grafice suportă mesajul sau îl distrag?
5. **CONȚINUT:** Densitate informațională, unicitate, ce știe audiența deja vs. ce e nou.

## Format output

Returnezi JSON strict conform schemei. Fiecare "fix" trebuie să conțină textul exact de folosit, nu instrucțiuni vagi.

Exemple de feedback slab (NU face asta):
- "Hook-ul ar putea fi mai puternic"
- "Încearcă un CTA mai bun"

Exemple de feedback puternic (FAC asta):
- "Hook-ul 'Piețele emergente par interesante atunci când totul merge bine.' (0:00-0:04) e o platitudine clasică. Nu creezi nicio tensiune. Orice viewer financiar știe asta. FIX: 'Capitalul pleacă din piețele emergente de 3 ori mai repede decât intră. Iată mecanismul exact.' — Aceeași informație, dar cu cifră și promisiune concretă."

Limba: română cu diacritice corecte.
Returnează DOAR JSON valid. Fără markdown code fences.`;

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    overall_verdict: { type: 'string' },
    score: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: ['hook', 'structure', 'cta', 'visual', 'content'] },
          label: { type: 'string' },
          verdict: { type: 'string', enum: ['strong', 'acceptable', 'weak', 'critical'] },
          finding: { type: 'string' },
          fix: { type: 'string' },
          example_fix: { type: 'string' },
        },
        required: ['section', 'label', 'verdict', 'finding'],
      },
    },
    top_strengths: { type: 'array', items: { type: 'string' } },
    top_weaknesses: { type: 'array', items: { type: 'string' } },
    rewritten_hook: { type: 'string' },
    rewritten_cta: { type: 'string' },
    narrative_markdown: { type: 'string' },
  },
  required: [
    'overall_verdict', 'score', 'sections',
    'top_strengths', 'top_weaknesses',
    'rewritten_hook', 'rewritten_cta', 'narrative_markdown',
  ],
};

export async function generatePostCritique(input: {
  caption: string | null;
  transcript: string;
  segments: TranscriptionSegment[];
  visualDescription: string | null;
  metrics: TranscriptMetrics;
  postMetrics: {
    erByReach: number | null;
    savesPerReach: number | null;
    sendsPerReach: number | null;
    reach: number | null;
  };
  accountAvgEr: number | null;
}): Promise<PostCritique> {
  const provider = getDefaultAiProvider();

  const segmentsFormatted = input.segments
    .map(s => `${s.start}-${s.end}: "${s.text}"`)
    .join('\n');

  const userPrompt = `Analizează acest Reel de Instagram.

=== CAPTION (text din descriere) ===
${input.caption ?? '(fără caption)'}

=== TRANSCRIPT (ce se spune în video) ===
${input.transcript}

=== SEGMENTE CU TIMESTAMPS ===
${segmentsFormatted}

=== DESCRIERE VIZUALĂ ===
${input.visualDescription ?? '(nedisponibil)'}

=== METRICI CALCULATE ===
- Words per minute: ${input.metrics.wordsPerMinute} (${input.metrics.wordsPerMinuteBenchmark})
- Hook type: ${input.metrics.hookType} | Hook score: ${input.metrics.hookScore}/100
- Hook text: "${input.metrics.hookText}"
- CTA type: ${input.metrics.ctaType} | CTA position: ${input.metrics.ctaPosition} | CTA score: ${input.metrics.ctaScore}/100
- CTA text: "${input.metrics.ctaText ?? 'absent'}"
- Ritm: ${input.metrics.rhythmQuality} (avg segment ${input.metrics.avgSegmentDurationSeconds.toFixed(1)}s)
- Segment cel mai lung: ${input.metrics.longestSegmentSeconds.toFixed(1)}s — "${input.metrics.longestSegmentText.slice(0, 80)}"
- Keywords financiare: ${input.metrics.financialKeywords.length} (${(input.metrics.financialKeywordDensity * 100).toFixed(1)}% densitate)
- Keywords detectate: ${input.metrics.financialKeywords.slice(0, 10).join(', ')}
- Overall metric score: ${input.metrics.overallScore}/100

=== PERFORMANȚĂ VIDEO ===
- Engagement Rate: ${input.postMetrics.erByReach?.toFixed(2) ?? 'N/A'}% (media cont: ${input.accountAvgEr?.toFixed(2) ?? 'N/A'}%)
- Save Rate: ${input.postMetrics.savesPerReach?.toFixed(2) ?? 'N/A'}%
- Send Rate: ${input.postMetrics.sendsPerReach?.toFixed(2) ?? 'N/A'}%
- Reach: ${input.postMetrics.reach ?? 'N/A'}

Produce critica detaliată. Fii specific, dur, acționabil.
Pentru "rewritten_hook": rescrie complet primele 2 propoziții ale video-ului.
Pentru "rewritten_cta": rescrie CTA-ul cu un motiv concret pentru save sau share.`;

  const result = await provider.generate({
    systemPrompt: CRITIQUE_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxOutputTokens: 3000,
    jsonMode: true,
    responseSchema: CRITIQUE_SCHEMA,
  });

  const parsed = result.parsed as {
    overall_verdict: string;
    score: string;
    sections: Array<{
      section: string;
      label: string;
      verdict: string;
      finding: string;
      fix?: string;
      example_fix?: string;
    }>;
    top_strengths: string[];
    top_weaknesses: string[];
    rewritten_hook: string;
    rewritten_cta: string;
    narrative_markdown: string;
  };

  return {
    overallVerdict: parsed.overall_verdict,
    score: parseInt(parsed.score, 10) || 0,
    sections: parsed.sections.map(s => ({
      section: s.section as PostCritiqueSection['section'],
      label: s.label,
      verdict: s.verdict as PostCritiqueSection['verdict'],
      finding: s.finding,
      fix: s.fix ?? null,
      exampleFix: s.example_fix ?? null,
    })),
    topStrengths: parsed.top_strengths ?? [],
    topWeaknesses: parsed.top_weaknesses ?? [],
    rewrittenHook: parsed.rewritten_hook,
    rewrittenCta: parsed.rewritten_cta,
    narrativeMarkdown: parsed.narrative_markdown,
  };
}
```

---

## Deliverable 3: Server action pentru post critique

In `src/app/dashboard/analyses/actions.ts`, adaugă:

```ts
import { computeTranscriptMetrics } from '@/lib/transcription/transcript-metrics';
import { generatePostCritique } from '@/lib/transcription/post-critique';
import type { TranscriptionSegment } from '@/lib/transcription/types';

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

  // Fetch post cu transcript și metrici
  const { data: post } = await supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .eq('id', postId)
    .single();

  if (!post) return { success: false, error: 'post_not_found' };
  if (!post.transcript) return { success: false, error: 'no_transcript' };

  const segments = (post.transcript_segments ?? []) as TranscriptionSegment[];

  // Fetch account average ER pentru context
  const { data: accountPosts } = await supabase
    .from('post_metrics_snapshots')
    .select('er_by_reach')
    .in('post_id',
      await supabase.from('posts').select('id').eq('account_id', post.account_id)
        .then(r => (r.data ?? []).map((p: any) => p.id))
    )
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  const avgEr = accountPosts && accountPosts.length > 0
    ? accountPosts.reduce((s: number, p: any) => s + p.er_by_reach, 0) / accountPosts.length
    : null;

  // Compute deterministic metrics
  const metrics = computeTranscriptMetrics(
    post.transcript,
    segments,
    post.visual_description ?? null,
  );

  // Generate AI critique
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

  // Save to ai_analyses
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
        metrics,             // include computed metrics in structured output
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
```

---

## Deliverable 4: UI components

### 4.1 TranscriptMetricsCard

Create `src/components/posts/TranscriptMetricsCard.tsx`:

```tsx
import type { TranscriptMetrics } from '@/lib/transcription/transcript-metrics-types';
import { Card, Eyebrow, H3, Mono, Body } from '@/components/design-system';

interface Props {
  metrics: TranscriptMetrics;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? 'var(--color-accent-lime)'
    : score >= 50 ? 'var(--color-text-primary)'
    : 'var(--color-accent-coral)';

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Mono tone="muted" style={{ fontSize: 11 }}>{label}</Mono>
        <Mono style={{ fontSize: 11, color }}>{score}/100</Mono>
      </div>
      <div style={{
        height: 4,
        background: 'var(--color-border-default)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${score}%`,
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

export function TranscriptMetricsCard({ metrics }: Props) {
  const wpmColor = metrics.wordsPerMinuteBenchmark === 'natural'
    ? 'var(--color-accent-lime)'
    : metrics.wordsPerMinuteBenchmark === 'too_fast' || metrics.wordsPerMinuteBenchmark === 'too_slow'
    ? 'var(--color-accent-coral)'
    : 'var(--color-text-primary)';

  const hookTypeLabels: Record<string, string> = {
    contradiction: 'Contradicție ✓',
    number: 'Cifră/Statistică ✓',
    problem: 'Problemă ✓',
    question: 'Întrebare ✓',
    statement: 'Afirmație',
    platitude: 'Clișeu ✗',
  };

  const ctaTypeLabels: Record<string, string> = {
    save: 'Salvare (cel mai eficient)',
    share: 'Distribuire',
    follow: 'Urmărire',
    question: 'Întrebare',
    none: 'Absent ✗',
  };

  return (
    <Card>
      <Eyebrow tone="muted" style={{ marginBottom: 12 }}>METRICI TRANSCRIPT</Eyebrow>

      {/* Overall score */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <Mono style={{
          fontSize: 48,
          fontWeight: 700,
          color: metrics.overallScore >= 70 ? 'var(--color-accent-lime)'
            : metrics.overallScore >= 50 ? 'var(--color-text-primary)'
            : 'var(--color-accent-coral)',
        }}>
          {metrics.overallScore}
        </Mono>
        <Mono tone="muted" style={{ fontSize: 13 }}>/100 SCOR CONȚINUT</Mono>
      </div>

      {/* Score breakdown bars */}
      <div style={{ marginBottom: 20 }}>
        <ScoreBar score={metrics.scoreBreakdown.hook} label="HOOK" />
        <ScoreBar score={metrics.scoreBreakdown.cta} label="CTA" />
        <ScoreBar score={metrics.scoreBreakdown.rhythm} label="RITM" />
        <ScoreBar score={metrics.scoreBreakdown.content} label="CONȚINUT" />
      </div>

      {/* Details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* WPM */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-bg-elevated)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>VITEZA VORBIRE</Mono>
          <Mono style={{ fontSize: 20, fontWeight: 700, color: wpmColor }}>
            {metrics.wordsPerMinute}
          </Mono>
          <Mono tone="muted" style={{ fontSize: 10 }}>WPM</Mono>
        </div>

        {/* Hook type */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-bg-elevated)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>TIP HOOK</Mono>
          <Mono style={{ fontSize: 12, fontWeight: 700 }}>
            {hookTypeLabels[metrics.hookType] ?? metrics.hookType}
          </Mono>
        </div>

        {/* CTA */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-bg-elevated)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>TIP CTA</Mono>
          <Mono style={{ fontSize: 11, fontWeight: 700 }}>
            {ctaTypeLabels[metrics.ctaType] ?? metrics.ctaType}
          </Mono>
          {metrics.ctaText && (
            <Body tone="secondary" style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
              "{metrics.ctaText.slice(0, 50)}"
            </Body>
          )}
        </div>

        {/* Rhythm */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-bg-elevated)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>RITM</Mono>
          <Mono style={{ fontSize: 12, fontWeight: 700 }}>
            {metrics.rhythmQuality.toUpperCase()}
          </Mono>
          <Mono tone="muted" style={{ fontSize: 10 }}>
            avg {metrics.avgSegmentDurationSeconds.toFixed(1)}s/segment
          </Mono>
        </div>
      </div>

      {/* Hook text */}
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
        <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>
          HOOK (0:00–0:08) · {metrics.hookScoreReason}
        </Mono>
        <Body style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
          "{metrics.hookText}"
        </Body>
      </div>

      {/* Financial keywords */}
      {metrics.financialKeywords.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 6 }}>
            KEYWORDS FINANCIARE DETECTATE ({metrics.financialKeywords.length})
            · densitate {(metrics.financialKeywordDensity * 100).toFixed(1)}%
          </Mono>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {metrics.financialKeywords.slice(0, 12).map(kw => (
              <Mono
                key={kw}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 4,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {kw}
              </Mono>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
```

### 4.2 PostCritiqueSection component

Create `src/components/posts/PostCritiqueSection.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { runPostCritiqueAction } from '@/app/dashboard/analyses/actions';
import type { PostCritique, PostCritiqueSection as Section } from '@/lib/transcription/post-critique';
import { Card, Eyebrow, H3, Body, Mono } from '@/components/design-system';
import { TranscriptMetricsCard } from './TranscriptMetricsCard';
import type { TranscriptMetrics } from '@/lib/transcription/transcript-metrics-types';

interface Props {
  postId: string;
  existingCritique: PostCritique | null;
  existingMetrics: TranscriptMetrics | null;
  isAdmin: boolean;
}

export function PostCritiqueSection({ postId, existingCritique, existingMetrics, isAdmin }: Props) {
  const [critique, setCritique] = useState<PostCritique | null>(existingCritique);
  const [metrics, setMetrics] = useState<TranscriptMetrics | null>(existingMetrics);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await runPostCritiqueAction(postId);
      if (!result.success) {
        setError(result.error === 'no_transcript'
          ? 'Transcriptul nu este disponibil. Așteaptă procesarea video.'
          : 'Eroare la generarea criticii.');
        return;
      }
      // Reload page to show critique
      window.location.reload();
    });
  };

  const verdictColor = (verdict: Section['verdict']) => {
    switch (verdict) {
      case 'strong': return 'var(--color-accent-lime)';
      case 'acceptable': return 'var(--color-text-primary)';
      case 'weak': return 'var(--color-accent-coral)';
      case 'critical': return 'var(--color-accent-coral)';
    }
  };

  const verdictLabel = (verdict: Section['verdict']) => ({
    strong: '✓ PUTERNIC',
    acceptable: '~ ACCEPTABIL',
    weak: '⚠ SLAB',
    critical: '✗ CRITIC',
  }[verdict]);

  const sectionLabels: Record<string, string> = {
    hook: 'HOOK',
    structure: 'STRUCTURĂ',
    cta: 'CTA',
    visual: 'VIZUAL',
    content: 'CONȚINUT',
  };

  return (
    <section style={{ marginTop: 40 }}>
      <Eyebrow tone="muted">ANALIZĂ AI · TRANSCRIPT</Eyebrow>
      <H3>Critică Video</H3>

      {/* Transcript metrics (always shown if available) */}
      {metrics && (
        <div style={{ marginBottom: 16 }}>
          <TranscriptMetricsCard metrics={metrics} />
        </div>
      )}

      {/* No critique yet */}
      {!critique && (
        <Card>
          {isPending ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Mono tone="muted">ANALIZEZ TRANSCRIPTUL... (~20s)</Mono>
            </div>
          ) : (
            <div>
              <Body tone="secondary" style={{ marginBottom: 16 }}>
                Generează o critică detaliată a acestui Reel pe baza transcriptului.
                AI-ul analizează hook-ul, structura, CTA, și alinierea vizual-audio.
              </Body>
              {isAdmin ? (
                <button
                  onClick={handleGenerate}
                  disabled={isPending}
                  style={{
                    padding: '10px 20px',
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
                  → ANALIZEAZĂ CU AI
                </button>
              ) : (
                <Mono tone="muted" style={{ fontSize: 12 }}>
                  Analiza video e disponibilă doar pentru administrator.
                </Mono>
              )}
              {error && (
                <Mono style={{ color: 'var(--color-accent-coral)', fontSize: 12, marginTop: 8 }}>
                  ⚠ {error}
                </Mono>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Critique available */}
      {critique && (
        <div>
          {/* Overall verdict */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Eyebrow tone="muted" style={{ marginBottom: 8 }}>VERDICT GENERAL</Eyebrow>
                <Body style={{ fontSize: 16, fontStyle: 'italic' }}>
                  "{critique.overallVerdict}"
                </Body>
              </div>
              <Mono style={{
                fontSize: 32,
                fontWeight: 700,
                marginLeft: 24,
                color: critique.score >= 70 ? 'var(--color-accent-lime)'
                  : critique.score >= 50 ? 'var(--color-text-primary)'
                  : 'var(--color-accent-coral)',
              }}>
                {critique.score}<span style={{ fontSize: 14 }}>/100</span>
              </Mono>
            </div>
          </Card>

          {/* Sections */}
          {critique.sections.map(section => (
            <div
              key={section.section}
              style={{
                marginBottom: 8,
                borderLeft: `4px solid ${verdictColor(section.verdict)}`,
                paddingLeft: 16,
                paddingTop: 12,
                paddingBottom: 12,
                background: 'var(--color-bg-card)',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Mono style={{ fontSize: 12, fontWeight: 700 }}>
                  {sectionLabels[section.section] ?? section.section.toUpperCase()}
                  {section.label.includes('(') && (
                    <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>
                      {' '}· {section.label.replace(/^[A-Z\s]+/, '').trim()}
                    </span>
                  )}
                </Mono>
                <Mono style={{ fontSize: 11, color: verdictColor(section.verdict) }}>
                  {verdictLabel(section.verdict)}
                </Mono>
              </div>

              <Body style={{ fontSize: 13, marginBottom: section.fix ? 8 : 0 }}>
                {section.finding}
              </Body>

              {section.fix && (
                <div style={{ marginTop: 8 }}>
                  <Mono style={{ fontSize: 11, color: 'var(--color-accent-lime)', marginBottom: 4 }}>
                    → FIX:
                  </Mono>
                  <Body style={{ fontSize: 13 }}>{section.fix}</Body>
                </div>
              )}

              {section.exampleFix && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 4,
                  borderLeft: '2px solid var(--color-accent-lime)',
                }}>
                  <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>EXEMPLU CONCRET:</Mono>
                  <Body style={{ fontSize: 13, fontStyle: 'italic' }}>
                    "{section.exampleFix}"
                  </Body>
                </div>
              )}
            </div>
          ))}

          {/* Rewritten hook + CTA */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Card variant="positive">
              <Eyebrow tone="lime" style={{ marginBottom: 8 }}>HOOK RESCRIS DE AI</Eyebrow>
              <Body style={{ fontSize: 14, fontStyle: 'italic' }}>
                "{critique.rewrittenHook}"
              </Body>
            </Card>
            <Card variant="positive">
              <Eyebrow tone="lime" style={{ marginBottom: 8 }}>CTA RESCRIS DE AI</Eyebrow>
              <Body style={{ fontSize: 14, fontStyle: 'italic' }}>
                "{critique.rewrittenCta}"
              </Body>
            </Card>
          </div>

          {/* Top strengths + weaknesses */}
          {(critique.topStrengths.length > 0 || critique.topWeaknesses.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              {critique.topStrengths.length > 0 && (
                <Card>
                  <Eyebrow tone="lime" style={{ marginBottom: 8 }}>CE MERGE BINE</Eyebrow>
                  {critique.topStrengths.map((s, i) => (
                    <Body key={i} style={{ fontSize: 13, marginBottom: 6 }}>✓ {s}</Body>
                  ))}
                </Card>
              )}
              {critique.topWeaknesses.length > 0 && (
                <Card variant="negative">
                  <Eyebrow tone="coral" style={{ marginBottom: 8 }}>DE SCHIMBAT URGENT</Eyebrow>
                  {critique.topWeaknesses.map((w, i) => (
                    <Body key={i} style={{ fontSize: 13, marginBottom: 6, color: 'var(--color-accent-coral)' }}>
                      ✗ {w}
                    </Body>
                  ))}
                </Card>
              )}
            </div>
          )}

          {/* Full narrative */}
          <Card style={{ marginTop: 12 }}>
            <Eyebrow tone="muted" style={{ marginBottom: 8 }}>ANALIZĂ COMPLETĂ</Eyebrow>
            <Body style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', fontSize: 14 }}>
              {critique.narrativeMarkdown}
            </Body>
          </Card>

          {/* Regenerate button (admin only) */}
          {isAdmin && (
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button
                onClick={handleGenerate}
                disabled={isPending}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {isPending ? 'REGENEREZ...' : '↻ REGENEREAZĂ CRITICA'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

---

## Deliverable 5: Wire în post detail page

In `src/app/dashboard/posts/[id]/page.tsx`, adaugă:

```ts
import { computeTranscriptMetrics } from '@/lib/transcription/transcript-metrics';
import { PostCritiqueSection } from '@/components/posts/PostCritiqueSection';
import type { TranscriptionSegment } from '@/lib/transcription/types';
import type { TranscriptMetrics } from '@/lib/transcription/transcript-metrics-types';

// În page, după fetch-ul post-ului:

// Compute metrics dacă există transcript
let transcriptMetrics: TranscriptMetrics | null = null;
if (post.transcript && post.transcript_segments) {
  transcriptMetrics = computeTranscriptMetrics(
    post.transcript,
    post.transcript_segments as TranscriptionSegment[],
    post.visual_description ?? null,
  );
}

// Fetch existing critique din ai_analyses
const { data: existingCritique } = await supabase
  .from('ai_analyses')
  .select('structured_output')
  .eq('analysis_type', 'post_critique')
  .contains('structured_output', { postId: post.id })
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

const critiqueData = existingCritique?.structured_output
  ? (existingCritique.structured_output as any) as PostCritique
  : null;

// Render (după TranscriptSection):
{(post.transcript || transcriptMetrics) && (
  <PostCritiqueSection
    postId={post.id}
    existingCritique={critiqueData}
    existingMetrics={transcriptMetrics}
    isAdmin={userProfile?.role === 'admin'}
  />
)}
```

---

## Deliverable 6: Enrichment în data builders

In `src/ai/analyses/data-builders.ts`, actualizează `PostForAnalysis` și builder-ul:

```ts
// Adaugă la interfața PostForAnalysis:
transcriptMetrics: {
  wordCount: number | null;
  wordsPerMinute: number | null;
  hookType: string | null;
  hookScore: number | null;
  hookText: string | null;
  ctaType: string | null;
  ctaScore: number | null;
  rhythmQuality: string | null;
  overallScore: number | null;
} | null;
```

Când construiești obiectul, adaugă:

```ts
import { computeTranscriptMetrics } from '@/lib/transcription/transcript-metrics';

// Pentru fiecare post cu transcript:
const tMetrics = (post.transcript && post.transcript_segments)
  ? computeTranscriptMetrics(
      post.transcript,
      post.transcript_segments as TranscriptionSegment[],
      post.visual_description ?? null,
    )
  : null;

transcriptMetrics: tMetrics ? {
  wordCount: tMetrics.wordCount,
  wordsPerMinute: tMetrics.wordsPerMinute,
  hookType: tMetrics.hookType,
  hookScore: tMetrics.hookScore,
  hookText: tMetrics.hookText,
  ctaType: tMetrics.ctaType,
  ctaScore: tMetrics.ctaScore,
  rhythmQuality: tMetrics.rhythmQuality,
  overallScore: tMetrics.overallScore,
} : null,
```

Actualizează `formatPost` în weekly summary prompt să includă metricile:

```ts
${p.transcriptMetrics ? `
     Metrici transcript: WPM=${p.transcriptMetrics.wordsPerMinute}, Hook=${p.transcriptMetrics.hookType}(${p.transcriptMetrics.hookScore}/100), CTA=${p.transcriptMetrics.ctaType}(${p.transcriptMetrics.ctaScore}/100), Ritm=${p.transcriptMetrics.rhythmQuality}, Score=${p.transcriptMetrics.overallScore}/100
     Hook verbal: "${p.transcriptMetrics.hookText}"` : '     Transcript: indisponibil'}
```

Actualizează **Content Patterns system prompt** să ceară analiza pattern-urilor de transcript:

```ts
// Adaugă în CONTENT_PATTERNS_SYSTEM_PROMPT:
### TRANSCRIPT PATTERNS (pentru Reels cu transcript disponibil)
- Există corelație între hookType și ER? (contradiction/number > statement/platitude?)
- WPM optim pe audiența ta: care viteză de vorbire are ER mai bun?
- CTA save vs follow: care generează mai multe saves?
- Există video-uri cu hook slab dar ER bun? Dacă da, ce compensează?
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **Metrici compute:** navighează la un Reel în `/dashboard/posts/[id]`. Secțiunea "Metrici Transcript" afișează scor, bars, WPM, hook type, CTA info.
4. **Scor realist:** un Reel cu hook clișeu trebuie să aibă hookScore < 30. Un Reel cu hook tip contradicție > 80.
5. **WPM calculat corect:** verifică un Reel de ~200 cuvinte în ~60 secunde → WPM ≈ 200. 
```
   wordCount / (durationSeconds / 60)
```
6. **Buton "ANALIZEAZĂ CU AI"** apare pentru admin pe Reels cu transcript. Nu apare pentru viewer.
7. **Generare critică:** click pe buton. După ~15-25 secunde, critica apare cu: verdict, score, secțiuni, hook rescris, CTA rescris.
8. **Critica e specifică:** secțiunea HOOK trebuie să citeze textul exact din transcript cu timestamp. Secțiunea CTA trebuie să menționeze tipul exact detectat.
9. **Hook rescris:** `critique.rewrittenHook` e o propoziție completă în română, diferită de hook-ul original, mai puternică.
10. **CTA rescris:** `critique.rewrittenCta` e un CTA cu motiv concret (nu "urmărește #tag").
11. **Regenerare:** butonul "↻ REGENEREAZĂ CRITICA" apare sub critică existentă, generează o nouă versiune.
12. **Persistence:** refresh pagina → critica existentă se încarcă (e salvată în `ai_analyses`).
13. **Weekly Summary enriched:** generează un nou Weekly Summary. Verifică în datele trimise la Gemini (via console.log temporar) că postările Reel conțin `hookType`, `hookScore`, `transcriptMetrics`.
14. **Content Patterns enriched:** generează Content Patterns. Analiza menționează pattern-uri de hook type sau WPM corelate cu ER.
15. **Chat tool:** pune chat-ul întrebarea "Analizează hook-urile video-urilor mele". AI-ul apelează `getHookTypeAnalysis()` și include datele din transcript.

## Notes pentru Claude Code

- `computeTranscriptMetrics` e o funcție pură (nu async, nu server-only). Poate fi importată oriunde.
- `generatePostCritique` e server-only. Nu importa în client components.
- Critica e stocată în `ai_analyses` cu `analysis_type = 'post_critique'` și `structured_output.postId = postId`. Query-ul de fetch folosește `.contains('structured_output', { postId: post.id })` — JSON containment operator în Postgres/Supabase. Verifică că funcționează cu versiunea ta de Supabase client.
- `window.location.reload()` în `handleGenerate` e intenționat — cel mai simplu mod de a re-fetch server component data după o server action. Alternativa cu `router.refresh()` poate funcționa dacă există, dar reload e mai sigur.
- Scorul compus din `computeTranscriptMetrics` și scorul AI din `generatePostCritique` sunt două lucruri diferite: primul e determinist, al doilea e evaluarea AI. Ambele sunt utile și se afișează separat.
- `CRITIQUE_SCHEMA` cu `score` ca `type: 'string'` e intenționat — Gemini returnează numere ca string în JSON mode uneori. Parsăm cu `parseInt`.