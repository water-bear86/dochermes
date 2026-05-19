import type { AskHermesInput, BuildHermesPayloadInput, HermesPayload } from '../shared/types';

type FetchLike = typeof fetch;

const DATA_URL_PATTERN = /^data:(image\/png);base64,(.+)$/;

export function resolveHermesEndpoint(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new Error('Hermes gateway URL is required.');
  }

  const url = new URL(trimmed);

  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/coach';
  }

  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function buildHermesPayload(input: BuildHermesPayloadInput): HermesPayload {
  const match = input.screenshotDataUrl.match(DATA_URL_PATTERN);

  if (!match) {
    throw new Error('Screenshot must be a PNG data URL.');
  }

  const payload: HermesPayload = {
    question: input.question.trim(),
    screenshot: {
      mimeType: 'image/png',
      dataBase64: match[2] ?? ''
    },
    selectedWindow: {
      id: input.selectedWindow.id,
      name: input.selectedWindow.name,
      kind: input.selectedWindow.kind
    },
    constraints: {
      executionCapability: false,
      platformAgnostic: true,
      captureRequiresUserSelection: true
    }
  };

  if (input.memoryContext) {
    payload.memoryContext = input.memoryContext;
  }

  return payload;
}

export function parseHermesResponse(response: unknown): string {
  if (!response || typeof response !== 'object') {
    throw new Error('Hermes gateway response did not include readable text.');
  }

  const record = response as Record<string, unknown>;
  const directText = firstNonEmptyString(record.answer, record.response, record.message);

  if (directText) {
    return directText;
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const content = readOpenAiChoiceContent(choice);
      if (content) {
        return content;
      }
    }
  }

  throw new Error('Hermes gateway response did not include readable text.');
}

export async function askHermes(input: AskHermesInput, fetchImpl: FetchLike = fetch): Promise<string> {
  const endpoint = resolveHermesEndpoint(input.gatewayUrl);
  const payload = buildHermesPayload(input);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const suffix = detail ? ` ${detail}` : '';
    throw new Error(`Hermes gateway returned ${response.status}.${suffix}`);
  }

  const data = (await response.json()) as unknown;
  return parseHermesResponse(data);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function readOpenAiChoiceContent(choice: unknown): string | undefined {
  if (!choice || typeof choice !== 'object') {
    return undefined;
  }

  const record = choice as Record<string, unknown>;
  const message = record.message;

  if (message && typeof message === 'object') {
    const content = (message as Record<string, unknown>).content;
    return firstNonEmptyString(content);
  }

  return firstNonEmptyString(record.text);
}
