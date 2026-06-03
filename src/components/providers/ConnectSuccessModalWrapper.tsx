'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectSuccessModal } from '@/components/providers/ConnectSuccessModal';

interface Props {
  account: { id: string; handle: string };
}

export function ConnectSuccessModalWrapper({ account }: Props) {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  if (!open) return null;

  return (
    <ConnectSuccessModal
      accountId={account.id}
      accountHandle={account.handle}
      onClose={() => {
        setOpen(false);
        router.replace('/dashboard/accounts', { scroll: false });
      }}
    />
  );
}
