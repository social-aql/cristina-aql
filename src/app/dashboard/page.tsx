import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { Card } from '@/components/design-system/Card';
import { DataRow } from '@/components/design-system/DataRow';

function relativeTime(isoString: string | null): string {
  if (!isoString) return 'Nicio sincronizare încă';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Acum';
  if (mins < 60) return `Acum ${mins} minut${mins === 1 ? '' : 'e'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Acum ${hrs} or${hrs === 1 ? 'ă' : 'e'}`;
  const days = Math.floor(hrs / 24);
  return `Acum ${days} zi${days === 1 ? '' : 'le'}`;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status, last_sync_at, last_sync_error')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const hasAccounts = (accounts?.length ?? 0) > 0;

  let postCount = 0;
  if (hasAccounts) {
    const accountIds = (accounts ?? []).map((a) => a.id);
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .in(
        'account_id',
        accountIds.length > 0
          ? accountIds
          : ['00000000-0000-0000-0000-000000000000']
      );
    postCount = count ?? 0;
  }

  const hasPosts = postCount > 0;

  // State A: no accounts
  if (!hasAccounts) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 24,
          textAlign: 'center',
        }}
      >
        <Eyebrow>DASHBOARD · STARE</Eyebrow>
        <H1 accent={{ text: 'NICIUN CONT', tone: 'coral' }}>
          NICIUN CONT CONECTAT.
        </H1>
        <Body tone="secondary">
          Conectează primul tău cont pentru a începe analiza.
        </Body>
        <Link href="/dashboard/accounts" style={{ textDecoration: 'none', marginTop: 8 }}>
          <Button variant="ghost">→ CONECTEAZĂ UN CONT</Button>
        </Link>
      </div>
    );
  }

  // State B: accounts but no posts yet
  if (!hasPosts) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <Eyebrow>DASHBOARD · SINCRONIZARE</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H1 accent={{ text: 'ÎN CURS', tone: 'lime' }}>
              SINCRONIZARE ÎN CURS.
            </H1>
          </div>
          <div style={{ marginTop: 12 }}>
            <Body tone="secondary">
              Conturile tale sunt conectate. Datele se sincronizează în background.
              Reîmprospătează pagina în câteva minute.
            </Body>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(accounts ?? []).map((account) => (
            <DataRow
              key={account.id}
              label={account.display_name}
              description={
                <span>
                  {account.handle ?? account.provider_id}
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 11,
                      color: colors.textMuted,
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                    }}
                  >
                    {relativeTime(account.last_sync_at)}
                  </span>
                </span>
              }
              status={account.status.toUpperCase()}
              tone={account.status === 'active' ? 'positive' : 'neutral'}
            />
          ))}
        </div>

        <Link
          href="/dashboard/accounts"
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.accentLime,
            textDecoration: 'none',
          }}
        >
          → VEZI CONTURILE
        </Link>
      </div>
    );
  }

  // State C: accounts + posts
  const postCountsByAccount: Record<string, number> = {};
  for (const acc of accounts ?? []) {
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', acc.id)
      .gte(
        'published_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );
    postCountsByAccount[acc.id] = count ?? 0;
  }

  const followersByAccount: Record<string, number | null> = {};
  for (const acc of accounts ?? []) {
    const { data: snap } = await supabase
      .from('account_metrics_snapshots')
      .select('followers')
      .eq('account_id', acc.id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    followersByAccount[acc.id] = snap?.followers ?? null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <Eyebrow>DASHBOARD · OVERVIEW</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H1>OVERVIEW.</H1>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {(accounts ?? []).map((account) => (
          <Card key={account.id} variant="default">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Eyebrow tone="lime">{account.handle ?? account.display_name}</Eyebrow>
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-league-spartan), sans-serif',
                      fontSize: 20,
                      fontWeight: 700,
                      color: colors.textPrimary,
                    }}
                  >
                    {account.display_name}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <Mono tone="muted">POSTĂRI (30Z)</Mono>
                  <div>
                    <Mono tone="lime">
                      {postCountsByAccount[account.id] ?? 0}
                    </Mono>
                  </div>
                </div>
                {followersByAccount[account.id] != null && (
                  <div>
                    <Mono tone="muted">URMĂRITORI</Mono>
                    <div>
                      <Mono tone="lime">
                        {followersByAccount[account.id]!.toLocaleString('ro-RO')}
                      </Mono>
                    </div>
                  </div>
                )}
              </div>

              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 10,
                  color: 'var(--color-text-muted)',
                }}
              >
                {relativeTime(account.last_sync_at)}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
