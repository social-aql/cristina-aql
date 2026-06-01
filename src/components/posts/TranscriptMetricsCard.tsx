import type { TranscriptMetrics } from '@/lib/transcription/transcript-metrics-types';
import { Card } from '@/components/design-system/Card';
import { Eyebrow, Body, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/platform/tokens';

interface Props {
  metrics: TranscriptMetrics;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? colors.accentLime
    : score >= 50 ? colors.textPrimary
    : colors.accentCoral;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: colors.textMuted }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color }}>{score}/100</span>
      </div>
      <div style={{ height: 4, background: 'var(--color-border-default)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

export function TranscriptMetricsCard({ metrics }: Props) {
  const wpmColor = metrics.wordsPerMinuteBenchmark === 'natural'
    ? colors.accentLime
    : metrics.wordsPerMinuteBenchmark === 'too_fast' || metrics.wordsPerMinuteBenchmark === 'too_slow'
    ? colors.accentCoral
    : colors.textPrimary;

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

  const overallColor = metrics.overallScore >= 70 ? colors.accentLime
    : metrics.overallScore >= 50 ? colors.textPrimary
    : colors.accentCoral;

  return (
    <Card>
      <div style={{ marginBottom: 12 }}><Eyebrow tone="muted">METRICI TRANSCRIPT</Eyebrow></div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 48, fontWeight: 700, color: overallColor }}>
          {metrics.overallScore}
        </span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 13, color: colors.textMuted }}>
          /100 SCOR CONȚINUT
        </span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <ScoreBar score={metrics.scoreBreakdown.hook} label="HOOK" />
        <ScoreBar score={metrics.scoreBreakdown.cta} label="CTA" />
        <ScoreBar score={metrics.scoreBreakdown.rhythm} label="RITM" />
        <ScoreBar score={metrics.scoreBreakdown.content} label="CONȚINUT" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, marginBottom: 4 }}>VITEZA VORBIRE</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: wpmColor }}>{metrics.wordsPerMinute}</div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted }}>WPM</div>
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, marginBottom: 4 }}>TIP HOOK</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textPrimary }}>
            {hookTypeLabels[metrics.hookType] ?? metrics.hookType}
          </div>
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, marginBottom: 4 }}>TIP CTA</div>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textPrimary }}>
            {ctaTypeLabels[metrics.ctaType] ?? metrics.ctaType}
          </div>
          {metrics.ctaText && (
            <div style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic', color: colors.textSecondary }}>
              &quot;{metrics.ctaText.slice(0, 50)}&quot;
            </div>
          )}
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, marginBottom: 4 }}>RITM</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textPrimary }}>
            {metrics.rhythmQuality.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted }}>
            avg {metrics.avgSegmentDurationSeconds.toFixed(1)}s/segment
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, marginBottom: 4 }}>
          HOOK (0:00–0:08) · {metrics.hookScoreReason}
        </div>
        <p style={{ fontSize: 13, fontStyle: 'italic', color: colors.textSecondary, margin: 0 }}>
          &quot;{metrics.hookText}&quot;
        </p>
      </div>

      {metrics.financialKeywords.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, marginBottom: 6 }}>
            KEYWORDS FINANCIARE DETECTATE ({metrics.financialKeywords.length}) · densitate {(metrics.financialKeywordDensity * 100).toFixed(1)}%
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {metrics.financialKeywords.slice(0, 12).map(kw => (
              <span
                key={kw}
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  padding: '2px 6px',
                  background: 'var(--color-bg-card)',
                  border: `1px solid var(--color-border-default)`,
                  borderRadius: 4,
                  color: colors.textSecondary,
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
