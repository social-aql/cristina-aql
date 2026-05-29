'use client';

import React from 'react';
import { Button as AntButton } from 'antd';
import type { ButtonProps as AntButtonProps } from 'antd';
import { colors } from '@/themes/platform/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<AntButtonProps, 'type' | 'danger' | 'variant'> {
  variant?: Variant;
}

const baseStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  border: 'none',
  boxShadow: 'none',
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: colors.accentLime,
    color: colors.textInverse,
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: colors.accentLime,
    border: `1px solid ${colors.accentLime}`,
  },
  ghost: {
    background: 'transparent',
    color: colors.textPrimary,
    border: 'none',
  },
  danger: {
    background: colors.accentCoral,
    color: colors.textInverse,
    border: 'none',
  },
};

export function Button({ variant = 'primary', style, ...props }: ButtonProps) {
  return (
    <AntButton
      {...props}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...style,
      }}
    />
  );
}
