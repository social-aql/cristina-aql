'use client';

import { useState } from 'react';
import { Card, Eyebrow, Body, Mono } from '@/components/design-system';
import type { AccountPulse, ContentOpportunity } from '@/lib/agent/types';

interface Props {
  insight: {
    id: string;
    run_type: string;
    run_at: string;
    account_pulse: AccountPulse | null;
    opportunities: ContentOpportunity[] | null;
    email_sent: boolean;
  };
}

export function InsightCard({ insight }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copiedHook, setCopiedHook] = useState<number | null>(null);

  const runLabels: Record<string, string> = {
    monday: 'LUNI · BRIEFING',
    wednesday: 'MIERCURI · PULS',
    friday: 'VINERI · PREP',
  };

  const opportunities = insight.opportunities ?? [];
  const pulse = insight.account_pulse;
  const topOpportunity = opportunities.find(o => o.priority === 1);

  const copyHook = (hook: string, idx: number) => {
    navigator.clipboard.writeText(hook);
    setCopiedHook(idx);
    setTimeout(() => setCopiedHook(null), 2000);
  };

  return (
    <Card>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <Eyebrow tone="muted">
            {runLabels[insight.run_type] ?? insight.run_type.toUpperCase()}
            {' · '}
            {new Date(insight.run_at).toLocaleDateString('ro-RO', {
              day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            })}
            {insight.email_sent && (
              <span style={{ color: 'var(--color-accent-lime)', marginLeft: 8 }}>✉ EMAIL TRIMIS</span>
            )}
          </Eyebrow>
          {topOpportunity && !expanded && (
            <div style={{ marginTop: 4 }}>
              <Body>💡 {topOpportunity.title}</Body>
            </div>
          )}
          {pulse && !expanded && (
            <div style={{ marginTop: 4 }}>
              <Mono tone="muted">
                {pulse.postsPublished} postări · reach {pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→'}
                {Math.abs(pulse.reachDelta)}% · {opportunities.length} oportunități
              </Mono>
            </div>
          )}
        </div>
        <Mono tone="muted">{expanded ? '▲' : '▼'}</Mono>
      </div>

      {expanded && (
        <div style={{ marginTop: 20 }}>
          {pulse && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 8 }}><Eyebrow tone="muted">CONT</Eyebrow></div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
                  <div style={{ marginBottom: 4 }}><Mono tone="muted">REACH TREND</Mono></div>
                  <span style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 18,
                    fontWeight: 700,
                    color: pulse.reachTrend === 'up' ? 'var(--color-accent-lime)'
                      : pulse.reachTrend === 'down' ? 'var(--color-accent-coral)'
                      : 'var(--color-text-primary)',
                  }}>
                    {pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→'}
                    {' '}{Math.abs(pulse.reachDelta)}%
                  </span>
                </div>
                <div style={{ flex: 1, padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 6 }}>
                  <div style={{ marginBottom: 4 }}><Mono tone="muted">POSTĂRI</Mono></div>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 18, fontWeight: 700 }}>
                    {pulse.postsPublished}
                  </span>
                </div>
              </div>
              {pulse.alertPosts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {pulse.alertPosts.map(p => (
                    <div key={p.postId} style={{
                      padding: '8px 12px',
                      background: 'var(--color-bg-card-negative)',
                      borderLeft: '3px solid var(--color-accent-coral)',
                      borderRadius: '0 4px 4px 0',
                      marginBottom: 4,
                    }}>
                      <Body>⚠️ &quot;{(p.caption ?? '').slice(0, 50)}&quot; — {p.issue}</Body>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {opportunities.length > 0 && (
            <div>
              <div style={{ marginBottom: 8 }}><Eyebrow tone="muted">OPORTUNITĂȚI</Eyebrow></div>
              {opportunities.sort((a, b) => a.priority - b.priority).map((opp, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 16,
                    background: 'var(--color-bg-card-positive)',
                    border: '1px solid var(--color-border-positive)',
                    borderRadius: 6,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Eyebrow tone="lime">
                      {'⭐'.repeat(4 - opp.priority)} P{opp.priority}
                      {' · '}{opp.urgency === 'now' ? 'ACUM' : opp.urgency === 'tomorrow' ? 'MÂINE' : 'SĂPTĂMÂNA ASTA'}
                    </Eyebrow>
                    <Mono tone="muted">{opp.format}</Mono>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
                      {opp.title}
                    </span>
                  </div>
                  <div style={{
                    padding: '8px 12px',
                    background: 'var(--color-bg-card)',
                    borderLeft: '2px solid var(--color-accent-lime)',
                    borderRadius: '0 4px 4px 0',
                    marginBottom: 10,
                    position: 'relative',
                  }}>
                    <span style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-primary)' }}>
                      &quot;{opp.hook}&quot;
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyHook(opp.hook, idx); }}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        padding: '2px 8px',
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontFamily: 'var(--font-jetbrains-mono)',
                        color: copiedHook === idx ? 'var(--color-accent-lime)' : 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {copiedHook === idx ? '✓ COPIAT' : 'COPIAZĂ'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {[opp.theme.toUpperCase(), `⏰ ${opp.bestTimeToPost}`].map(badge => (
                      <span key={badge} style={{
                        fontSize: 10, padding: '2px 8px',
                        border: '1px solid var(--color-border-default)', borderRadius: 3,
                        fontFamily: 'var(--font-jetbrains-mono)', color: 'var(--color-text-muted)',
                      }}>{badge}</span>
                    ))}
                    <span style={{
                      fontSize: 10, padding: '2px 8px',
                      border: '1px solid var(--color-border-positive)', borderRadius: 3,
                      fontFamily: 'var(--font-jetbrains-mono)', color: 'var(--color-accent-lime-dim)',
                    }}>ER est. {opp.estimatedEr}</span>
                  </div>
                  <Body tone="secondary">{opp.rationale}</Body>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
