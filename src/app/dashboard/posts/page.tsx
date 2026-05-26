import React from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';

function fmt(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString('ro-RO');
}

function fmtRate(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${val.toFixed(2)}%`;
}

export default async function PostsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user!.id);

  const accountIds = (accounts ?? []).map((a: any) => a.id);

  const { data: posts } = accountIds.length
    ? await supabase
        .from('posts')
        .select(`
          id, external_post_id, caption, media_type, published_at, permalink,
          post_metrics_snapshots (impressions, engagement_rate, captured_at)
        `)
        .in('account_id', accountIds)
        .order('published_at', { ascending: false })
        .limit(100)
    : { data: [] };

  if (!posts || posts.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>POSTĂRI</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>POSTĂRILE TALE</H2>
          </div>
        </div>
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <Mono tone="muted">NICIO POSTARE. CONECTEAZĂ UN CONT ȘI SINCRONIZEAZĂ.</Mono>
        </div>
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: colors.textMuted,
    padding: '10px 16px',
    textAlign: 'left' as const,
    borderBottom: `1px solid ${colors.borderDefault}`,
    whiteSpace: 'nowrap' as const,
  };

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 12,
    color: colors.textSecondary,
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.borderDefault}`,
    verticalAlign: 'top' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <Eyebrow>POSTĂRI · {posts.length}</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>POSTĂRILE TALE</H2>
        </div>
      </div>

      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>TIP</th>
              <th style={{ ...thStyle, width: '40%' }}>CAPTION</th>
              <th style={thStyle}>PUBLICAT</th>
              <th style={thStyle}>IMPRESII</th>
              <th style={thStyle}>ENGAGEMENT</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post: any) => {
              const latest = post.post_metrics_snapshots?.[0];
              const date = new Date(post.published_at).toLocaleDateString('ro-RO', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              return (
                <tr key={post.id}>
                  <td style={tdStyle}>
                    <span
                      style={{
                        background: colors.bgElevated,
                        border: `1px solid ${colors.borderDefault}`,
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {post.media_type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: colors.textPrimary, fontFamily: 'var(--font-inter), sans-serif' }}>
                    {post.caption ? post.caption.slice(0, 80) + (post.caption.length > 80 ? '…' : '') : '—'}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{date}</td>
                  <td style={tdStyle}>{fmt(latest?.impressions)}</td>
                  <td style={{ ...tdStyle, color: latest?.engagement_rate ? colors.accentLime : colors.textMuted }}>
                    {fmtRate(latest?.engagement_rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
