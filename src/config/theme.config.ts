import { platformTheme } from '@/themes/platform';

export const themes = {
  platform: platformTheme,
} as const;

export type ThemeId = keyof typeof themes;

export const activeThemeId: ThemeId = 'platform';

export const activeTheme = themes[activeThemeId];
