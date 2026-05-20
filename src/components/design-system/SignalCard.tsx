'use client';

import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow } from './Typography';

interface SignalCardProps {
  eyebrow: string;
  eyebrowTone: 'lime' | 'coral';
  title: string;
  description: React.ReactNode;
  trend: 'up' | 'down';
}

export function SignalCard({ eyebrow, eyebrowTone, title, description, trend }: SignalCardProps) {
  const bgColor = eyebrowTone === 'lime' ? colors.bgCardPositive : colors.bgCardNegative;
  const borderColor = eyebrowTone === 'lime' ? colors.borderPositive : colors.borderNegative;
  const trendSymbol = trend === 'up' ? '↑' : '↓';
  const trendColor = trend === 'up' ? colors.accentLime : colors.accentCoral;

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Eyebrow row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 18,
            fontWeight: 700,
            color: trendColor,
          }}
        >
          {trendSymbol}
        </span>
      </div>
      {/* Title */}
      <div
        style={{
          fontFamily: 'var(--font-league-spartan), sans-serif',
          fontSize: 32,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          color: colors.textPrimary,
          lineHeight: 1,
        }}
      >
        {title}
      </div>
      {/* Description */}
      <div
        style={{
          fontFamily: 'var(--font-inter), sans-serif',
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
    </div>
  );
}
