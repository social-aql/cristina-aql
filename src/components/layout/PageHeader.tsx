'use client';

import React from 'react';
import { Eyebrow, H1 } from '@/components/design-system/Typography';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface PageHeaderProps {
  eyebrow: string;
  headline: string;
  accentText?: string;
  accentTone?: 'lime' | 'coral';
  subhead?: React.ReactNode;
}

export function PageHeader({ eyebrow, headline, accentText, accentTone = 'lime', subhead }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        paddingBottom: 48,
        borderBottom: `1px solid ${colors.borderDefault}`,
        marginBottom: 48,
      }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <H1
        accent={accentText ? { text: accentText, tone: accentTone } : undefined}
      >
        {headline}
      </H1>
      {subhead && (
        <div style={{ marginTop: 8 }}>{subhead}</div>
      )}
    </div>
  );
}
