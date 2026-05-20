'use client';

import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow } from './Typography';

type Tone = 'lime' | 'coral' | 'primary';

interface StatisticProps {
  value: string | number;
  unit?: string;
  label?: string;
  tone?: Tone;
}

const toneColor: Record<Tone, string> = {
  lime: colors.accentLime,
  coral: colors.accentCoral,
  primary: colors.textPrimary,
};

export function Statistic({ value, unit, label, tone = 'primary' }: StatisticProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <Eyebrow>{label}</Eyebrow>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 1,
            color: toneColor[tone],
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 16,
              fontWeight: 400,
              color: colors.textSecondary,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
