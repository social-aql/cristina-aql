import forkConfig from '../../fork-config';

export const appConfig = {
  name: forkConfig.app.name,
  tagline: forkConfig.app.tagline,
  handle: forkConfig.app.handle,
  locale: forkConfig.app.locale,
  defaultDateRangeDays: forkConfig.app.defaultDateRangeDays,
  features: forkConfig.modules,
} as const;

export type AppConfig = typeof appConfig;
