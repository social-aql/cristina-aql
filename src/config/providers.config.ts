import { mockProvider } from '@/providers/mock';
import type { SocialProvider } from '@/providers/types';

export const registeredProviders: SocialProvider[] = [
  mockProvider,
];

export const providerRegistry = new Map(
  registeredProviders.map((p) => [p.id, p])
);

export function getProvider(id: string): SocialProvider | undefined {
  return providerRegistry.get(id);
}

export function listProviders(): SocialProvider[] {
  return registeredProviders;
}
