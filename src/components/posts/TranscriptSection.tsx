import type { TranscriptionSegment } from '@/lib/transcription/types';
import { Eyebrow, Body, Mono } from '@/components/design-system/Typography';
import { Card } from '@/components/design-system/Card';

interface Props {
  transcript: string | null;
  segments: TranscriptionSegment[] | null;
  visualDescription: string | null;
  transcriptAt: string | null;
  model: string | null;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
}

export function TranscriptSection({
  transcript,
  segments,
  visualDescription,
  transcriptAt,
  model,
  jobStatus,
}: Props) {
  if (!transcript && !jobStatus) return null;

  if (!transcript && (jobStatus === 'pending' || jobStatus === 'processing')) {
    return (
      <section style={{ marginTop: 40 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        <div style={{ marginTop: 12 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
              <Mono tone="muted">
                ⏳ {jobStatus === 'processing' ? 'SE PROCESEAZĂ...' : 'ÎN COADĂ'}
              </Mono>
              <Body tone="secondary">
                Transcrierea video-ului este în curs. Va fi disponibilă în câteva minute.
              </Body>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  if (!transcript && jobStatus === 'failed') {
    return (
      <section style={{ marginTop: 40 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        <div style={{ marginTop: 12 }}>
          <Card>
            <Body tone="secondary">
              Transcrierea a eșuat (URL video posibil expirat).
              Reels-urile trebuie transcrise în primele 24h după sync.
            </Body>
          </Card>
        </div>
      </section>
    );
  }

  if (!transcript) return null;

  return (
    <section style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        {transcriptAt && (
          <Mono tone="muted">
            {model?.toUpperCase()} · {new Date(transcriptAt).toLocaleDateString('ro-RO')}
          </Mono>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <Card>
          <div style={{ marginBottom: 8 }}>
            <Eyebrow tone="muted">TRANSCRIPT AUDIO</Eyebrow>
          </div>
          <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            <Body>{transcript}</Body>
          </div>
        </Card>
      </div>

      {segments && segments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Card>
            <div style={{ marginBottom: 8 }}>
              <Eyebrow tone="muted">
                STRUCTURĂ · {segments.length} SEGMENTE
              </Eyebrow>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {segments.map((seg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 16,
                    borderLeft: '3px solid var(--color-border-default)',
                    paddingLeft: 12,
                  }}
                >
                  <span style={{ minWidth: 60, marginTop: 2 }}>
                    <Mono tone="muted">{seg.start}–{seg.end}</Mono>
                  </span>
                  <Body>{seg.text}</Body>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {visualDescription && (
        <Card>
          <div style={{ marginBottom: 8 }}>
            <Eyebrow tone="muted">DESCRIERE VIZUALĂ</Eyebrow>
          </div>
          <Body tone="secondary">{visualDescription}</Body>
        </Card>
      )}
    </section>
  );
}
