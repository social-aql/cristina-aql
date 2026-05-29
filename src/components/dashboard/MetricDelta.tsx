import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface MetricDeltaProps {
  current: number | null;
  previous: number | null;
  format?: 'percent' | 'number' | 'count';
  invertColors?: boolean;
}

export function MetricDelta({
  current,
  previous,
  format = 'percent',
  invertColors = false,
}: MetricDeltaProps) {
  if (current == null || previous == null || previous === 0) {
    return (
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 12,
          color: colors.textMuted,
        }}
      >
        —
      </span>
    );
  }

  const delta = ((current - previous) / previous) * 100;

  let color: string;
  if (delta > 1) {
    color = invertColors ? colors.accentCoral : colors.accentLime;
  } else if (delta < -1) {
    color = invertColors ? colors.accentLime : colors.accentCoral;
  } else {
    color = colors.textMuted;
  }

  let text: string;
  const sign = delta >= 0 ? '+' : '';
  if (format === 'percent') {
    text = `${sign}${delta.toFixed(1)}%`;
  } else if (format === 'count') {
    const abs = Math.round((current - previous));
    text = `${abs >= 0 ? '+' : ''}${abs}`;
  } else {
    const diff = current - previous;
    text = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;
  }

  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 12,
        color,
      }}
    >
      {text}
    </span>
  );
}
