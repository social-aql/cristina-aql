import React from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listProviders } from '@/config/providers.config';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { DataRow } from '@/components/design-system/DataRow';
import { ProviderCard } from '@/components/providers/ProviderCard';

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const providers = listProviders();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      {/* Connected accounts */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>CONTURI · CONECTATE</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONTURI CONECTATE</H2>
          </div>
        </div>

        {!accounts || accounts.length === 0 ? (
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: '24px 20px',
              textAlign: 'center',
            }}
          >
            <Mono tone="muted">NICIUN CONT CONECTAT. ADAUGĂ UN CONT MAI JOS.</Mono>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((account: any) => (
              <DataRow
                key={account.id}
                label={account.display_name}
                description={account.handle ?? account.provider_id}
                status={account.status.toUpperCase()}
                tone={account.status === 'active' ? 'positive' : 'negative'}
              />
            ))}
          </div>
        )}
      </section>

      {/* Available providers */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>PROVIDERI · DISPONIBILI</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONECTEAZĂ UN CONT</H2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </section>
    </div>
  );
}
