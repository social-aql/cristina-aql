export const colors = {
  // Surfaces
  bg: '#000000',
  bgElevated: '#0F0F0F',
  bgCard: '#141414',

  // Tinted card surfaces (semantic)
  bgCardPositive: '#0E1A06',
  bgCardNegative: '#1A0908',
  bgCardNeutral: '#141414',

  // Text
  textPrimary: '#F2EFE4',
  textSecondary: '#8A8A8A',
  textMuted: '#5A5A5A',
  textInverse: '#000000',

  // Brand / semantic
  accentLime: '#C7F84C',
  accentLimeDim: '#7A9A2E',
  accentCoral: '#FF5A4E',
  accentCoralDim: '#8C2F28',
  accentAmber: '#D4890A',

  // Borders
  borderDefault: '#262626',
  borderPositive: '#3A5C0F',
  borderNegative: '#5C1F1A',
} as const;

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
