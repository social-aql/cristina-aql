export type RunType = 'monday' | 'wednesday' | 'friday';

export interface AccountPulse {
  postsPublished: number;
  postsPublishedSinceLastRun: Array<{
    postId: string;
    caption: string | null;
    mediaType: string;
    theme: string | null;
    erByReach: number | null;
    savesPerReach: number | null;
    sendsPerReach: number | null;
    publishedAt: string;
    status: 'above_avg' | 'average' | 'below_avg';
  }>;
  reachTrend: 'up' | 'down' | 'stable';
  reachDelta: number;
  alertPosts: Array<{
    postId: string;
    caption: string | null;
    erByReach: number | null;
    issue: string;
  }>;
  topPost: {
    postId: string;
    caption: string | null;
    erByReach: number | null;
    metric: string;
  } | null;
  accountAvgEr: number | null;
  daysSinceLastPost: number;
}

export interface IndustryNewsItem {
  title: string;
  summary: string;
  source: string;
  url: string | null;
  relevance: 'high' | 'medium' | 'low';
  theme: string | null;
  publishedAt: string | null;
}

export interface UpcomingEvent {
  event: string;
  dateDescription: string;
  theme: string;
  urgency: 'urgent' | 'planned' | 'watch';
  description: string;
}

export interface ContentOpportunity {
  title: string;
  hook: string;
  format: string;
  theme: string;
  rationale: string;
  priority: 1 | 2 | 3;
  urgency: 'now' | 'tomorrow' | 'this-week';
  bestTimeToPost: string;
  estimatedEr: string;
}

export interface AgentRunResult {
  insightId: string;
  accountPulse: AccountPulse;
  industryNews: IndustryNewsItem[];
  upcomingEvents: UpcomingEvent[];
  opportunities: ContentOpportunity[];
  emailSent: boolean;
  generationMs: number;
}

export interface AgentInsight {
  id: string;
  user_id: string;
  run_type: RunType;
  run_at: string;
  account_pulse: AccountPulse | null;
  industry_news: IndustryNewsItem[] | null;
  upcoming_events: UpcomingEvent[] | null;
  opportunities: ContentOpportunity[] | null;
  email_sent: boolean;
  email_sent_to: string | null;
  model: string;
  generation_ms: number | null;
  error_message: string | null;
  created_at: string;
}
