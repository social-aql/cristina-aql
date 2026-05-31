export type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TranscriptionSegment {
  start: string;
  end: string;
  text: string;
}

export interface TranscriptionResult {
  transcript: string;
  segments: TranscriptionSegment[];
  visualDescription: string;
  language: string;
  model: string;
  durationSeconds: number | null;
}

export interface TranscriptionJob {
  id: string;
  postId: string;
  accountId: string;
  status: TranscriptionStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  videoUrl: string | null;
  mediaType: string;
  createdAt: string;
}
