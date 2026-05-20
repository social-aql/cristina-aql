'use client';

import React from 'react';
import { Tag as AntTag } from 'antd';
import type { TagProps as AntTagProps } from 'antd';
import { colors } from '@/themes/ai-lichiditate/tokens';

type Variant = 'lime' | 'coral' | 'muted';

interface TagProps extends Omit<AntTagProps, 'color'> {
  variant?: Variant;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  lime: {
    background: 'transparent',
    border: `1px solid ${colors.accentLime}`,
    color: colors.accentLime,
  },
  coral: {
    background: 'transparent',
    border: `1px solid ${colors.accentCoral}`,
    color: colors.accentCoral,
  },
  muted: {
    background: 'transparent',
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textSecondary,
  },
};

export function Tag({ variant = 'muted', style, ...props }: TagProps) {
  return (
    <AntTag
      {...props}
      style={{
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderRadius: 4,
        padding: '2px 8px',
        ...variantStyles[variant],
        ...style,
      }}
    />
  );
}
