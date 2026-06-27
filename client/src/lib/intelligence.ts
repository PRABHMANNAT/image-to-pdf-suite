export type IntelligenceTask = 'summarize' | 'translate';

export interface ProviderConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export interface GenerateOptions extends ProviderConfig {
  task: IntelligenceTask;
  prompt: string;
  signal?: AbortSignal;
}

export interface AiStatus {
  hasServerKey: boolean;
  endpoint: string;
  model: string;
}

export class IntelligenceError extends Error {
  constructor(message: string, public code = 'UNKNOWN') {
    super(message);
  }
}

export async function getAiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch('/api/intelligence/status');
    if (!res.ok) return null;
    return (await res.json()) as AiStatus;
  } catch {
    return null;
  }
}

export async function generateWithProvider(opts: GenerateOptions): Promise<string> {
  const res = await fetch('/api/intelligence/generate', {
    method: 'POST',
    signal: opts.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      task: opts.task,
      prompt: opts.prompt,
      endpoint: opts.endpoint,
      apiKey: opts.apiKey,
      model: opts.model,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; code?: string };
  if (!res.ok) throw new IntelligenceError(body.error || `HTTP ${res.status}`, body.code);
  return body.text || '';
}

export function providerConfigured(config: ProviderConfig, status: AiStatus | null): boolean {
  return Boolean(config.apiKey?.trim() || status?.hasServerKey);
}
