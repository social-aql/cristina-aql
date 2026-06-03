'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncAccountAction } from '@/app/dashboard/accounts/actions';
import { Body, Mono, H3 } from '@/components/design-system';

interface Props {
  accountId: string;
  accountHandle: string;
  onClose: () => void;
}

export function ConnectSuccessModal({ accountId, accountHandle, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [syncStarted, setSyncStarted] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const router = useRouter();

  const handleSyncNow = () => {
    startTransition(async () => {
      setSyncStarted(true);
      try {
        await syncAccountAction(accountId);
        onClose();
        router.refresh();
      } catch {
        setSyncError(true);
      }
    });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 8,
        padding: 32,
        maxWidth: 440,
        width: '90%',
      }}>
        <div style={{ marginBottom: 20 }}>
          <Mono style={{
            fontSize: 11,
            color: 'var(--color-accent-lime)',
            letterSpacing: '0.1em',
            marginBottom: 8,
            display: 'block',
          }}>
            ✓ CONT CONECTAT
          </Mono>
          <H3>@{accountHandle}</H3>
        </div>

        <Body tone="secondary" style={{ marginBottom: 24, fontSize: 14 }}>
          Contul a fost conectat cu succes. Pentru a vedea postările
          și metricile, trebuie să faci un sync cu Instagram.
          Sync-ul poate dura 1-2 minute.
        </Body>

        {syncStarted && isPending && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--color-bg-card)',
            borderLeft: '3px solid var(--color-accent-lime)',
            borderRadius: '0 4px 4px 0',
            marginBottom: 20,
          }}>
            <Mono style={{ fontSize: 12, color: 'var(--color-accent-lime)' }}>
              ⟳ SYNC ÎN CURS... (poate dura 1-2 minute)
            </Mono>
          </div>
        )}

        {syncError && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--color-bg-card)',
            borderLeft: '3px solid var(--color-accent-warning, #f59e0b)',
            borderRadius: '0 4px 4px 0',
            marginBottom: 20,
          }}>
            <Mono style={{ fontSize: 12, color: 'var(--color-accent-warning, #f59e0b)' }}>
              Sync în curs în background. Reîncarcă pagina în câteva minute.
            </Mono>
          </div>
        )}

        {!syncStarted && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleSyncNow}
              disabled={isPending}
              style={{
                flex: 1,
                padding: '12px 20px',
                background: 'var(--color-accent-lime)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              → SYNC ACUM
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 20px',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              MAI TÂRZIU
            </button>
          </div>
        )}

        {syncStarted && !isPending && (
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 20px',
              background: syncError ? 'transparent' : 'var(--color-accent-lime)',
              color: syncError ? 'var(--color-text-secondary)' : '#000',
              border: syncError ? '1px solid var(--color-border-default)' : 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {syncError ? 'ÎNCHIDE' : '✓ GATA'}
          </button>
        )}

        {!syncStarted && (
          <Mono tone="muted" style={{ fontSize: 10, marginTop: 16, display: 'block' }}>
            Poți face sync oricând din pagina Conturi → butonul Sync.
          </Mono>
        )}
      </div>
    </div>
  );
}
