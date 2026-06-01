export type HookType =
  | 'question'
  | 'problem'
  | 'number'
  | 'contradiction'
  | 'statement'
  | 'platitude';

export type CtaType =
  | 'save'
  | 'follow'
  | 'share'
  | 'question'
  | 'none';

export type CtaPosition = 'early' | 'middle' | 'end' | 'absent';

export type RhythmQuality = 'excellent' | 'good' | 'uneven' | 'monotone';

export interface TranscriptMetrics {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  wordsPerMinuteBenchmark: 'too_slow' | 'natural' | 'fast' | 'too_fast';

  hookText: string;
  hookWordCount: number;
  hookType: HookType;
  hookScore: number;
  hookScoreReason: string;

  hasCta: boolean;
  ctaType: CtaType;
  ctaText: string | null;
  ctaPosition: CtaPosition;
  ctaScore: number;

  segmentCount: number;
  avgSegmentDurationSeconds: number;
  rhythmQuality: RhythmQuality;
  rhythmScore: number;
  longestSegmentSeconds: number;
  longestSegmentText: string;

  financialKeywords: string[];
  financialKeywordDensity: number;
  conceptsIntroduced: number;

  hasOnScreenText: boolean;
  hasCallToAction: boolean;
  visualCtaMatchesAudioCta: boolean;

  overallScore: number;
  scoreBreakdown: {
    hook: number;
    cta: number;
    rhythm: number;
    content: number;
  };
}
