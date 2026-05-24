import type {
  AskHermesInput,
  HermesConnectionKind,
  HermesConnectionSettings,
  HermesEndpointMode,
  VoiceHotkey,
  PrivacyPreset,
  PrivacyRedactionSettings,
  PrivacySettings,
  MemoryContext,
  MonitoringContextPayload,
  JournalMonitoringSignal,
  OcrRegionProfileSettings,
  VoiceSettings
} from '../shared/types';
import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL, MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER } from '../shared/privacy';

export const MAX_SCREENSHOT_BYTES = 12_000_000;
const PNG_DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=]*)$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const DEFAULT_HERMES_GATEWAY_ROUTE = 'hermes-agent';
const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  preset: 'balanced',
  redaction: {
    redactAddresses: false,
    redactBalances: false,
    redactUsernames: false,
    redactAmounts: false
  }
};
export const DEFAULT_OCR_REGION_PROFILE: OcrRegionProfileSettings = {
  overlayEnabled: true,
  orderPanel: {
    left: 0.58,
    top: 0.03,
    width: 0.39,
    height: 0.94
  },
  chartZone: {
    left: 0.03,
    top: 0.03,
    width: 0.54,
    height: 0.58
  }
};

export function assertAskHermesInput(input: unknown): AskHermesInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Hermes request input is required.');
  }

  const record = input as AskHermesInput;

  const connection = assertHermesConnection(record.connection);
  const privacy = parsePrivacySettings(record.privacy);

  if (typeof record.question !== 'string' || !record.question.trim()) {
    throw new Error('Question is required.');
  }

  if (typeof record.screenshotDataUrl !== 'string' || !record.screenshotDataUrl.trim()) {
    throw new Error('Screenshot is required.');
  }

  const payloadMatch = PNG_DATA_URL_RE.exec(record.screenshotDataUrl);
  if (!payloadMatch) {
    throw new Error('Screenshot must be a PNG data URL.');
  }

  const payload = payloadMatch[1];
  if (!BASE64_RE.test(payload)) {
    throw new Error('Screenshot must include valid PNG base64 payload.');
  }

  const screenshotBytes = estimateBase64Bytes(payload);
  if (screenshotBytes > MAX_SCREENSHOT_BYTES) {
    throw new Error('Screenshot payload is too large. Close the source window or resize capture target.');
  }

  if (!record.selectedWindow || typeof record.selectedWindow !== 'object') {
    throw new Error('Selected window is required.');
  }

  if (typeof record.selectedWindow.id !== 'string' || !record.selectedWindow.id.trim()) {
    throw new Error('Selected window id is required.');
  }

  if (typeof record.selectedWindow.name !== 'string' || !record.selectedWindow.name.trim()) {
    throw new Error('Selected window name is required.');
  }

  if (record.selectedWindow.kind !== 'window' && record.selectedWindow.kind !== 'screen') {
    throw new Error('Selected window kind is invalid.');
  }

  if (privacy.preset === 'maximum') {
    assertMaximumPrivacyRequest(record);
  }

  const memoryContext = parseMemoryContext(record.memoryContext);
  const monitoringContext = parseMonitoringContext(record.monitoringContext);

  return {
    ...record,
    connection,
    privacy,
    memoryContext,
    monitoringContext
  };
}

export function assertHermesConnection(input: unknown): HermesConnectionSettings {
  if (!input || typeof input !== 'object') {
    throw new Error('Hermes connection settings are required.');
  }

  const record = input as HermesConnectionSettings;

  if (!isConnectionKind(record.connectionKind)) {
    throw new Error('Hermes connection kind is invalid.');
  }

  if (!isEndpointMode(record.endpointMode)) {
    throw new Error('Hermes gateway adapter mode is invalid.');
  }

  if (typeof record.baseUrl !== 'string' || !record.baseUrl.trim()) {
    throw new Error('Hermes gateway URL is required.');
  }

  const baseUrl = record.baseUrl.trim();
  const modelId =
    typeof record.modelId === 'string' && record.modelId.trim()
      ? record.modelId.trim()
      : DEFAULT_HERMES_GATEWAY_ROUTE;

  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error('Hermes gateway URL must be a valid http or https URL.');
  }

  if (typeof record.bearerToken !== 'string') {
    throw new Error('Hermes bearer token must be a string.');
  }

  return {
    ...record,
    baseUrl,
    modelId,
    bearerToken: record.bearerToken.trim()
  };
}

function assertMaximumPrivacyRequest(record: AskHermesInput): void {
  if (record.screenshotDataUrl !== MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL) {
    throw new Error('Maximum privacy requests must use the placeholder screenshot.');
  }

  if (
    record.selectedWindow.id !== MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER.id ||
    record.selectedWindow.name !== MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER.name ||
    record.selectedWindow.kind !== MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER.kind ||
    record.selectedWindow.thumbnailDataUrl !== MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER.thumbnailDataUrl
  ) {
    throw new Error('Maximum privacy requests must use placeholder window metadata.');
  }

  if (record.memoryContext !== undefined) {
    throw new Error('Maximum privacy requests must not include memory context.');
  }

  if (record.monitoringContext !== undefined) {
    throw new Error('Maximum privacy requests must not include monitoring context.');
  }
}

export function assertVoiceSettings(input: unknown): { enabled: boolean; hotkey: VoiceHotkey; speakReplies: boolean } {
  if (!input || typeof input !== 'object') {
    throw new Error('Voice settings payload is required.');
  }

  const record = input as Partial<VoiceSettings>;

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : false,
    hotkey: parseVoiceHotkey(record.hotkey),
    speakReplies: typeof record.speakReplies === 'boolean' ? record.speakReplies : false
  };
}

export function assertOcrRegionProfileSettings(input: unknown): OcrRegionProfileSettings {
  if (!input || typeof input !== 'object') {
    throw new Error('OCR region profile payload is required.');
  }

  const candidate = input as Partial<OcrRegionProfileSettings>;

  return {
    overlayEnabled:
      typeof candidate.overlayEnabled === 'boolean'
        ? candidate.overlayEnabled
        : DEFAULT_OCR_REGION_PROFILE.overlayEnabled,
    orderPanel: assertNormalizedRegionRect(candidate.orderPanel, DEFAULT_OCR_REGION_PROFILE.orderPanel, 'orderPanel'),
    chartZone: assertNormalizedRegionRect(candidate.chartZone, DEFAULT_OCR_REGION_PROFILE.chartZone, 'chartZone')
  };
}

export function isConnectionKind(value: unknown): value is HermesConnectionKind {
  return value === 'local' || value === 'hosted' || value === 'custom';
}

export function isEndpointMode(value: unknown): value is HermesEndpointMode {
  return value === 'auto' || value === 'openai-chat' || value === 'legacy-coach' || value === 'custom';
}

function parseVoiceHotkey(value: unknown): VoiceHotkey {
  if (value === 'space' || value === 'alt-space' || value === 'ctrl-space' || value === 'cmd-space') {
    return value;
  }

  return 'space';
}

function parsePrivacySettings(value: unknown): PrivacySettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PRIVACY_SETTINGS;
  }

  const candidate = value as Partial<PrivacySettings>;
  const preset = parsePrivacyPreset(candidate.preset);
  const redaction = parsePrivacyRedaction(candidate.redaction);

  return {
    preset,
    redaction
  };
}

function parsePrivacyPreset(value: unknown): PrivacyPreset {
  return value === 'maximum' || value === 'balanced' || value === 'full' ? value : DEFAULT_PRIVACY_SETTINGS.preset;
}

function parsePrivacyRedaction(rawValue: unknown): PrivacyRedactionSettings {
  if (!rawValue || typeof rawValue !== 'object') {
    return DEFAULT_PRIVACY_SETTINGS.redaction;
  }

  const candidate = rawValue as Partial<PrivacyRedactionSettings>;

  return {
    redactAddresses:
      typeof candidate.redactAddresses === 'boolean'
        ? candidate.redactAddresses
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactAddresses,
    redactBalances:
      typeof candidate.redactBalances === 'boolean'
        ? candidate.redactBalances
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactBalances,
    redactUsernames:
      typeof candidate.redactUsernames === 'boolean'
        ? candidate.redactUsernames
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactUsernames,
    redactAmounts:
      typeof candidate.redactAmounts === 'boolean'
        ? candidate.redactAmounts
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactAmounts
  };
}

function parseMemoryContext(value: unknown): MemoryContext | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Memory context is invalid.');
  }

  const candidate = value as Partial<MemoryContext>;
  if (!Array.isArray(candidate.matchedPatterns) || !Array.isArray(candidate.recentNotes)) {
    throw new Error('Memory context is invalid.');
  }

  for (const pattern of candidate.matchedPatterns) {
    if (!pattern || typeof pattern !== 'object') {
      throw new Error('Memory context is invalid.');
    }
    const record = pattern as MemoryContext['matchedPatterns'][number];
    if (
      typeof record.name !== 'string' ||
      typeof record.evidenceCount !== 'number' ||
      typeof record.summary !== 'string' ||
      typeof record.recommendation !== 'string'
    ) {
      throw new Error('Memory context is invalid.');
    }
  }

  for (const note of candidate.recentNotes) {
    if (!note || typeof note !== 'object') {
      throw new Error('Memory context is invalid.');
    }
    const record = note as MemoryContext['recentNotes'][number];
    if (
      typeof record.createdAt !== 'string' ||
      typeof record.question !== 'string' ||
      typeof record.response !== 'string' ||
      typeof record.notes !== 'string' ||
      typeof record.selectedWindowName !== 'string'
    ) {
      throw new Error('Memory context is invalid.');
    }
  }

  return value as MemoryContext;
}

function parseMonitoringContext(value: unknown): MonitoringContextPayload | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Monitoring context is invalid.');
  }

  const candidate = value as Partial<MonitoringContextPayload>;
  if (!Array.isArray(candidate.localWarnings) || !Array.isArray(candidate.signals)) {
    throw new Error('Monitoring context is invalid.');
  }

  if (!candidate.localWarnings.every((warning) => typeof warning === 'string')) {
    throw new Error('Monitoring context is invalid.');
  }

  if (!candidate.signals.every(isJournalMonitoringSignal)) {
    throw new Error('Monitoring context is invalid.');
  }

  return value as MonitoringContextPayload;
}

function isJournalMonitoringSignal(value: unknown): value is JournalMonitoringSignal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const signal = value as JournalMonitoringSignal;
  return (
    (signal.source === 'clipboard' || signal.source === 'ocr-placeholder') &&
    (signal.kind === 'evm-address' ||
      signal.kind === 'evm-tx-hash' ||
      signal.kind === 'sol-address' ||
      signal.kind === 'dex-url' ||
      signal.kind === 'wallet-address' ||
      signal.kind === 'unknown') &&
    typeof signal.maskedValue === 'string' &&
    (signal.confidence === 'high' || signal.confidence === 'medium' || signal.confidence === 'low') &&
    typeof signal.detectedAt === 'string' &&
    (signal.message === undefined || typeof signal.message === 'string')
  );
}

function assertNormalizedRegionRect(
  value: unknown,
  fallback: OcrRegionProfileSettings['orderPanel'],
  fieldName: string
): OcrRegionProfileSettings['orderPanel'] {
  if (!value || typeof value !== 'object') {
    throw new Error(`OCR region profile ${fieldName} rectangle is required.`);
  }

  const candidate = value as Partial<OcrRegionProfileSettings['orderPanel']>;
  const left = clampNormalizedComponent(candidate.left, fallback.left, `${fieldName}.left`);
  const top = clampNormalizedComponent(candidate.top, fallback.top, `${fieldName}.top`);
  const width = clampNormalizedDimension(candidate.width, fallback.width, `${fieldName}.width`);
  const height = clampNormalizedDimension(candidate.height, fallback.height, `${fieldName}.height`);

  if (left + width > 1.0001) {
    throw new Error(`OCR region profile ${fieldName} exceeds horizontal bounds.`);
  }

  if (top + height > 1.0001) {
    throw new Error(`OCR region profile ${fieldName} exceeds vertical bounds.`);
  }

  return {
    left: roundNormalized(left),
    top: roundNormalized(top),
    width: roundNormalized(width),
    height: roundNormalized(height)
  };
}

function clampNormalizedComponent(value: unknown, fallback: number, field: string): number {
  const nextValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (nextValue < 0 || nextValue > 1) {
    throw new Error(`OCR region profile ${field} must be between 0 and 1.`);
  }

  return nextValue;
}

function clampNormalizedDimension(value: unknown, fallback: number, field: string): number {
  const nextValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (nextValue <= 0 || nextValue > 1) {
    throw new Error(`OCR region profile ${field} must be greater than 0 and at most 1.`);
  }

  return nextValue;
}

function roundNormalized(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function estimateBase64Bytes(dataUrl: string): number {
  let payload = dataUrl;

  if (dataUrl.startsWith('data:image/png;base64,')) {
    const match = dataUrl.match(/^data:image\/png;base64,(.*)$/);
    if (!match || match[0] !== dataUrl) {
      return 0;
    }

    payload = match[1];
  }

  if (!BASE64_RE.test(payload)) {
    return 0;
  }

  if (!payload) {
    return 0;
  }

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor(payload.length * 3 / 4 - padding);
}
