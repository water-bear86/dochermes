import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL } from '../shared/privacy';
import type {
  AskHermesInput,
  BuildHermesPayloadInput,
  MonitoringContextPayload,
  MemoryContext,
  HermesConnectionReport,
  HermesConnectionSettings,
  HermesEndpointMode,
  HermesPayload,
  PrivacySettings,
  PrivacyRedactionSettings,
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
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_PRIVACY_PRESET: PrivacySettings = {
  preset: 'balanced',
  redaction: {
    redactAddresses: false,
    redactBalances: false,
    redactUsernames: false,
    redactAmounts: false
  }
};

const SYSTEM_PROMPT =
  'You are DocHermes, a risk coach for trading workflows. You do not place trades, route orders, access wallets, or provide execution commands. Analyze the selected trading-window screenshot and the user question. Focus on risk, confirmation, invalidation, position sizing discipline, and emotional overtrading.';

// Codex-backed Hermes rejects 1x1 placeholder images, so probe with a tiny synthetic screenshot.
const PROBE_SCREENSHOT_DATA_URL = MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL;

export { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL };

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

function buildOpenAiTextPingPayload(input: OpenAiChatPayloadInput) {
  return {
    model: input.modelId,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: buildUserPromptText(input)
      }
    ]
  };
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

  if (input.monitoringContext) {
    payload.monitoringContext = input.monitoringContext;
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
  const privacyInput = buildPrivacyAwarePayloadInput(input);
  const endpoint = resolveHermesEndpoint(input.connection);
  const adapter = selectAdapter(input.connection);
  const body =
    adapter === 'openai-chat'
      ? buildOpenAiChatPayload({
          ...privacyInput,
          modelId: input.connection.modelId
        })
      : buildHermesPayload(privacyInput);
  let response: Response;

  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: buildHeaders(input.connection),
        body: JSON.stringify(body)
      },
      fetchImpl
    );
  } catch (error) {
    const errorKind = classifyProbeErrorKind(error);
    const suffix =
      error instanceof Error ? error.message : 'Unknown network failure while contacting Hermes gateway.';
    if (errorKind === 'timeout') {
      throw new Error(`Hermes request timed out after ${REQUEST_TIMEOUT_MS}ms: ${suffix}`);
    }

    throw new Error(`Failed to connect to Hermes gateway: ${suffix}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const normalized = detail.trim();
    const detailSuffix = normalized ? ` (${normalized})` : '';
    const kind = classifyResponseErrorKind(response.status, normalized, response.url);

    if (kind === 'auth') {
      throw new Error(`Hermes rejected authentication for the configured endpoint (${response.status}).${detailSuffix}`);
    }

    if (kind === 'model') {
      throw new Error(
        `Hermes rejected the configured model id "${input.connection.modelId}" while using this endpoint (${response.status}).${detailSuffix}`
      );
    }

    if (kind === 'incompatible') {
      throw new Error(`Hermes endpoint does not support this route (${response.status}).${detailSuffix}`);
    }

    throw new Error(`Hermes gateway returned ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.${detailSuffix}`);
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

    if (connection.endpointMode === 'auto' && textPing.attempt.errorKind === 'incompatible') {
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

  const status = summarizeProbeConnectionStatus(attempts);
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
    const kindLabel = attempt.errorKind ? ` [${attempt.errorKind}]` : '';
    lines.push(
      `- ${attempt.method} ${maskUrl(attempt.url)} -> ${attempt.status} ${attempt.ok ? 'OK' : 'FAIL'} (${attempt.label})${kindLabel} ${redactSensitive(attempt.detail, connection)}`
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

  if (
    input.monitoringContext &&
    (input.monitoringContext.localWarnings.length > 0 ||
      input.monitoringContext.signals.length > 0 ||
      (input.monitoringContext.warningEvidence?.length ?? 0) > 0 ||
      (input.monitoringContext.sourceQuality?.length ?? 0) > 0)
  ) {
    lines.push('', 'Monitoring summary (compact provenance):', summarizeMonitoringContext(input.monitoringContext));
  }

  if (
    input.memoryContext &&
    (input.memoryContext.matchedPatterns.length > 0 ||
      input.memoryContext.recentNotes.length > 0 ||
      (input.memoryContext.personalRules?.matchedRules.length ?? 0) > 0)
  ) {
    lines.push('', 'Compact personal memory context:', JSON.stringify(input.memoryContext));
  }

  return lines.join('\n');
}

function summarizeMonitoringContext(context: MonitoringContextPayload): string {
  const summary: {
    localWarnings: string[];
    warningEvidence?: Array<{ warningText: string; source: string; confidence: string; detail?: string; detectedAt?: string }>;
    sourceQuality?: Array<{ category: string; confidence: string; provenance: string }>;
  } = {
    localWarnings: context.localWarnings
  };

  if (context.warningEvidence && context.warningEvidence.length > 0) {
    summary.warningEvidence = context.warningEvidence.slice(0, 12).map((entry) => ({
      warningText: entry.warningText,
      source: entry.source,
      confidence: entry.confidence,
      ...(entry.detail ? { detail: entry.detail } : {}),
      ...(entry.detectedAt ? { detectedAt: entry.detectedAt } : {})
    }));
  }

  if ((context.sourceQuality?.length ?? 0) > 0) {
    summary.sourceQuality = context.sourceQuality!.slice(0, 6).map((entry) => ({
      category: entry.category,
      confidence: entry.confidence,
      provenance: entry.provenance
    }));
  }

  return JSON.stringify(summary);
}

function normalizePrivacySettings(value: PrivacySettings | undefined): PrivacySettings {
  if (!value) {
    return DEFAULT_PRIVACY_PRESET;
  }

  return {
    preset: value.preset === 'maximum' || value.preset === 'balanced' || value.preset === 'full' ? value.preset : DEFAULT_PRIVACY_PRESET.preset,
    redaction: normalizePrivacyRedaction(value.redaction)
  };
}

function normalizePrivacyRedaction(rawValue: PrivacyRedactionSettings | undefined): PrivacyRedactionSettings {
  if (!rawValue) {
    return DEFAULT_PRIVACY_PRESET.redaction;
  }

  return {
    redactAddresses:
      typeof rawValue.redactAddresses === 'boolean' ? rawValue.redactAddresses : DEFAULT_PRIVACY_PRESET.redaction.redactAddresses,
    redactBalances:
      typeof rawValue.redactBalances === 'boolean' ? rawValue.redactBalances : DEFAULT_PRIVACY_PRESET.redaction.redactBalances,
    redactUsernames:
      typeof rawValue.redactUsernames === 'boolean' ? rawValue.redactUsernames : DEFAULT_PRIVACY_PRESET.redaction.redactUsernames,
    redactAmounts:
      typeof rawValue.redactAmounts === 'boolean' ? rawValue.redactAmounts : DEFAULT_PRIVACY_PRESET.redaction.redactAmounts
  };
}

function buildPrivacyAwarePayloadInput(input: AskHermesInput): BuildHermesPayloadInput {
  const privacy = normalizePrivacySettings(input.privacy);
  const redaction =
    privacy.preset === 'maximum'
      ? {
          redactAddresses: true,
          redactBalances: true,
          redactUsernames: true,
          redactAmounts: true
        }
      : privacy.redaction;
  return {
    question: applyPrivacyRedaction(input.question, redaction).trim(),
    screenshotDataUrl:
      privacy.preset === 'maximum' ? MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL : input.screenshotDataUrl,
    selectedWindow: maybeSanitizeSelectedWindow(input.selectedWindow, privacy.preset),
    memoryContext: privacy.preset === 'maximum' ? undefined : applyMemoryContextRedaction(input.memoryContext, redaction),
    monitoringContext: applyMonitoringContext(
      maybeRestrictMonitoringContext(input.monitoringContext, privacy.preset),
      redaction
    )
  };
}

function maybeSanitizeSelectedWindow(
  selectedWindow: BuildHermesPayloadInput['selectedWindow'],
  preset: PrivacySettings['preset']
): BuildHermesPayloadInput['selectedWindow'] {
  if (preset !== 'maximum') {
    return selectedWindow;
  }

  return {
    ...selectedWindow,
    id: selectedWindow.id || 'local-window',
    name: 'Local context selected'
  };
}

function maybeRestrictMonitoringContext(
  monitoringContext: MonitoringContextPayload | undefined,
  preset: PrivacySettings['preset']
): MonitoringContextPayload | undefined {
  if (preset === 'maximum') {
    return undefined;
  }

  if (!monitoringContext) {
    return undefined;
  }

  return monitoringContext;
}

function applyMonitoringContext(
  monitoringContext: MonitoringContextPayload | undefined,
  redaction: PrivacyRedactionSettings
): MonitoringContextPayload | undefined {
  if (!monitoringContext) {
    return undefined;
  }

  return {
    localWarnings: monitoringContext.localWarnings.map((warning) => applyPrivacyRedaction(warning, redaction)),
    ...(monitoringContext.warningEvidence
      ? {
          warningEvidence: monitoringContext.warningEvidence.map((entry) => ({
            warningText: entry.warningText,
            source: applyPrivacyRedaction(entry.source, redaction),
            detail: applyPrivacyRedaction(entry.detail, redaction),
            confidence: entry.confidence,
            ...(entry.provenance ? { provenance: applyPrivacyRedaction(entry.provenance, redaction) } : {}),
            ...(entry.detectedAt ? { detectedAt: entry.detectedAt } : {})
          }))
        }
      : {}),
    signals: monitoringContext.signals.map((signal) => ({
      ...signal,
      maskedValue: applyPrivacyRedaction(signal.maskedValue, redaction)
    })),
        ...(monitoringContext.sourceQuality
          ? {
              sourceQuality: monitoringContext.sourceQuality.map((finding) => ({
                category: finding.category,
                confidence: finding.confidence,
                provenance: finding.provenance,
                reason: applyPrivacyRedaction(finding.reason, redaction),
                ...(finding.tokenHint ? { tokenHint: applyPrivacyRedaction(finding.tokenHint, redaction) } : {})
              }))
            }
          : {})
  };
}

function applyMemoryContextRedaction(
  memoryContext: MemoryContext | undefined,
  redaction: PrivacyRedactionSettings
): MemoryContext | undefined {
  if (!memoryContext) {
    return undefined;
  }

  return {
    matchedPatterns: memoryContext.matchedPatterns.map((pattern) => ({
      name: applyPrivacyRedaction(pattern.name, redaction),
      evidenceCount: pattern.evidenceCount,
      summary: applyPrivacyRedaction(pattern.summary, redaction),
      recommendation: applyPrivacyRedaction(pattern.recommendation, redaction)
    })),
    recentNotes: memoryContext.recentNotes.map((note) => ({
      createdAt: note.createdAt,
      question: applyPrivacyRedaction(note.question, redaction),
      response: applyPrivacyRedaction(note.response, redaction),
      notes: applyPrivacyRedaction(note.notes, redaction),
      selectedWindowName: note.selectedWindowName
    })),
    ...(memoryContext.personalRules
      ? {
          personalRules: {
            totalRules: memoryContext.personalRules.totalRules,
            activeRules: memoryContext.personalRules.activeRules,
            matchedRules: memoryContext.personalRules.matchedRules.map((match) => ({
              ruleId: match.ruleId,
              text: applyPrivacyRedaction(match.text, redaction),
              policyLevel: match.policyLevel,
              warningText: applyPrivacyRedaction(match.warningText, redaction),
              source: applyPrivacyRedaction(match.source, redaction),
              detail: applyPrivacyRedaction(match.detail, redaction),
              confidence: match.confidence,
              provenance: applyPrivacyRedaction(match.provenance, redaction)
            }))
          }
        }
      : {})
  };
}

function applyPrivacyRedaction(value: string, redaction: PrivacyRedactionSettings): string {
  if (value.length === 0) {
    return value;
  }

  let nextValue = value;

  if (redaction.redactAddresses) {
    nextValue = nextValue.replace(/\b0x[a-fA-F0-9]{40,64}\b/g, '[redacted address]');
    nextValue = nextValue.replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, '[redacted address]');
  }

  if (redaction.redactUsernames) {
    nextValue = nextValue.replace(/@[A-Za-z0-9_]{2,40}/g, '[redacted username]');
  }

  if (redaction.redactBalances || redaction.redactAmounts) {
    nextValue = nextValue.replace(/\b(?:\$?\d{1,3}(?:,\d{3})*|\$?\d+)(?:\.\d+)?\s?(?:USDC|USDT|SOL|ETH|BTC|USD|USDC\/B|USDT\/B|BNB)?\b/gi, '[redacted amount]');
  }

  return nextValue;
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
            screenshotDataUrl: PROBE_SCREENSHOT_DATA_URL,
            selectedWindow
          })
        : buildOpenAiTextPingPayload({
            modelId: connection.modelId,
            question: 'DocHermes text ping. Reply with pong.',
            screenshotDataUrl: PROBE_SCREENSHOT_DATA_URL,
            selectedWindow
          })
      : buildHermesPayload({
          question: includeImage ? 'DocHermes image ping. Reply with pong.' : 'DocHermes text ping. Reply with pong.',
          screenshotDataUrl: PROBE_SCREENSHOT_DATA_URL,
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
    const response = await fetchWithTimeout(url, {
      method,
      headers: buildHeaders(connection),
      body: body ? JSON.stringify(body) : undefined
    }, fetchImpl);
    const parsedBody = await readResponseBody(response);
    const detail = response.ok ? summarizeBody(parsedBody) : summarizeBody(parsedBody) || response.statusText;
    const errorKind = response.ok ? undefined : classifyResponseErrorKind(response.status, detail, url);
    const contentType = response.headers.get('content-type') ?? '';
    const isPingCheck = label === 'text ping' || label === 'image ping';
    const ok =
      response.ok && (!isPingCheck || canParseResponseText(parsedBody, contentType));

    return {
      attempt: {
        url,
        method,
        ok,
        status: response.status,
        label,
        detail,
        errorKind
      },
      body: parsedBody
    };
  } catch (error) {
    const errorKind = classifyProbeErrorKind(error);
    return {
      attempt: {
        url,
        method,
        ok: false,
        status: 0,
        label,
        detail: error instanceof Error ? error.message : 'Network error',
        errorKind
      },
      body: undefined
    };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function classifyResponseErrorKind(status: number, detail: string | undefined, url: string): ProbeAttempt['errorKind'] {
  const lowerDetail = (detail || '').toLowerCase();

  if (status === 401 || status === 403) {
    return 'auth';
  }

  if (/model/i.test(lowerDetail) && /not\s+found|does not exist|unknown|invalid/.test(lowerDetail)) {
    return 'model';
  }

  if ((status === 404 || status === 405) && /\/v1\/chat\/completions/i.test(url)) {
    return 'incompatible';
  }

  if (status >= 500) {
    return 'network';
  }

  return undefined;
}

function classifyProbeErrorKind(error: unknown): ProbeAttempt['errorKind'] {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || /timed? ?out/i.test(error.message)) {
      return 'timeout';
    }

    return 'network';
  }

  return 'network';
}

function summarizeProbeConnectionStatus(attempts: ProbeAttempt[]): HermesConnectionReport['status'] {
  if (attempts.some((attempt) => attempt.errorKind === 'auth')) {
    return 'auth-error';
  }

  if (attempts.some((attempt) => attempt.errorKind === 'model')) {
    return 'model-error';
  }

  if (attempts.some((attempt) => attempt.errorKind === 'incompatible')) {
    return 'incompatible';
  }

  if (attempts.some((attempt) => attempt.errorKind === 'timeout')) {
    return 'disconnected';
  }

  return 'disconnected';
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => undefined);
  }

  return response.text().catch(() => undefined);
}

function canParseResponseText(body: unknown, contentType = ''): boolean {
  if (typeof body === 'string' && /text\/html/i.test(contentType) && looksLikeHtmlResponse(body)) {
    return false;
  }

  try {
    return Boolean(parseHermesResponse(body));
  } catch {
    return false;
  }
}

function looksLikeHtmlResponse(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<title>');
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

  if (attempts.some((attempt) => attempt.errorKind === 'timeout')) {
    return 'Hermes did not respond before the request timeout. Check the Hermes endpoint and network connection.';
  }

  if (attempts.some((attempt) => attempt.errorKind === 'network')) {
    return 'Hermes was unreachable. Check that the endpoint URL is running and accessible.';
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
