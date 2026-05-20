import { aiLichiditateTheme } from '@/themes/ai-lichiditate';

export const themes = {
  'ai-lichiditate': aiLichiditateTheme,
} as const;

export type ThemeId = keyof typeof themes;

export const activeThemeId: ThemeId = 'ai-lichiditate';

export const activeTheme = themes[activeThemeId];
