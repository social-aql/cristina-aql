'use client';

import React, { useTransition, useState } from 'react';
import { syncAccountAction } from '@/app/dashboard/accounts/actions';
import { colors } from '@/themes/platform/tokens';

interface Props {
  accountId: string;
}

export function SyncAccountButton({ accountId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSync() {
    setFeedback(null);
    startTransition(async () => {
      const result = await syncAccountAction(accountId);
      if (result.success) {
        setFeedback({ ok: true, msg: `Sincronizat: ${result.postsCount} postări` });
      } else {
        setFeedback({ ok: false, msg: result.error });
      }
      setTimeout(() => setFeedback(null), 4000);
    });
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {feedback && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 10,
            color: feedback.ok ? colors.accentLime : colors.accentCoral,
          }}
        >
          {feedback.msg}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={isPending}
        style={{
          background: 'none',
          border: 'none',
          cursor: isPending ? 'default' : 'pointer',
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: isPending ? colors.textMuted : colors.accentLime,
          padding: '0 4px',
          flexShrink: 0,
        }}
      >
        {isPending ? 'SYNC...' : '↻ SYNC'}
      </button>
    </span>
  );
}
