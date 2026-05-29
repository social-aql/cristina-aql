'use client';

import React from 'react';
import { Card as AntCard } from 'antd';
import type { CardProps as AntCardProps } from 'antd';
import { colors } from '@/themes/platform/tokens';

type Variant = 'default' | 'positive' | 'negative';

interface CardProps extends Omit<AntCardProps, 'variant'> {
  variant?: Variant;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  default: {
    background: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
  },
  positive: {
    background: colors.bgCardPositive,
    border: `1px solid ${colors.borderPositive}`,
  },
  negative: {
    background: colors.bgCardNegative,
    border: `1px solid ${colors.borderNegative}`,
  },
};

export function Card({ variant = 'default', style, ...props }: CardProps) {
  return (
    <AntCard
      {...props}
      style={{
        ...variantStyles[variant],
        borderRadius: 6,
        boxShadow: 'none',
        ...style,
      }}
    />
  );
}
