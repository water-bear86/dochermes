import type {
  AskHermesInput,
  BuildHermesPayloadInput,
  HermesConnectionReport,
  HermesConnectionSettings,
  HermesEndpointMode,
  HermesPayload,
  ProbeAttempt
} from '../shared/types';

type FetchLike = typeof fetch;

interface OpenAiChatPayloadInput extends BuildHermesPayloadInput {
  modelId: string;
}

interface ProbeRouteResult {
  attempt: ProbeAttempt;
  body: unknown;
}

const DATA_URL_PATTERN = /^data:(image\/png);base64,(.+)$/;
const LOCAL_CANDIDATES = [
  'http://localhost:8642',
  'http://127.0.0.1:8642',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
  'http://localhost:9119'
];

const SYSTEM_PROMPT =
  'You are DocHermes, a risk coach for trading workflows. You do not place trades, route orders, access wallets, or provide execution commands. Analyze the selected trading-window screenshot and the user question. Focus on risk, confirmation, invalidation, position sizing discipline, and emotional overtrading.';

export function resolveHermesEndpoint(connection: HermesConnectionSettings): string {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);

  switch (connection.endpointMode) {
    case 'legacy-coach':
      return appendPath(baseUrl, '/coach');
    case 'custom':
      return baseUrl;
    case 'auto':
    case 'openai-chat':
      return appendPath(baseUrl, '/v1/chat/completions');
  }
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

export function buildOpenAiChatPayload(input: OpenAiChatPayloadInput) {
  return {
    model: input.modelId,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildUserPromptText(input)
          },
          {
            type: 'image_url',
            image_url: {
              url: input.screenshotDataUrl
            }
          }
        ]
      }
    ]
  };
}

export function parseHermesResponse(response: unknown): string {
  if (typeof response === 'string' && response.trim()) {
    return response.trim();
  }

  if (!response || typeof response !== 'object') {
    throw new Error('Hermes gateway response did not include readable text.');
  }

  const record = response as Record<string, unknown>;
  const directText = firstText(record.answer, record.response, record.message, record.output_text);

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

  const output = record.output;
  if (Array.isArray(output)) {
    for (const outputItem of output) {
      const content = readOutputContent(outputItem);
      if (content) {
        return content;
      }
    }
  }

  throw new Error('Hermes gateway response did not include readable text.');
}

export async function askHermes(input: AskHermesInput, fetchImpl: FetchLike = fetch): Promise<string> {
  const endpoint = resolveHermesEndpoint(input.connection);
  const adapter = selectAdapter(input.connection);
  const body =
    adapter === 'openai-chat'
      ? buildOpenAiChatPayload({
          ...input,
          modelId: input.connection.modelId
        })
      : buildHermesPayload(input);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: buildHeaders(input.connection),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const suffix = detail ? ` ${detail}` : '';
    throw new Error(`Hermes gateway returned ${response.status}.${suffix}`);
  }

  const data = await readResponseBody(response);
  return parseHermesResponse(data);
}

export async function probeHermesConnection(
  connection: HermesConnectionSettings,
  fetchImpl: FetchLike = fetch
): Promise<HermesConnectionReport> {
  const attempts: ProbeAttempt[] = [];
  let models: string[] = [];

  for (const baseUrl of candidateBaseUrls(connection)) {
    const candidateConnection = {
      ...connection,
      baseUrl,
      endpointMode: connection.endpointMode === 'auto' ? 'openai-chat' : connection.endpointMode
    } satisfies HermesConnectionSettings;

    const health = await probeRoute(
      'GET',
      appendPath(baseUrl, '/health'),
      'health',
      candidateConnection,
      fetchImpl
    );
    attempts.push(health.attempt);

    const capabilities = await probeRoute(
      'GET',
      appendPath(baseUrl, '/v1/capabilities'),
      'capabilities',
      candidateConnection,
      fetchImpl
    );
    attempts.push(capabilities.attempt);

    const modelsResult = await probeRoute(
      'GET',
      appendPath(baseUrl, '/v1/models'),
      'models',
      candidateConnection,
      fetchImpl
    );
    attempts.push(modelsResult.attempt);
    models = readModelIds(modelsResult.body);

    if (models.length > 0 && !models.includes(connection.modelId)) {
      const result: HermesConnectionReport = {
        status: 'model-error',
        activeAdapter: undefined,
        textCapable: false,
        imageCapable: false,
        models,
        attempts,
        summary: 'Hermes model discovery did not include the configured model ID.',
        debugReport: ''
      };
      result.debugReport = createDebugReport(result, candidateConnection);
      return result;
    }

    const textPing = await probeChatCompletion(candidateConnection, false, fetchImpl);
    attempts.push(textPing.attempt);
    const textCapable = textPing.attempt.ok;

    const imagePing = await probeChatCompletion(candidateConnection, true, fetchImpl);
    attempts.push(imagePing.attempt);
    const imageCapable = imagePing.attempt.ok;

    if (textCapable) {
      const result: HermesConnectionReport = {
        status: imageCapable ? 'connected' : 'degraded',
        activeAdapter: selectAdapter(candidateConnection),
        effectiveConnection: candidateConnection,
        resolvedEndpoint: resolveHermesEndpoint(candidateConnection),
        textCapable,
        imageCapable,
        models,
        attempts,
        summary: imageCapable
          ? 'Hermes API Server is reachable and accepts text plus screenshot requests.'
          : 'Hermes API Server is reachable for text, but screenshot/image input did not pass.',
        debugReport: ''
      };
      result.debugReport = createDebugReport(result, candidateConnection);
      return result;
    }

    if (connection.endpointMode === 'auto') {
      const legacyConnection = {
        ...candidateConnection,
        endpointMode: 'legacy-coach'
      } satisfies HermesConnectionSettings;
      const legacyPing = await probeChatCompletion(legacyConnection, true, fetchImpl);
      attempts.push(legacyPing.attempt);

      if (legacyPing.attempt.ok) {
        const result: HermesConnectionReport = {
          status: 'connected',
          activeAdapter: 'legacy-coach',
          effectiveConnection: legacyConnection,
          resolvedEndpoint: resolveHermesEndpoint(legacyConnection),
          textCapable: true,
          imageCapable: true,
          models,
          attempts,
          summary: 'Legacy /coach adapter is reachable. Hermes API Server chat-completions was not selected.',
          debugReport: ''
        };
        result.debugReport = createDebugReport(result, legacyConnection);
        return result;
      }
    }
  }

  const status = attempts.some((attempt) => attempt.status === 401 || attempt.status === 403)
    ? 'auth-error'
    : attempts.some((attempt) => [400, 404, 422].includes(attempt.status) && /model/i.test(attempt.detail))
      ? 'model-error'
      : attempts.some((attempt) => attempt.status === 404 && attempt.url.includes('/v1/chat/completions'))
        ? 'incompatible'
        : 'disconnected';
  const result: HermesConnectionReport = {
    status,
    activeAdapter: undefined,
    textCapable: false,
    imageCapable: false,
    models,
    attempts,
    summary: summarizeFailure(status, attempts),
    debugReport: ''
  };
  result.debugReport = createDebugReport(result, connection);
  return result;
}

export function createDebugReport(
  report: Pick<HermesConnectionReport, 'status' | 'summary' | 'attempts'>,
  connection: HermesConnectionSettings
): string {
  const authLine = connection.bearerToken ? 'Authentication: Bearer ***' : 'Authentication: none';
  const lines = [
    'DocHermes Hermes connection diagnostics',
    `Status: ${report.status}`,
    `Summary: ${report.summary}`,
    `Connection kind: ${connection.connectionKind}`,
    `Endpoint mode: ${connection.endpointMode}`,
    `Base URL: ${maskUrl(connection.baseUrl)}`,
    `Model: ${connection.modelId || '(none)'}`,
    authLine,
    'Attempts:'
  ];

  for (const attempt of report.attempts) {
    lines.push(
      `- ${attempt.method} ${maskUrl(attempt.url)} -> ${attempt.status} ${attempt.ok ? 'OK' : 'FAIL'} (${attempt.label}) ${redactSensitive(attempt.detail, connection)}`
    );
  }

  return lines.join('\n');
}

function buildUserPromptText(input: BuildHermesPayloadInput): string {
  const lines = [
    input.question.trim(),
    '',
    `Selected window: ${input.selectedWindow.name} (${input.selectedWindow.kind})`,
    '',
    'Constraints:',
    '- executionCapability: false',
    '- platformAgnostic: true',
    '- captureRequiresUserSelection: true'
  ];

  if (input.memoryContext && (input.memoryContext.matchedPatterns.length > 0 || input.memoryContext.recentNotes.length > 0)) {
    lines.push('', 'Compact personal memory context:', JSON.stringify(input.memoryContext));
  }

  return lines.join('\n');
}

function selectAdapter(connection: HermesConnectionSettings): HermesEndpointMode {
  if (connection.endpointMode === 'auto') {
    return 'openai-chat';
  }

  return connection.endpointMode;
}

function buildHeaders(connection: HermesConnectionSettings): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json'
  };

  if (connection.bearerToken.trim()) {
    headers.authorization = `Bearer ${connection.bearerToken.trim()}`;
  }

  return headers;
}

async function probeChatCompletion(
  connection: HermesConnectionSettings,
  includeImage: boolean,
  fetchImpl: FetchLike
): Promise<ProbeRouteResult> {
  const endpoint = resolveHermesEndpoint(connection);
  const probeScreenshot =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  const selectedWindow = {
    id: 'probe',
    name: 'Connection probe',
    kind: 'screen' as const,
    thumbnailDataUrl: ''
  };
  const payload =
    selectAdapter(connection) === 'openai-chat'
      ? includeImage
        ? buildOpenAiChatPayload({
            modelId: connection.modelId,
            question: 'DocHermes image ping. Reply with pong.',
            screenshotDataUrl: probeScreenshot,
            selectedWindow
          })
        : {
            model: connection.modelId,
            messages: [
              {
                role: 'user',
                content: 'DocHermes text ping. Reply with pong.'
              }
            ]
          }
      : buildHermesPayload({
          question: includeImage ? 'DocHermes image ping. Reply with pong.' : 'DocHermes text ping. Reply with pong.',
          screenshotDataUrl: probeScreenshot,
          selectedWindow
        });

  return probeRoute('POST', endpoint, includeImage ? 'image ping' : 'text ping', connection, fetchImpl, payload);
}

async function probeRoute(
  method: 'GET' | 'POST',
  url: string,
  label: string,
  connection: HermesConnectionSettings,
  fetchImpl: FetchLike,
  body?: unknown
): Promise<ProbeRouteResult> {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: buildHeaders(connection),
      body: body ? JSON.stringify(body) : undefined
    });
    const parsedBody = await readResponseBody(response);
    const ok =
      response.ok &&
      (label === 'text ping' || label === 'image ping' ? canParseResponseText(parsedBody) : true);

    return {
      attempt: {
        url,
        method,
        ok,
        status: response.status,
        label,
        detail: response.ok ? summarizeBody(parsedBody) : summarizeBody(parsedBody) || response.statusText
      },
      body: parsedBody
    };
  } catch (error) {
    return {
      attempt: {
        url,
        method,
        ok: false,
        status: 0,
        label,
        detail: error instanceof Error ? error.message : 'Network error'
      },
      body: undefined
    };
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => undefined);
  }

  return response.text().catch(() => undefined);
}

function canParseResponseText(body: unknown): boolean {
  try {
    return Boolean(parseHermesResponse(body));
  } catch {
    return false;
  }
}

function readModelIds(body: unknown): string[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const data = (body as Record<string, unknown>).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined))
    .filter((id): id is string => typeof id === 'string');
}

function summarizeBody(body: unknown): string {
  if (!body) {
    return '';
  }

  if (typeof body === 'string') {
    return body.slice(0, 120);
  }

  if (typeof body === 'object') {
    if ('error' in body) {
      const error = (body as Record<string, unknown>).error;
      return typeof error === 'string' ? error : JSON.stringify(error).slice(0, 120);
    }

    return 'JSON response';
  }

  return String(body).slice(0, 120);
}

function summarizeFailure(status: HermesConnectionReport['status'], attempts: ProbeAttempt[]): string {
  if (status === 'auth-error') {
    return 'Hermes rejected the request. Check bearer auth and hosted API permissions.';
  }

  if (status === 'model-error') {
    return 'Hermes rejected the configured model. Check the model ID or use model discovery.';
  }

  if (attempts.some((attempt) => attempt.url.startsWith('http://localhost:9119') && attempt.status > 0)) {
    return 'No Hermes API server responded. Port 9119 often indicates a dashboard, not the API server.';
  }

  if (status === 'incompatible') {
    return 'A server responded, but it did not expose Hermes chat-completions routes.';
  }

  return 'No compatible Hermes API server responded.';
}

function candidateBaseUrls(connection: HermesConnectionSettings): string[] {
  if (connection.connectionKind !== 'local' || connection.endpointMode !== 'auto') {
    return [normalizeBaseUrl(connection.baseUrl)];
  }

  return unique([normalizeBaseUrl(connection.baseUrl), ...LOCAL_CANDIDATES.map(normalizeBaseUrl)]);
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function appendPath(baseUrl: string, path: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);

  if (normalizedBase.endsWith(path)) {
    return normalizedBase;
  }

  return `${normalizedBase}${path}`;
}

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new Error('Hermes base URL is required.');
  }

  const url = new URL(trimmed);
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = parsed.password ? '***' : '';
    }

    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, '***');
      }
    }

    return parsed.toString();
  } catch {
    return redactSensitive(url);
  }
}

function redactSensitive(value: string, connection?: HermesConnectionSettings): string {
  let redacted = value;

  if (connection?.bearerToken) {
    redacted = redacted.split(connection.bearerToken).join('***');
  }

  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***');
  redacted = redacted.replace(/([?&\s](?:access_token|authorization|api_key|token|key|auth|bearer)=)[^\s&]+/gi, '$1***');
  redacted = redacted.replace(/:\/\/[^/\s@]+@/g, '://***@');
  return redacted;
}

function isSensitiveKey(key: string): boolean {
  return /^(access_token|authorization|api_key|token|key|auth|bearer)$/i.test(key);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = readTextContent(value);
    if (text) {
      return text;
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
    return readTextContent((message as Record<string, unknown>).content);
  }

  return firstText(record.text);
}

function readOutputContent(outputItem: unknown): string | undefined {
  if (!outputItem || typeof outputItem !== 'object') {
    return undefined;
  }

  return readTextContent((outputItem as Record<string, unknown>).content);
}

function readTextContent(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        return item.trim();
      }

      if (item && typeof item === 'object') {
        const text = (item as Record<string, unknown>).text;
        if (typeof text === 'string' && text.trim()) {
          return text.trim();
        }
      }
    }
  }

  return undefined;
}
