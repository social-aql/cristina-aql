'use client';

import { useState, useTransition } from 'react';
import { runPostCritiqueAction } from '@/app/dashboard/analyses/actions';
import type { PostCritique, PostCritiqueSection as Section } from '@/lib/transcription/post-critique';
import { Card } from '@/components/design-system/Card';
import { Eyebrow, H3, Body, Mono } from '@/components/design-system/Typography';
import { TranscriptMetricsCard } from './TranscriptMetricsCard';
import type { TranscriptMetrics } from '@/lib/transcription/transcript-metrics-types';
import { colors } from '@/themes/platform/tokens';


interface Props {
  postId: string;
  existingCritique: PostCritique | null;
  existingMetrics: TranscriptMetrics | null;
  isAdmin: boolean;
}

export function PostCritiqueSection({ postId, existingCritique, existingMetrics, isAdmin }: Props) {
  const [critique] = useState<PostCritique | null>(existingCritique);
  const [metrics] = useState<TranscriptMetrics | null>(existingMetrics);
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
      window.location.reload();
    });
  };

  const verdictColor = (verdict: Section['verdict']) => {
    switch (verdict) {
      case 'strong': return colors.accentLime;
      case 'acceptable': return colors.textPrimary;
      case 'weak': return colors.accentCoral;
      case 'critical': return colors.accentCoral;
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
      <div style={{ marginTop: 8, marginBottom: 16 }}><H3>Critică Video</H3></div>

      {metrics && (
        <div style={{ marginBottom: 16 }}>
          <TranscriptMetricsCard metrics={metrics} />
        </div>
      )}

      {!critique && (
        <Card>
          {isPending ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Mono tone="muted">ANALIZEZ TRANSCRIPTUL... (~20s)</Mono>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <Body tone="secondary">
                  Generează o critică detaliată a acestui Reel pe baza transcriptului.
                  AI-ul analizează hook-ul, structura, CTA, și alinierea vizual-audio.
                </Body>
              </div>
              {isAdmin ? (
                <button
                  onClick={handleGenerate}
                  disabled={isPending}
                  style={{
                    padding: '10px 20px',
                    background: colors.accentLime,
                    color: colors.textInverse,
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
                <Mono tone="muted">Analiza video e disponibilă doar pentru administrator.</Mono>
              )}
              {error && (
                <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentCoral }}>
                  ⚠ {error}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {critique && (
        <div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8 }}><Eyebrow tone="muted">VERDICT GENERAL</Eyebrow></div>
                <p style={{ fontSize: 16, fontStyle: 'italic', margin: 0, color: colors.textPrimary }}>
                  &quot;{critique.overallVerdict}&quot;
                </p>
              </div>
              <span style={{
                fontSize: 32,
                fontWeight: 700,
                marginLeft: 24,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                color: critique.score >= 70 ? colors.accentLime
                  : critique.score >= 50 ? colors.textPrimary
                  : colors.accentCoral,
              }}>
                {critique.score}<span style={{ fontSize: 14 }}>/100</span>
              </span>
            </div>
          </Card>

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
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, fontWeight: 700, color: colors.textPrimary }}>
                  {sectionLabels[section.section] ?? section.section.toUpperCase()}
                  {section.label.includes('(') && (
                    <span style={{ fontWeight: 400, color: colors.textMuted }}>
                      {' '}· {section.label.replace(/^[A-Z\s]+/, '').trim()}
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: verdictColor(section.verdict) }}>
                  {verdictLabel(section.verdict)}
                </span>
              </div>

              <p style={{ fontSize: 13, margin: 0, marginBottom: section.fix ? 8 : 0, color: colors.textPrimary }}>
                {section.finding}
              </p>

              {section.fix && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: colors.accentLime, marginBottom: 4 }}>
                    → FIX:
                  </div>
                  <p style={{ fontSize: 13, margin: 0, color: colors.textPrimary }}>{section.fix}</p>
                </div>
              )}

              {section.exampleFix && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 4,
                  borderLeft: `2px solid ${colors.accentLime}`,
                }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 10, color: colors.textMuted, marginBottom: 4 }}>EXEMPLU CONCRET:</div>
                  <p style={{ fontSize: 13, fontStyle: 'italic', margin: 0, color: colors.textPrimary }}>
                    &quot;{section.exampleFix}&quot;
                  </p>
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Card variant="positive">
              <div style={{ marginBottom: 8 }}><Eyebrow tone="lime">HOOK RESCRIS DE AI</Eyebrow></div>
              <p style={{ fontSize: 14, fontStyle: 'italic', margin: 0, color: colors.textPrimary }}>
                &quot;{critique.rewrittenHook}&quot;
              </p>
            </Card>
            <Card variant="positive">
              <div style={{ marginBottom: 8 }}><Eyebrow tone="lime">CTA RESCRIS DE AI</Eyebrow></div>
              <p style={{ fontSize: 14, fontStyle: 'italic', margin: 0, color: colors.textPrimary }}>
                &quot;{critique.rewrittenCta}&quot;
              </p>
            </Card>
          </div>

          {(critique.topStrengths.length > 0 || critique.topWeaknesses.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              {critique.topStrengths.length > 0 && (
                <Card>
                  <div style={{ marginBottom: 8 }}><Eyebrow tone="lime">CE MERGE BINE</Eyebrow></div>
                  {critique.topStrengths.map((s, i) => (
                    <p key={i} style={{ fontSize: 13, marginBottom: 6, marginTop: 0, color: colors.textPrimary }}>✓ {s}</p>
                  ))}
                </Card>
              )}
              {critique.topWeaknesses.length > 0 && (
                <Card variant="negative">
                  <div style={{ marginBottom: 8 }}><Eyebrow tone="coral">DE SCHIMBAT URGENT</Eyebrow></div>
                  {critique.topWeaknesses.map((w, i) => (
                    <p key={i} style={{ fontSize: 13, marginBottom: 6, marginTop: 0, color: colors.accentCoral }}>✗ {w}</p>
                  ))}
                </Card>
              )}
            </div>
          )}

          <Card style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}><Eyebrow tone="muted">ANALIZĂ COMPLETĂ</Eyebrow></div>
            <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', fontSize: 14, margin: 0, color: colors.textPrimary }}>
              {critique.narrativeMarkdown}
            </p>
          </Card>

          {isAdmin && (
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button
                onClick={handleGenerate}
                disabled={isPending}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: `1px solid var(--color-border-default)`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  color: colors.textMuted,
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
