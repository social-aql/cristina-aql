import forkConfig from '../../../fork-config';

const t = forkConfig.theme;

export const colors = {
  // Surfaces
  bg: t.bgBase,
  bgElevated: t.bgElevated,
  bgCard: t.bgCard,
  bgCardPositive: t.bgCardPositive,
  bgCardNegative: t.bgCardNegative,
  bgCardNeutral: t.bgCard,

  // Text
  textPrimary: t.textPrimary,
  textSecondary: t.textSecondary,
  textMuted: t.textMuted,
  textInverse: '#000000',

  // Accents — fork-config accentPrimary maps to lime, accentSecondary maps to coral
  accentLime: t.accentPrimary,
  accentLimeDim: t.accentPrimaryDim,
  accentCoral: t.accentSecondary,
  accentCoralDim: t.accentSecondaryDim,
  accentAmber: '#D4890A',

  // Borders
  borderDefault: t.borderDefault,
  borderPositive: t.borderPositive,
  borderNegative: t.borderNegative,
} as const;

export type Colors = typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  fontDisplay: 'var(--font-league-spartan), sans-serif',
  fontBody: 'var(--font-inter), sans-serif',
  fontMono: 'var(--font-jetbrains-mono), monospace',
} as const;
