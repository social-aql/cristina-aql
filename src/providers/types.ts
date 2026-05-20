import type {
  DateRange,
  NormalizedAccount,
  NormalizedAccountMetrics,
  NormalizedPost,
  NormalizedPostMetrics,
  Platform,
  ProviderToken,
} from '@/lib/normalized-types';

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectPath: string;
  requiresPkce: boolean;
  isMock?: boolean;
}

export interface SocialProvider {
  readonly id: string;
  readonly platform: Platform;
  readonly displayName: string;
  readonly description: string;
  readonly iconUrl: string | null;
  readonly oauth: OAuthConfig;

  buildAuthUrl(params: { state: string; redirectUri: string }): string;
  exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<ProviderToken>;
  refreshToken(token: ProviderToken): Promise<ProviderToken>;
  isTokenExpired(token: ProviderToken): boolean;

  listAccounts(token: ProviderToken): Promise<NormalizedAccount[]>;
  fetchAccountMetrics(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedAccountMetrics>;
  listPosts(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedPost[]>;
  fetchPostMetrics(
    token: ProviderToken,
    postExternalId: string
  ): Promise<NormalizedPostMetrics>;
}
