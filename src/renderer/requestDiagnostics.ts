import type {
  DataSharingScope,
  HermesConnectionStatus,
  HermesRequestDiagnostic,
  HermesRequestTiming,
  PrivacyPreset
} from '../shared/types';

export const REQUEST_DIAGNOSTICS_KEY = 'hermes.requestDiagnostics.v1';
export const REQUEST_DIAGNOSTICS_LIMIT = 20;

interface RequestDiagnosticInput {
  id: string;
  startedAt: string;
  completedAt: string;
  status: HermesRequestDiagnostic['status'];
  questionPreview: string;
  selectedWindowName: string;
  selectedWindowKind: 'window' | 'screen';
  selectedWindowId: string;
  connection: {
    connectionKind: HermesRequestDiagnostic['connection']['connectionKind'];
    endpointMode: HermesRequestDiagnostic['connection']['endpointMode'];
    baseUrl: string;
    modelId: string;
    resolvedEndpoint?: string;
    resolvedAdapter?: HermesRequestDiagnostic['connection']['endpointMode'];
  };
  requestContext?: {
    dataSharingScope: DataSharingScope;
    preset: PrivacyPreset;
  };
  request: {
    redactionEnabled: boolean;
    usedFallbackImage: boolean;
    privacySummary?: HermesRequestDiagnostic['request']['privacySummary'];
  };
  timings: HermesRequestTiming;
  connectionStatus?: HermesConnectionStatus;
  failure?: HermesRequestDiagnostic['failure'];
  debugNotes?: string;
}

export interface HermesRequestAverages {
  count: number;
  successCount: number;
  failureCount: number;
  avgLocalRiskMs: number;
  avgOcrMs?: number;
  avgCaptureMs: number;
  avgRequestBuildMs: number;
  avgHermesMs: number;
  avgTotalMs: number;
}

export function createRequestDiagnostic(input: Readonly<RequestDiagnosticInput>): HermesRequestDiagnostic {
  return {
    id: input.id,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: input.status,
    questionPreview: input.questionPreview,
    selectedWindowName:
      input.request.privacySummary?.windowTitle === 'withheld' ? 'Window title withheld' : input.selectedWindowName,
    selectedWindowId:
      input.request.privacySummary?.windowTitle === 'withheld' ? 'Window id withheld' : input.selectedWindowId,
    selectedWindowKind: input.selectedWindowKind,
    connection: {
      connectionKind: input.connection.connectionKind,
      endpointMode: input.connection.endpointMode,
      baseUrl: redactUrl(input.connection.baseUrl),
      modelId: input.connection.modelId,
      ...(input.connection.resolvedEndpoint ? { resolvedEndpoint: redactUrl(input.connection.resolvedEndpoint) } : {}),
      ...(input.connection.resolvedAdapter ? { resolvedAdapter: input.connection.resolvedAdapter } : {})
    },
    ...(input.requestContext ? { requestContext: { ...input.requestContext } } : {}),
    request: {
      redactionEnabled: input.request.redactionEnabled,
      usedFallbackImage: input.request.privacySummary?.screenshot === 'placeholder' ? true : input.request.usedFallbackImage,
      ...(input.request.privacySummary ? { privacySummary: { ...input.request.privacySummary } } : {})
    },
    timings: {
      ...(typeof input.timings.localRiskMs === 'number' ? { localRiskMs: clampNonNegativeInteger(input.timings.localRiskMs) } : {}),
      ...(typeof input.timings.ocrMs === 'number' ? { ocrMs: clampNonNegativeInteger(input.timings.ocrMs) } : {}),
      ...(typeof input.timings.requestBuildMs === 'number'
        ? { requestBuildMs: clampNonNegativeInteger(input.timings.requestBuildMs) }
        : {}),
      ...(typeof input.timings.captureMs === 'number' ? { captureMs: clampNonNegativeInteger(input.timings.captureMs) } : {}),
      ...(typeof input.timings.hermesMs === 'number' ? { hermesMs: clampNonNegativeInteger(input.timings.hermesMs) } : {}),
      ...(typeof input.timings.totalMs === 'number' ? { totalMs: clampNonNegativeInteger(input.timings.totalMs) } : {})
    },
    ...(input.connectionStatus ? { connectionStatus: input.connectionStatus } : {}),
    ...(input.failure
      ? { failure: { ...input.failure, ...(input.failure.reason ? { reason: redactSensitiveText(input.failure.reason) } : {}) } }
      : {}),
    ...(input.debugNotes ? { debugNotes: redactSensitiveText(input.debugNotes) } : {})
  };
}

export function readRequestDiagnostics(storage: Pick<Storage, 'getItem'>): HermesRequestDiagnostic[] {
  return parseRequestDiagnostics(storage.getItem(REQUEST_DIAGNOSTICS_KEY));
}

export function appendRequestDiagnostic(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  diagnostic: HermesRequestDiagnostic,
  limit = REQUEST_DIAGNOSTICS_LIMIT
): HermesRequestDiagnostic[] {
  const list = [diagnostic, ...readRequestDiagnostics(storage)]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .filter(Boolean)
    .slice(0, limit);

  storage.setItem(REQUEST_DIAGNOSTICS_KEY, JSON.stringify(list));
  return list;
}

export function clearRequestDiagnostics(storage: Pick<Storage, 'removeItem'>): HermesRequestDiagnostic[] {
  storage.removeItem(REQUEST_DIAGNOSTICS_KEY);
  return [];
}

export function buildDiagnosticReport(entry: HermesRequestDiagnostic): string {
  const lines = [
    'DocHermes request diagnostic',
    `Request: ${entry.id}`,
    `Status: ${entry.status}`,
    `Started: ${entry.startedAt}`,
    `Finished: ${entry.completedAt}`,
    `Question: ${entry.questionPreview}`,
    `Window: ${entry.request.privacySummary?.windowTitle === 'withheld' ? 'Window title withheld' : entry.selectedWindowName} (${entry.selectedWindowKind})`,
    `Connection: ${entry.connection.connectionKind}/${entry.connection.endpointMode}`,
    `Gateway route/profile: ${entry.connection.modelId}`,
    `Base: ${redactUrl(entry.connection.baseUrl)}`
  ];

  if (entry.connection.resolvedEndpoint) {
    lines.push(`Resolved endpoint: ${redactUrl(entry.connection.resolvedEndpoint)}`);
  }

  if (entry.connection.resolvedAdapter) {
    lines.push(`Resolved adapter: ${entry.connection.resolvedAdapter}`);
  }

  if (entry.requestContext) {
    lines.push(`Data sharing: ${entry.requestContext.dataSharingScope}`);
    lines.push(`Privacy preset: ${entry.requestContext.preset}`);
  }

  lines.push(`Redaction: ${entry.request.redactionEnabled ? 'on' : 'off'}`);
  lines.push(`Image input: ${entry.request.usedFallbackImage ? 'placeholder' : 'screenshot image'}`);

  if (entry.request.privacySummary) {
    lines.push(`Remote consent: ${entry.request.privacySummary.remoteConsentRequired ? 'required' : 'not required'}`);
    lines.push(`Destination origin: ${entry.request.privacySummary.destinationOrigin}`);
    lines.push(`Screenshot: ${entry.request.privacySummary.screenshot}`);
    lines.push(`Memory context: ${entry.request.privacySummary.memoryContext}`);
    lines.push(`Monitoring context: ${entry.request.privacySummary.monitoringContext}`);
    lines.push(`Window title: ${entry.request.privacySummary.windowTitle}`);
    lines.push(`Trade summary: ${entry.request.privacySummary.tradeSummary}`);
    lines.push(`Schema screenshot: ${entry.request.privacySummary.schemaRequiresScreenshot ? 'required' : 'not required'}`);
  }

  if (entry.connectionStatus) {
    lines.push(`Current Hermes status: ${entry.connectionStatus}`);
  }

  if (entry.timings.localRiskMs !== undefined) {
    lines.push(`local risk checks: ${entry.timings.localRiskMs}ms`);
  }

  if (entry.timings.ocrMs !== undefined) {
    lines.push(`ocr: ${entry.timings.ocrMs}ms`);
  }

  lines.push(`request build: ${entry.timings.requestBuildMs ?? 0}ms`);
  lines.push(`capture: ${entry.timings.captureMs ?? 0}ms`);
  lines.push(`hermes: ${entry.timings.hermesMs ?? 0}ms`);
  lines.push(`total: ${entry.timings.totalMs ?? 0}ms`);

  if (entry.failure?.stage || entry.failure?.reason) {
    lines.push(`Failure stage: ${entry.failure?.stage ?? 'unknown'}`);
    if (entry.failure?.reason) {
      lines.push(`Failure detail: ${redactSensitiveText(entry.failure.reason)}`);
    }
  }

  if (entry.debugNotes) {
    lines.push(`Notes: ${redactSensitiveText(entry.debugNotes)}`);
  }

  return lines.join('\n');
}

export function summarizeDiagnostics(diagnostics: HermesRequestDiagnostic[]): HermesRequestAverages {
  const success = diagnostics.filter((diagnostic) => diagnostic.status === 'success');
  const fallback = { count: diagnostics.length, successCount: success.length, failureCount: diagnostics.length - success.length };
  const ocrSamples = success.filter((entry) => entry.timings.ocrMs !== undefined);

  return {
    ...fallback,
    avgLocalRiskMs: Math.round(average(success, (entry) => entry.timings.localRiskMs ?? 0)),
    avgOcrMs: ocrSamples.length > 0 ? Math.round(average(ocrSamples, (entry) => entry.timings.ocrMs ?? 0)) : undefined,
    avgCaptureMs: Math.round(average(success, (entry) => entry.timings.captureMs ?? 0)),
    avgRequestBuildMs: Math.round(average(success, (entry) => entry.timings.requestBuildMs ?? 0)),
    avgHermesMs: Math.round(average(success, (entry) => entry.timings.hermesMs ?? 0)),
    avgTotalMs: Math.round(average(success, (entry) => entry.timings.totalMs ?? 0))
  };
}

export function sanitizeQuestionPreview(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) {
    return '[empty request]';
  }

  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function parseRequestDiagnostics(rawValue: string | null): HermesRequestDiagnostic[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is HermesRequestDiagnostic => isRequestDiagnostic(entry)).sort((left, right) => {
      return right.startedAt.localeCompare(left.startedAt);
    });
  } catch {
    return [];
  }
}

function isRequestDiagnostic(value: unknown): value is HermesRequestDiagnostic {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as HermesRequestDiagnostic;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.startedAt === 'string' &&
    typeof candidate.completedAt === 'string' &&
    (candidate.status === 'success' || candidate.status === 'failure') &&
    typeof candidate.questionPreview === 'string' &&
    typeof candidate.selectedWindowName === 'string' &&
    (candidate.selectedWindowKind === 'window' || candidate.selectedWindowKind === 'screen') &&
    typeof candidate.selectedWindowId === 'string' &&
    candidate.connection !== undefined &&
    typeof candidate.connection.connectionKind === 'string' &&
    typeof candidate.connection.endpointMode === 'string' &&
    typeof candidate.connection.baseUrl === 'string' &&
    typeof candidate.connection.modelId === 'string' &&
    typeof candidate.request.redactionEnabled === 'boolean' &&
    typeof candidate.request.usedFallbackImage === 'boolean' &&
    (candidate.request.privacySummary === undefined || isPrivacySummary(candidate.request.privacySummary)) &&
    typeof candidate.timings.totalMs === 'number'
  );
}

function isPrivacySummary(value: unknown): value is HermesRequestDiagnostic['request']['privacySummary'] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as NonNullable<HermesRequestDiagnostic['request']['privacySummary']>;
  return (
    isDisposition(candidate.screenshot) &&
    isDisposition(candidate.memoryContext) &&
    isDisposition(candidate.monitoringContext) &&
    isDisposition(candidate.windowTitle) &&
    isDisposition(candidate.tradeSummary) &&
    typeof candidate.schemaRequiresScreenshot === 'boolean' &&
    typeof candidate.remoteConsentRequired === 'boolean' &&
    typeof candidate.dataSharingScope === 'string' &&
    typeof candidate.connectionKind === 'string' &&
    typeof candidate.preset === 'string' &&
    typeof candidate.destinationOrigin === 'string'
  );
}

function isDisposition(value: unknown): boolean {
  return value === 'sent' || value === 'withheld' || value === 'placeholder' || value === 'not-provided';
}

function average(entries: HermesRequestDiagnostic[], selector: (entry: HermesRequestDiagnostic) => number): number {
  if (entries.length === 0) {
    return 0;
  }

  const total = entries.reduce((sum, entry) => sum + selector(entry), 0);
  return total / entries.length;
}

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.max(0, Math.round(value));
  return Number.isFinite(rounded) ? rounded : 0;
}

function redactUrl(value: string): string {
  try {
    const parsed = new URL(value);
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
    return value;
  }
}

function isSensitiveKey(key: string): boolean {
  return /^(access_token|authorization|api_key|token|key|auth|bearer)$/i.test(key);
}

function redactSensitiveText(value: string): string {
  if (/\b(authorization|bearer|access[_-]?token|api[_-]?key|token|secret)\b/i.test(value)) {
    return '[redacted sensitive diagnostic detail]';
  }

  return value;
}
