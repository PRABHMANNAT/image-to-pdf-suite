import { Request, Response } from 'express';
import { loadEnvFiles } from '../utils/env';

type Task = 'summarize' | 'translate';

interface GenerateBody {
  task?: Task;
  prompt?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
}

function normaliseBaseUrl(endpoint: string | undefined): string {
  const raw = endpoint?.trim() || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  return raw.replace(/\/+$/, '');
}

function taskSystemPrompt(task: Task): string {
  if (task === 'translate') {
    return 'You translate extracted PDF text faithfully. Preserve headings, bullet structure, numbers, and names. Return only the translated text.';
  }
  return 'You summarize extracted PDF text accurately. Do not invent facts. Keep useful structure from the source.';
}

export async function generate(req: Request, res: Response) {
  loadEnvFiles();
  const body = req.body as GenerateBody;
  const task = body.task === 'translate' ? 'translate' : 'summarize';
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const apiKey = String(body.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(400).json({
      code: 'AI_KEY_MISSING',
      error: 'No API key configured. Add one in Settings or set OPENAI_API_KEY in .env.',
    });
  }

  const baseUrl = normaliseBaseUrl(body.endpoint);
  const model = String(body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: Number.isFinite(body.temperature) ? body.temperature : 0.2,
        messages: [
          { role: 'system', content: taskSystemPrompt(task) },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const text = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    if (!upstream.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? JSON.stringify((payload as { error: unknown }).error)
          : text || `HTTP ${upstream.status}`;
      return res.status(upstream.status).json({ code: 'AI_PROVIDER_ERROR', error: message });
    }

    const content =
      payload &&
      typeof payload === 'object' &&
      'choices' in payload &&
      Array.isArray((payload as { choices: unknown }).choices)
        ? ((payload as { choices: { message?: { content?: string } }[] }).choices[0]?.message?.content ?? '')
        : '';

    return res.json({ text: content.trim(), model, endpoint: baseUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(502).json({ code: 'AI_NETWORK_ERROR', error: msg });
  }
}

export function status(_req: Request, res: Response) {
  loadEnvFiles();
  res.json({
    hasServerKey: Boolean(process.env.OPENAI_API_KEY),
    endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });
}
