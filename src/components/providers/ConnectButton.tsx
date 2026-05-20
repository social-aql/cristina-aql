'use client';

import React, { useTransition } from 'react';
import { Button } from '@/components/design-system/Button';
import { connectMockProvider } from '@/app/(dashboard)/accounts/actions';
import type { SocialProvider } from '@/providers/types';

interface ConnectButtonProps {
  provider: SocialProvider;
}

export function ConnectButton({ provider }: ConnectButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (provider.oauth.isMock) {
      startTransition(async () => {
        await connectMockProvider();
      });
    } else {
      // Real OAuth — redirect to provider auth URL
      const url = provider.buildAuthUrl({
        state: Math.random().toString(36).substring(2),
        redirectUri: `${window.location.origin}${provider.oauth.redirectPath}`,
      });
      window.location.href = url;
    }
  }

  return (
    <Button variant="primary" onClick={handleClick} loading={isPending}>
      → CONECTEAZĂ
    </Button>
  );
}
