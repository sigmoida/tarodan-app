export interface AiModerationConfig {
  enabled: boolean;
  /** 0..1 relevance auto-accept threshold. */
  relevanceThreshold: number;
  /** 0..1 NSFW block threshold. */
  nsfwThreshold: number;
}

export interface ImageTestResult {
  enabled?: boolean;
  error?: string;
  message?: string;
  decision?: 'pass' | 'review' | 'flag';
  relevanceScore?: number;
  nsfwScore?: number;
  topLabels?: { label: string }[];
}

/** Map the test decision to the shared AI badge state. */
export function decisionState(decision?: string): 'flagged' | 'review' | 'passed' {
  if (decision === 'flag') return 'flagged';
  if (decision === 'review') return 'review';
  return 'passed';
}
