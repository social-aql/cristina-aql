'use client';

import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';
import {
  Eyebrow, H1, H2, H3, Body, Mono,
} from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { Card } from '@/components/design-system/Card';
import { Tag } from '@/components/design-system/Tag';
import { Statistic } from '@/components/design-system/Statistic';
import { DataRow } from '@/components/design-system/DataRow';
import { SignalCard } from '@/components/design-system/SignalCard';

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        borderBottom: `1px solid ${colors.borderDefault}`,
        paddingBottom: 12,
        marginBottom: 32,
      }}
    >
      <Eyebrow tone="lime">{title}</Eyebrow>
    </div>
  );
}

export default function DesignSystem() {
  return (
    <div
      style={{
        background: colors.bg,
        minHeight: '100vh',
        padding: '64px 48px',
        position: 'relative',
      }}
    >
      {/* Page Header */}
      <div style={{ marginBottom: 80 }}>
        <Eyebrow>AI LICHIDITATE · COMPONENTS</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H1>DESIGN SYSTEM</H1>
        </div>
      </div>

      {/* ============================================================
          Section 1: Typography
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="01 — Typography" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* H1 with accent */}
          <div>
            <Eyebrow tone="muted">H1 with accent</Eyebrow>
            <div style={{ marginTop: 8 }}>
              <H1 accent={{ text: 'BOLD', tone: 'lime' }}>STAY BOLD.</H1>
            </div>
          </div>

          {/* H2 */}
          <div>
            <Eyebrow tone="muted">H2</Eyebrow>
            <div style={{ marginTop: 8 }}>
              <H2>Market Positioning</H2>
            </div>
          </div>

          {/* H3 */}
          <div>
            <Eyebrow tone="muted">H3</Eyebrow>
            <div style={{ marginTop: 8 }}>
              <H3>Sector Analysis</H3>
            </div>
          </div>

          {/* Body tones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Eyebrow tone="muted">Body — tones</Eyebrow>
            <Body tone="primary">Primary — The market is showing signs of rotation into defensive sectors.</Body>
            <Body tone="secondary">Secondary — Historical volatility index readings suggest caution.</Body>
            <Body tone="muted">Muted — Data sourced from public market feeds.</Body>
          </div>

          {/* Mono tones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Eyebrow tone="muted">Mono — tones</Eyebrow>
            <div><Mono tone="lime">+5.00% · BULLISH</Mono></div>
            <div><Mono tone="coral">-2.34% · BEARISH</Mono></div>
            <div><Mono tone="muted">VOL: 124.5K</Mono></div>
            <div><Mono tone="primary">SPX · 5,234.18</Mono></div>
          </div>

          {/* Eyebrow tones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Eyebrow tone="muted">Eyebrow — tones</Eyebrow>
            <Eyebrow>Default (secondary)</Eyebrow>
            <Eyebrow tone="lime">Lime tone</Eyebrow>
            <Eyebrow tone="coral">Coral tone</Eyebrow>
            <Eyebrow tone="muted">Muted tone</Eyebrow>
          </div>
        </div>
      </section>

      {/* ============================================================
          Section 2: Buttons
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="02 — Buttons" />

        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
          <div key={variant} style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 8 }}>
              <Eyebrow tone="muted">{variant}</Eyebrow>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant={variant} size="large">Large</Button>
              <Button variant={variant}>Default</Button>
              <Button variant={variant} size="small">Small</Button>
              <Button variant={variant} disabled>Disabled</Button>
            </div>
          </div>
        ))}
      </section>

      {/* ============================================================
          Section 3: Cards
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="03 — Cards" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card variant="default">
            <Eyebrow>Default Card</Eyebrow>
            <div style={{ marginTop: 8 }}>
              <Body tone="secondary">Neutral surface for general content and data display.</Body>
            </div>
          </Card>
          <Card variant="positive">
            <Eyebrow tone="lime">Positive Card</Eyebrow>
            <div style={{ marginTop: 8 }}>
              <Body tone="secondary">Green-tinted surface for bullish signals and gains.</Body>
            </div>
          </Card>
          <Card variant="negative">
            <Eyebrow tone="coral">Negative Card</Eyebrow>
            <div style={{ marginTop: 8 }}>
              <Body tone="secondary">Red-tinted surface for bearish signals and losses.</Body>
            </div>
          </Card>
        </div>
      </section>

      {/* ============================================================
          Section 4: Data Rows
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="04 — Data Rows" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DataRow
            label="S&P 500"
            description={<>Cooling off, technical greed is fading. <strong>Watch support at 5,100.</strong></>}
            status="cooling"
            tone="negative"
          />
          <DataRow
            label="GOLD · XAU"
            description={<>Breakout confirmed above $2,400. <strong>Momentum favors longs.</strong></>}
            status="breakout"
            tone="positive"
          />
          <DataRow
            label="CASH · T-BILLS"
            description={<>5.3% yield holding. <strong>Risk-free rate still competitive.</strong></>}
            status="hold"
            tone="positive"
          />
          <DataRow
            label="DXY · USD"
            description={<>Dollar strength capping risk assets. <strong>Watch 104 pivot.</strong></>}
            status="strong"
            tone="negative"
          />
        </div>
      </section>

      {/* ============================================================
          Section 5: Signal Cards
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="05 — Signal Cards" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <SignalCard
            eyebrow="BIG-BOX · MAR 19"
            eyebrowTone="lime"
            title="WALMART"
            description="Comp sales accelerating. Grocery share gains offsetting discretionary weakness. Raised guidance."
            trend="up"
          />
          <SignalCard
            eyebrow="BIG-BOX · MAR 19"
            eyebrowTone="coral"
            title="TARGET"
            description="Discretionary drag persists. Inventory overhang in home & apparel. Guidance cut below consensus."
            trend="down"
          />
          <SignalCard
            eyebrow="HOME IMPROVEMENT · MAR 20"
            eyebrowTone="lime"
            title="HOME DEPOT"
            description="Pro contractor demand resilient. Housing turnover headwind fading. Beat on margin expansion."
            trend="up"
          />
          <SignalCard
            eyebrow="OFF-PRICE · MAR 21"
            eyebrowTone="lime"
            title="TJX"
            description="Treasure-hunt traffic at record. Trade-down consumer beneficiary. Raised full-year outlook."
            trend="up"
          />
        </div>
      </section>

      {/* ============================================================
          Section 6: Statistics
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="06 — Statistics" />

        <div style={{ display: 'flex', gap: 64, flexWrap: 'wrap' }}>
          <Statistic value="12.4K" label="Followers" tone="primary" />
          <Statistic value="+5.00" unit="%" label="Engagement Rate" tone="lime" />
          <Statistic value="127" label="Posts" tone="primary" />
          <Statistic value="-2.3" unit="%" label="Reach Change" tone="coral" />
        </div>
      </section>

      {/* ============================================================
          Section 7: Tags
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="07 — Tags" />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag variant="lime">Bullish</Tag>
          <Tag variant="lime">Breakout</Tag>
          <Tag variant="coral">Bearish</Tag>
          <Tag variant="coral">Cooling</Tag>
          <Tag variant="muted">Neutral</Tag>
          <Tag variant="muted">Watch</Tag>
        </div>
      </section>

      {/* ============================================================
          Section 8: Color Palette
      ============================================================ */}
      <section style={{ marginBottom: 80 }}>
        <SectionHeader title="08 — Color Palette" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {(Object.entries(colors) as [string, string][]).map(([name, hex]) => (
            <div
              key={name}
              style={{
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: 48,
                  background: hex,
                  border: `1px solid ${colors.borderDefault}`,
                }}
              />
              <div style={{ padding: '8px 10px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    color: colors.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 11,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  {hex}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Page number */}
      <div
        style={{
          position: 'fixed',
          bottom: 32,
          right: 48,
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 13,
          fontWeight: 700,
          color: colors.accentLime,
          letterSpacing: '0.05em',
        }}
      >
        01
      </div>
    </div>
  );
}
