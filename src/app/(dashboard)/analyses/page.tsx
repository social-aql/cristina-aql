import React from 'react';
import { Eyebrow, H1 } from '@/components/design-system/Typography';

export default function AnalysesPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 16,
        textAlign: 'center',
      }}
    >
      <Eyebrow>ANALIZE · ÎN CURÂND</Eyebrow>
      <H1>ANALIZE AI.</H1>
    </div>
  );
}
