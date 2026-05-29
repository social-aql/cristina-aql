export type DiagnosticSeverity = 'critical' | 'warning' | 'info' | 'ok';

export type DiagnosticCategory =
  | 'hook'
  | 'caption_seo'
  | 'hashtags'
  | 'engagement'
  | 'strategy'
  | 'financial_creator';

export interface DiagnosticCheck {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  action: string | null;
  benchmark: string | null;
  passed: boolean;
}

export interface PostDiagnosticResult {
  postId: string;
  totalChecks: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  okCount: number;
  score: number;
  checks: DiagnosticCheck[];
}
