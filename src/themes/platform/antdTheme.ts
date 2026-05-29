import { theme } from 'antd';
import type { ThemeConfig } from 'antd';
import forkConfig from '../../../fork-config';
import { colors } from './tokens';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.accentLime,
    colorBgBase: colors.bg,
    colorBgContainer: colors.bgCard,
    colorBgElevated: colors.bgElevated,
    colorText: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    colorBorder: colors.borderDefault,
    colorError: colors.accentCoral,
    colorSuccess: colors.accentLime,
    colorWarning: colors.accentCoral,
    borderRadius: forkConfig.theme.borderRadius,
    borderRadiusLG: forkConfig.theme.borderRadius,
    borderRadiusSM: forkConfig.theme.borderRadiusSm,
    boxShadow: 'none',
    boxShadowSecondary: 'none',
    boxShadowTertiary: 'none',
    fontFamily: 'var(--font-inter), sans-serif',
    fontSize: 14,
    wireframe: false,
  },
  algorithm: theme.darkAlgorithm,
  components: {
    Button: {
      controlHeight: 44,
      controlHeightLG: 52,
      controlHeightSM: 32,
      fontWeight: 600,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },
    Card: {
      colorBgContainer: colors.bgCard,
      headerBg: 'transparent',
    },
    Input: {
      activeShadow: 'none',
      errorActiveShadow: 'none',
      warningActiveShadow: 'none',
    },
    Tag: {
      defaultBg: 'transparent',
    },
  },
};
