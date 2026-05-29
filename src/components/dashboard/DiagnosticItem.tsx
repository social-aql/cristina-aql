import React from 'react';
import Link from 'next/link';
import type { DiagnosticFlag } from '@/lib/dashboard/data';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface DiagnosticItemProps {
  flag: DiagnosticFlag;
}

const SEVERITY_COLOR: Record<DiagnosticFlag['severity'], string> = {
  critical: colors.accentCoral,
  warning: colors.accentAmber,
  info: colors.textMuted,
};

const SEVERITY_LABEL: Record<DiagnosticFlag['severity'], string> = {
  critical: 'CRITIC',
  warning: 'ATENȚIE',
  info: 'INFO',
};

export function DiagnosticItem({ flag }: DiagnosticItemProps) {
  const barColor = SEVERITY_COLOR[flag.severity];
  const severityColor = SEVERITY_COLOR[flag.severity];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: colors.bgCard,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${colors.borderDefault}`,
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          width: 4,
          flexShrink: 0,
          background: barColor,
        }}
      />
      {/* Content */}
      <div
        style={{
          padding: '12px 16px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* Row 1: category + severity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              textTransform: 'uppercase' as const,
              color: colors.textMuted,
              letterSpacing: '0.06em',
            }}
          >
            {flag.category.replace(/_/g, ' ')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              textTransform: 'uppercase' as const,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: severityColor,
            }}
          >
            {SEVERITY_LABEL[flag.severity]}
          </span>
        </div>

        {/* Row 2: title */}
        <div
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 13,
            fontWeight: 700,
            color: colors.textPrimary,
          }}
        >
          {flag.title}
        </div>

        {/* Row 3: detail */}
        <div
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          {flag.detail}
        </div>

        {/* Row 4: affected posts link */}
        {flag.affectedPostIds.length > 0 && (
          <Link
            href={`/dashboard/posts?ids=${flag.affectedPostIds.join(',')}`}
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.accentLime,
              textDecoration: 'none',
            }}
          >
            {`→ ${flag.affectedPostIds.length} postări afectate`}
          </Link>
        )}

        {/* Row 5: benchmark */}
        {flag.benchmark && (
          <div
            style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            BENCHMARK: {flag.benchmark}
          </div>
        )}
      </div>
    </div>
  );
}
