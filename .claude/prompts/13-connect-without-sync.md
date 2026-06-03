# AI LICHIDITATE — Prompt 13: Decouplează Connect de Sync

## Context

La conectarea unui cont Instagram, aplicația rulează `syncAccount()`
imediat în callback — ceea ce durează 30-60 secunde și poate timeout.
Conectarea trebuie să fie instantanee. Sync-ul trebuie să fie explicit,
declanșat de user.

## SCOPE BOUNDARY

Modifică DOAR:
1. `src/app/(auth)/auth/callback/meta/route.ts` — elimină syncAccount()
2. `src/app/dashboard/accounts/page.tsx` — afișează modal după conectare
3. `src/components/providers/ConnectSuccessModal.tsx` — modal nou (simplu)

## DO NOT TOUCH

- syncAccount() logic — neatins
- Meta OAuth flow — neatins
- Toate celelalte pagini

---

## Deliverable 1: Callback route — elimină sync

În `src/app/(auth)/auth/callback/meta/route.ts`, găsește apelul la
`syncAccount()` sau orice trigger de sync și **elimină-l complet**.

Callback-ul trebuie să facă DOAR:
1. Validează OAuth code
2. Fetch access token de la Meta
3. Fetch basic account info (username, follower count)
4. Salvează contul în DB cu `status = 'active'`
5. Redirect la `/dashboard/accounts?connected={accountId}`

```ts
// La final, în loc de:
// await syncAccount(account.id);  ← ȘTERGE ASTA
// redirect('/dashboard/accounts');

// Pune:
redirect(`/dashboard/accounts?connected=${account.id}`);
```

Dacă există și inserarea de transcription jobs în callback —
**elimină și asta**. Transcription jobs se inserează la sync, nu la connect.

---

## Deliverable 2: Modal component

Create `src/components/providers/ConnectSuccessModal.tsx` (Client Component):

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncAccountAction } from '@/app/dashboard/accounts/actions';
import { Body, Mono, H3, Eyebrow } from '@/components/design-system';

interface Props {
  accountId: string;
  accountHandle: string;
  onClose: () => void;
}

export function ConnectSuccessModal({ accountId, accountHandle, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [syncStarted, setSyncStarted] = useState(false);
  const router = useRouter();

  const handleSyncNow = () => {
    startTransition(async () => {
      setSyncStarted(true);
      await syncAccountAction(accountId);
      onClose();
      router.refresh();
    });
  };

  const handleLater = () => {
    onClose();
  };

  return (
    // Overlay
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      {/* Modal box */}
      <div style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 8,
        padding: 32,
        maxWidth: 440,
        width: '90%',
      }}>
        {/* Header */}
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
          <H3 style={{ margin: 0 }}>@{accountHandle}</H3>
        </div>

        <Body tone="secondary" style={{ marginBottom: 24, fontSize: 14 }}>
          Contul a fost conectat cu succes. Pentru a vedea postările
          și metricile, trebuie să faci un sync cu Instagram.
          Sync-ul poate dura 1-2 minute.
        </Body>

        {/* Sync status */}
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

        {/* Buttons */}
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
              onClick={handleLater}
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

        {/* After sync started, show only close */}
        {syncStarted && !isPending && (
          <button
            onClick={onClose}
            style={{
              width: '100%',
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
            ✓ GATA
          </button>
        )}

        {/* Later note */}
        {!syncStarted && (
          <Mono tone="muted" style={{ fontSize: 10, marginTop: 16, display: 'block' }}>
            Poți face sync oricând din pagina Conturi → butonul Sync.
          </Mono>
        )}
      </div>
    </div>
  );
}
```

---

## Deliverable 3: Accounts page — detectează ?connected și afișează modal

În `src/app/dashboard/accounts/page.tsx`, adaugă:

```tsx
// Server component — citește searchParams
interface Props {
  searchParams: Promise<{ connected?: string }>;
}

export default async function AccountsPage({ searchParams }: Props) {
  const params = await searchParams;
  const newlyConnectedId = params.connected ?? null;

  // Dacă există ?connected=, fetch account handle pentru modal
  let newlyConnectedAccount: { id: string; handle: string } | null = null;
  if (newlyConnectedId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('accounts')
      .select('id, handle, display_name')
      .eq('id', newlyConnectedId)
      .single();

    if (data) {
      newlyConnectedAccount = {
        id: data.id,
        handle: data.handle ?? data.display_name,
      };
    }
  }

  // ... rest of existing fetches ...

  return (
    <div>
      {/* Modal apare dacă tocmai s-a conectat un cont */}
      {newlyConnectedAccount && (
        <ConnectSuccessModalWrapper account={newlyConnectedAccount} />
      )}

      {/* ... rest of existing UI ... */}
    </div>
  );
}
```

Creează `ConnectSuccessModalWrapper` ca un simplu Client Component
care gestionează starea open/closed a modalului:

```tsx
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
        // Curăță ?connected din URL fără page reload
        router.replace('/dashboard/accounts', { scroll: false });
      }}
    />
  );
}
```

---

## Verification checklist

1. `pnpm build` succeeds
2. **Connect flow rapid:** click Connect Instagram → OAuth → callback → redirect
   la `/dashboard/accounts?connected=...` în **sub 3 secunde** (fără sync).
3. **Modal apare:** pagina `/dashboard/accounts` cu `?connected=...` afișează
   modalul cu handle-ul corect.
4. **"Sync acum":** click → sync rulează → loading indicator → la final
   modal se închide și pagina se actualizează cu postările.
5. **"Mai târziu":** click → modal dispare → contul apare în listă fără postări.
6. **URL curățat:** după închiderea modalului, URL devine `/dashboard/accounts`
   fără `?connected=`.
7. **Sync manual funcționează:** butonul Sync de pe contul conectat funcționează
   normal după ce dai "Mai târziu".
8. **Re-vizitare fără modal:** dacă navighezi manual la `/dashboard/accounts`
   (fără `?connected=`), modalul nu apare.

## Notes

- `syncAccountAction` în modal rulează **în foreground** — user vede loading.
  Asta e intenționat: userul a ales explicit să facă sync acum și vrea să știe
  când e gata. Nu e nevoie de background processing aici.
- Dacă sync durează > 60s și Vercel timeout-uiește, afișezi un mesaj:
  "Sync în curs în background. Reîncarcă pagina în câteva minute."
  Adaugă un catch pe `syncAccountAction` în modal pentru asta.
- Nu șterge sync-ul din alte locuri — butonul manual de sync de pe accounts
  page rămâne neschimbat.