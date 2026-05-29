// Intentionally NO 'server-only' — safe to import from Client Components,
// Server Components, and Server Actions.
import type { ProviderManifest } from '@/providers/types';
import { META_INSTAGRAM_PROVIDER_MANIFEST } from '@/providers/meta-instagram/manifest';
import { isEnabled } from '@/lib/modules';

export const PROVIDER_MANIFESTS: readonly ProviderManifest[] = [
  ...(isEnabled('metaInstagram') ? [META_INSTAGRAM_PROVIDER_MANIFEST] : []),
];

export function getProviderManifest(id: string): ProviderManifest | undefined {
  return PROVIDER_MANIFESTS.find((m) => m.id === id);
}

export function listProviderManifests(): readonly ProviderManifest[] {
  return PROVIDER_MANIFESTS;
}
