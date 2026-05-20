export interface AnalysisDefinition {
  id: string;
  displayName: string;
  systemPrompt: string;
  userTemplate: (input: unknown) => string;
}

export const aiConfig = {
  model: 'claude-opus-4-7',
  maxTokens: 4096,
  temperature: 0.7,
  analyses: {} as Record<string, AnalysisDefinition>,
} as const;
