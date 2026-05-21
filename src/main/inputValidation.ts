import type {
  AskHermesInput,
  HermesConnectionKind,
  HermesConnectionSettings,
  HermesEndpointMode
} from '../shared/types';

export const MAX_SCREENSHOT_BYTES = 12_000_000;
const PNG_DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=]*)$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function assertAskHermesInput(input: unknown): AskHermesInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Hermes request input is required.');
  }

  const record = input as AskHermesInput;

  assertHermesConnection(record.connection);

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

  return record;
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
    throw new Error('Hermes endpoint mode is invalid.');
  }

  if (typeof record.baseUrl !== 'string' || !record.baseUrl.trim()) {
    throw new Error('Hermes base URL is required.');
  }

  const baseUrl = record.baseUrl.trim();
  const modelId = typeof record.modelId === 'string' ? record.modelId.trim() : '';

  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error('Hermes base URL must be a valid http or https URL.');
  }

  if (!modelId) {
    throw new Error('Hermes model ID is required.');
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

export function isConnectionKind(value: unknown): value is HermesConnectionKind {
  return value === 'local' || value === 'hosted' || value === 'custom';
}

export function isEndpointMode(value: unknown): value is HermesEndpointMode {
  return value === 'auto' || value === 'openai-chat' || value === 'legacy-coach' || value === 'custom';
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
