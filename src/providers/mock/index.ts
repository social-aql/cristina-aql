import type { SocialProvider, OAuthConfig } from '@/providers/types';
import type {
  ProviderToken,
  NormalizedAccount,
  NormalizedAccountMetrics,
  NormalizedPost,
  NormalizedPostMetrics,
  DateRange,
} from '@/lib/normalized-types';
import {
  getMockAccount,
  getMockAccountMetrics,
  getMockPosts,
  getMockPostMetrics,
} from './fixtures';

const oauth: OAuthConfig = {
  authUrl: '/api/mock/auth-complete',
  tokenUrl: '/api/mock/token',
  scopes: ['read'],
  redirectPath: '/auth/callback/mock',
  requiresPkce: false,
  isMock: true,
};

const MOCK_TOKEN: ProviderToken = {
  accessToken: 'mock-access-token-dev-only',
  refreshToken: 'mock-refresh-token-dev-only',
  scope: 'read',
};

export const mockProvider: SocialProvider = {
  id: 'mock',
  platform: 'mock',
  displayName: 'Mock Provider',
  description: 'Development mock provider — generates realistic fake data for testing the full sync and analytics pipeline without real OAuth.',
  iconUrl: null,
  oauth,

  buildAuthUrl({ state }: { state: string; redirectUri: string }): string {
    return `/api/mock/auth-complete?state=${encodeURIComponent(state)}`;
  },

  async exchangeCodeForToken(_params: { code: string; redirectUri: string }): Promise<ProviderToken> {
    return { ...MOCK_TOKEN };
  },

  async refreshToken(_token: ProviderToken): Promise<ProviderToken> {
    return { ...MOCK_TOKEN };
  },

  isTokenExpired(_token: ProviderToken): boolean {
    return false;
  },

  async listAccounts(_token: ProviderToken): Promise<NormalizedAccount[]> {
    return [getMockAccount()];
  },

  async fetchAccountMetrics(
    _token: ProviderToken,
    _accountExternalId: string,
    _range: DateRange
  ): Promise<NormalizedAccountMetrics> {
    return getMockAccountMetrics();
  },

  async listPosts(
    _token: ProviderToken,
    _accountExternalId: string,
    _range: DateRange
  ): Promise<NormalizedPost[]> {
    return getMockPosts();
  },

  async fetchPostMetrics(
    _token: ProviderToken,
    postExternalId: string
  ): Promise<NormalizedPostMetrics> {
    const map = getMockPostMetrics();
    const metrics = map.get(postExternalId);
    if (!metrics) throw new Error(`No mock metrics for post ${postExternalId}`);
    return metrics;
  },
};
