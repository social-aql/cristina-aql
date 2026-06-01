'use client';

import React from 'react';
import Link from 'next/link';
import { colors } from '@/themes/platform/tokens';
import { Mono, Eyebrow } from '@/components/design-system/Typography';
import type { AnalysisType, WeeklySummaryOutput, ContentPatternsOutput, ContentIdeationOutput } from '@/ai/analyses/types';

const TYPE_LABELS: Record<AnalysisType, string> = {
  weekly_summary: 'SUMAR SĂPTĂMÂNAL',
  content_patterns: 'TIPARE CONȚINUT',
  content_ideation: 'IDEI CONȚINUT',
  post_critique: 'CRITICĂ POST',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const rel = mins < 1 ? 'acum' : mins < 60 ? `${mins}m` : Math.floor(mins / 60) < 24 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}z`;
  const date = d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time} · ${rel}`;
}

function extractHeadline(analysisType: string, structured: unknown): string | null {
  if (!structured || typeof structured !== 'object') return null;
  const s = structured as Record<string, unknown>;
  if (analysisType === 'post_critique') {
    return typeof s.overallVerdict === 'string' ? s.overallVerdict : null;
  }
  return typeof s.headline === 'string' ? s.headline : null;
}

interface Props {
  id: string;
  analysisType: AnalysisType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  structuredOutput: unknown;
  errorMessage: string | null;
}

export function AnalysisCard({ id, analysisType, status, createdAt, structuredOutput, errorMessage }: Props) {
  const headline = extractHeadline(analysisType, structuredOutput);

  const statusColor =
    status === 'completed'
      ? colors.accentLime
      : status === 'failed'
      ? colors.accentCoral
      : colors.textMuted;

  return (
    <Link href={`/dashboard/analyses/${id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = colors.borderPositive;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = colors.borderDefault;
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Eyebrow tone="lime">{TYPE_LABELS[analysisType] ?? analysisType}</Eyebrow>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 10,
                color: statusColor,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {status === 'running' ? '⬤ ÎN CURS...' : status.toUpperCase()}
            </span>
            <span suppressHydrationWarning style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: colors.textMuted }}>{formatDateTime(createdAt)}</span>
          </div>
        </div>

        {headline ? (
          <span
            style={{
              fontFamily: 'var(--font-league-spartan), sans-serif',
              fontSize: 16,
              fontWeight: 700,
              color: colors.textPrimary,
              lineHeight: 1.3,
              textTransform: 'uppercase',
            }}
          >
            {headline}
          </span>
        ) : status === 'failed' ? (
          <Mono tone="coral">{errorMessage ?? 'Analiză eșuată'}</Mono>
        ) : null}
      </div>
    </Link>
  );
}
