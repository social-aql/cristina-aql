import React from 'react';
import type { PostDiagnosticResult } from '@/lib/diagnostics/types';
import { DiagnosticChecklistItem } from './DiagnosticChecklistItem';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  result: PostDiagnosticResult;
}

export function PostDiagnosticChecklist({ result }: Props) {
  const failed = result.checks.filter(c => !c.passed);
  const passed = result.checks.filter(c => c.passed);

  const scoreColor = result.score >= 80
    ? colors.accentLime
    : result.score >= 60
    ? colors.textPrimary
    : colors.accentCoral;

  const scoreLabel = result.score >= 80 ? 'BINE' : result.score >= 60 ? 'MEDIU' : 'NECESITĂ ATENȚIE';

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  const sortedFailed = [...failed].sort((a, b) =>
    (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return (
    <section style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              color: colors.textSecondary,
              display: 'block',
            }}
          >
            DIAGNOSTIC · POSTARE
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-league-spartan), sans-serif',
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.2,
              color: colors.textPrimary,
              margin: 0,
              marginTop: 4,
            }}
          >
            Audit Postare
          </h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 32,
              fontWeight: 700,
              color: scoreColor,
              display: 'block',
            }}
          >
            {result.score}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            SCOR · {scoreLabel}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {result.criticalCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentCoral, fontSize: 12 }}>
            ✗ {result.criticalCount} CRITICE
          </span>
        )}
        {result.warningCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentCoral, fontSize: 12, opacity: 0.7 }}>
            ⚠ {result.warningCount} ATENȚIONĂRI
          </span>
        )}
        {result.infoCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, fontSize: 12 }}>
            ℹ {result.infoCount} INFO
          </span>
        )}
        {result.okCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentLime, fontSize: 12, opacity: 0.7 }}>
            ✓ {result.okCount} OK
          </span>
        )}
      </div>

      {sortedFailed.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {sortedFailed.map(check => (
            <DiagnosticChecklistItem key={check.id} check={check} />
          ))}
        </div>
      )}

      {passed.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', marginBottom: 8, listStyle: 'none' }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              ✓ {passed.length} VERIFICĂRI TRECUTE (click pentru detalii)
            </span>
          </summary>
          {passed.map(check => (
            <DiagnosticChecklistItem key={check.id} check={check} />
          ))}
        </details>
      )}

      {failed.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
            padding: '24px 0',
            margin: 0,
          }}
        >
          Toate verificările au trecut. Postare bine optimizată.
        </p>
      )}
    </section>
  );
}
