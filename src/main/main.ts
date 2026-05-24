import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage, safeStorage, type Tray } from 'electron';

import { askHermes, probeHermesConnection } from './hermesClient';
import { createCoachTray, refreshCoachTrayMenu } from './tray';
import { createCoachWindow } from './coachWindow';
import {
  assertAskHermesInput,
  assertHermesConnection,
  assertOcrRegionProfileSettings,
  assertVoiceSettings,
  DEFAULT_OCR_REGION_PROFILE
} from './inputValidation';
import { extractClipboardSignalsFromText } from './monitoringSignals';
import { closeOcrWorker, runOcrOnImageDataUrl, type OcrRegion } from './ocr';
import { captureWindowSource, isSourceAvailable, listWindowSources } from './windowSources';
import type {
  MonitoringSignal,
  MonitoringStatus,
  OcrContextMode,
  OcrRegionProfileSettings,
  HostedHermesTokenSaveInput,
  HostedHermesTokenStatus,
  VoiceSettings
} from '../shared/types';

let coachWindow: BrowserWindow | undefined;
let coachTray: Tray | undefined;
let isQuitting = false;
let isArmed = false;
let watchClipboard = false;
let watchOCR = false;
let ocrContextMode: OcrContextMode = 'full-window';
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  hotkey: 'space',
  speakReplies: false
};
let activeVoiceSettings: VoiceSettings = DEFAULT_VOICE_SETTINGS;
let activeVoiceShortcut: string | null = null;
let activeOcrRegionProfile: OcrRegionProfileSettings = DEFAULT_OCR_REGION_PROFILE;
let monitorTimer: ReturnType<typeof setInterval> | undefined;
let lastClipboardText = '';
let lastOCRImageDataUrl = '';
let monitorSourceId: string | undefined;
interface NormalizedOcrRegionProfile {
  id: string;
  label: string;
  rectangle?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

const ocrRegionProfiles = new Map<string, NormalizedOcrRegionProfile[]>();
const recentMonitorSignals = new Map<string, number>();
let isWindowVisible = false;

const MONITOR_POLL_MS = 1000;
const MONITOR_SIGNAL_RETENTION_MS = 30_000;
const MONITOR_SIGNAL_REPEAT_GAP_MS = 10_000;
const HOSTED_HERMES_TOKEN_FILE = 'hosted-hermes-token.json';

interface HostedHermesTokenRecord {
  version: 1;
  updatedAt: string;
  ciphertextBase64: string;
}

app.setName('Hermes Coach');

function showCoach(): void {
  if (!coachWindow || coachWindow.isDestroyed()) {
    coachWindow = createCoachWindow({
      shouldHideOnClose: () => !isQuitting,
      onHide: () => {
        isWindowVisible = false;
        refreshTrayState();
      }
    });
    isWindowVisible = true;
    refreshTrayState();
    return;
  }

  if (!coachWindow.isVisible()) {
    isWindowVisible = true;
  }

  coachWindow.show();
  coachWindow.focus();
  refreshTrayState();
}

function hideCoach(): void {
  coachWindow?.hide();
  isWindowVisible = false;
  refreshTrayState();
}

function promptWindowSelection(): void {
  sendRendererCommand('coach:open-window-picker');
}

function promptSettings(): void {
  sendRendererCommand('coach:open-settings');
}

function setArmedMode(nextArmed: boolean, announce: boolean): void {
  isArmed = nextArmed;
  syncMonitorMode();

  if (announce) {
    sendRendererCommand('coach:set-armed', nextArmed, false);
  }
}

function refreshTrayState(): void {
  if (!coachTray || !coachWindow) {
    return;
  }

  refreshCoachTrayMenu(coachTray, {
    showCoach,
    hideCoach,
    capturePrompt: promptWindowSelection,
    openSettings: promptSettings,
    setArmedMode: (enabled) => {
      setArmedMode(enabled, true);
    },
    isArmed,
    isVisible: isWindowVisible || coachWindow.isVisible(),
    quit: () => {
      isQuitting = true;
      app.quit();
    }
  });
}

function sendRendererCommand(
  channel:
    | 'coach:open-window-picker'
    | 'coach:open-settings'
    | 'coach:set-armed'
    | 'coach:monitor-signal'
    | 'coach:monitor-status'
    | 'coach:voice-hotkey',
  payload?: unknown,
  reveal = true
): void {
  if (reveal) {
    showCoach();
  }
  const contents = coachWindow?.webContents;

  if (!contents) {
    return;
  }

  if (contents.isLoading()) {
    contents.once('did-finish-load', () => contents.send(channel, payload));
    return;
  }

  contents.send(channel, payload);
}

function voiceHotkeyToAccelerator(hotkey: VoiceSettings['hotkey']): string {
  switch (hotkey) {
    case 'alt-space':
      return 'Alt+Space';
    case 'ctrl-space':
      return 'Control+Space';
    case 'cmd-space':
      return 'CommandOrControl+Space';
    default:
      return 'Space';
  }
}

function applyVoiceShortcut(settings: VoiceSettings): void {
  if (activeVoiceShortcut) {
    globalShortcut.unregister(activeVoiceShortcut);
    activeVoiceShortcut = null;
  }

  if (!settings.enabled) {
    return;
  }

  const accelerator = voiceHotkeyToAccelerator(settings.hotkey);
  const registered = globalShortcut.register(accelerator, () => {
    sendRendererCommand('coach:voice-hotkey', undefined, false);
  });

  if (registered) {
    activeVoiceShortcut = accelerator;
    return;
  }

  console.warn('Failed to register voice hotkey accelerator', accelerator);
}

function setVoiceSettings(settings: unknown): void {
  activeVoiceSettings = assertVoiceSettings(settings);
  applyVoiceShortcut(activeVoiceSettings);
}

function unavailableHostedTokenStatus(): HostedHermesTokenStatus {
  return {
    available: false,
    hasToken: false,
    reason: 'safe-storage-unavailable'
  };
}

function missingHostedTokenStatus(): HostedHermesTokenStatus {
  return {
    available: true,
    hasToken: false,
    reason: 'not-found'
  };
}

function corruptHostedTokenStatus(): HostedHermesTokenStatus {
  return {
    available: true,
    hasToken: false,
    reason: 'corrupt-token-store'
  };
}

function isSafeStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function hostedHermesTokenPath(): string {
  return path.join(app.getPath('userData'), HOSTED_HERMES_TOKEN_FILE);
}

function assertHostedHermesTokenSaveInput(input: unknown): HostedHermesTokenSaveInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Hosted Hermes token save input is required.');
  }

  const token = (input as { token?: unknown }).token;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Hosted Hermes token must be a non-empty string.');
  }

  return { token };
}

function parseHostedHermesTokenRecord(raw: string): HostedHermesTokenRecord {
  const parsed = JSON.parse(raw) as Partial<HostedHermesTokenRecord>;

  if (parsed.version !== 1 || typeof parsed.updatedAt !== 'string' || typeof parsed.ciphertextBase64 !== 'string') {
    throw new Error('Hosted Hermes token storage is invalid.');
  }

  return {
    version: 1,
    updatedAt: parsed.updatedAt,
    ciphertextBase64: parsed.ciphertextBase64
  };
}

function getHostedHermesTokenStatus(): HostedHermesTokenStatus {
  if (!isSafeStorageAvailable()) {
    return unavailableHostedTokenStatus();
  }

  let raw: string;
  try {
    raw = fs.readFileSync(hostedHermesTokenPath(), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return missingHostedTokenStatus();
    }

    return corruptHostedTokenStatus();
  }

  try {
    const record = parseHostedHermesTokenRecord(raw);
    const token = safeStorage.decryptString(Buffer.from(record.ciphertextBase64, 'base64'));

    if (!token) {
      return corruptHostedTokenStatus();
    }

    return {
      available: true,
      hasToken: true,
      updatedAt: record.updatedAt
    };
  } catch {
    return corruptHostedTokenStatus();
  }
}

function saveHostedHermesToken(input: unknown): HostedHermesTokenStatus {
  const { token } = assertHostedHermesTokenSaveInput(input);

  if (!isSafeStorageAvailable()) {
    return unavailableHostedTokenStatus();
  }

  const updatedAt = new Date().toISOString();
  const record: HostedHermesTokenRecord = {
    version: 1,
    updatedAt,
    ciphertextBase64: safeStorage.encryptString(token).toString('base64')
  };

  fs.mkdirSync(path.dirname(hostedHermesTokenPath()), { recursive: true });
  fs.writeFileSync(hostedHermesTokenPath(), JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });

  return {
    available: true,
    hasToken: true,
    updatedAt
  };
}

function clearHostedHermesToken(): HostedHermesTokenStatus {
  if (!isSafeStorageAvailable()) {
    return unavailableHostedTokenStatus();
  }

  fs.rmSync(hostedHermesTokenPath(), { force: true });
  return missingHostedTokenStatus();
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    platform: process.platform
  }));

  ipcMain.handle('window-sources:list', async () => listWindowSources());

  ipcMain.handle('window-sources:capture', async (_event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || !sourceId.trim()) {
      throw new Error('A selected window source id is required.');
    }

    return captureWindowSource(sourceId);
  });

  ipcMain.handle('window-sources:validate', (_event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || !sourceId.trim()) {
      throw new Error('A selected window source id is required.');
    }

    return isSourceAvailable(sourceId);
  });

  ipcMain.handle('hermes:ask', async (_event, input: unknown) => {
    return askHermes(assertAskHermesInput(input));
  });

  ipcMain.handle('hermes:test-connection', async (_event, input: unknown) => {
    return probeHermesConnection(assertHermesConnection(input));
  });

  ipcMain.handle('hosted-hermes-token:save', (_event, input: unknown) => saveHostedHermesToken(input));

  ipcMain.handle('hosted-hermes-token:status', () => getHostedHermesTokenStatus());

  ipcMain.handle('hosted-hermes-token:clear', () => clearHostedHermesToken());

  ipcMain.handle('coach:set-always-on-top', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Always-on-top preference must be a boolean.');
    }

    coachWindow?.setAlwaysOnTop(enabled);
  });

  ipcMain.handle('coach:set-armed-mode', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Armed-mode preference must be a boolean.');
    }

    setArmedMode(enabled, true);
  });

  ipcMain.handle('coach:set-watch-clipboard', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Clipboard watch preference must be a boolean.');
    }

    watchClipboard = enabled;
    syncMonitorMode();
  });

  ipcMain.handle('coach:set-watch-ocr', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('OCR watch preference must be a boolean.');
    }

    watchOCR = enabled;
    syncMonitorMode();
    sendMonitorStatus(watchOCR);
  });

  ipcMain.handle('coach:set-ocr-context-mode', (_event, mode: unknown) => {
    if (mode !== 'full-window' && mode !== 'order-panel' && mode !== 'chart-order-panel') {
      throw new Error('OCR context mode is invalid.');
    }

    ocrContextMode = mode;
    lastOCRImageDataUrl = '';
    ocrRegionProfiles.clear();
    if (watchOCR) {
      sendMonitorStatus(true, {
        message: `OCR monitoring mode updated: ${formatOcrContextMode(ocrContextMode)}.`
      });
    }
  });

  ipcMain.handle('coach:set-ocr-region-profile', (_event, profile: unknown) => {
    activeOcrRegionProfile = assertOcrRegionProfileSettings(profile);
    lastOCRImageDataUrl = '';
    ocrRegionProfiles.clear();

    if (watchOCR) {
      sendMonitorStatus(true, {
        message: `OCR region profile updated (${formatOcrContextMode(ocrContextMode)}).`
      });
    }
  });

  ipcMain.handle('coach:recalibrate-ocr', () => {
    ocrRegionProfiles.clear();
    lastOCRImageDataUrl = '';
    sendMonitorStatus(watchOCR, {
      message: watchOCR
        ? `OCR monitoring recalibrated (${formatOcrContextMode(ocrContextMode)}).`
        : 'OCR monitoring currently inactive.'
    });
  });

  ipcMain.handle('coach:set-monitor-source', (_event, sourceId: unknown) => {
    if (typeof sourceId !== 'undefined' && typeof sourceId !== 'string') {
      throw new Error('Monitor source id must be a string.');
    }

    monitorSourceId = typeof sourceId === 'string' && sourceId.trim() ? sourceId.trim() : undefined;
    lastOCRImageDataUrl = '';
    ocrRegionProfiles.clear();
    if (watchOCR) {
      sendMonitorStatus(true);
    }
    if (!monitorSourceId) {
      sendMonitorStatus(false, { status: 'not-configured', message: 'OCR monitoring requires a selected capture target.' });
    }
  });

  ipcMain.handle('coach:set-voice-settings', (_event, settings: unknown) => {
    setVoiceSettings(settings);
  });
}

function sendMonitorSignal(signal: MonitoringSignal): void {
  sendRendererCommand('coach:monitor-signal', signal, false);
}

function sendMonitorStatus(
  enabled: boolean,
  options: { status?: MonitoringStatus['status']; message?: string } = {}
): void {
  const status: MonitoringStatus = {
    source: 'ocr',
    status: options.status ?? (enabled ? 'active' : 'inactive'),
    message:
      options.message ??
      (enabled
        ? monitorSourceId
          ? 'OCR monitoring is enabled. Local OCR extraction is running on the selected window.'
          : 'OCR monitoring is enabled but no monitoring source is selected.'
        : 'OCR monitoring currently inactive.')
  };

  sendRendererCommand('coach:monitor-status', status, false);
}

function syncMonitorMode(): void {
  const shouldPoll = isArmed && (watchClipboard || watchOCR);

  if (!coachWindow) {
    return;
  }

  if (!shouldPoll) {
    clearMonitorTimer();
    return;
  }

  if (monitorTimer) {
    return;
  }

  if (watchOCR) {
    sendMonitorStatus(true);
  } else {
    sendMonitorStatus(false);
  }

  monitorTimer = setInterval(() => {
    void captureMonitoringSignals();
  }, MONITOR_POLL_MS);

  void captureMonitoringSignals();
}

function clearMonitorTimer(): void {
  if (!monitorTimer) {
    return;
  }

  clearInterval(monitorTimer);
  monitorTimer = undefined;
}

function pruneMonitorSignalState(now: number): void {
  for (const [key, timestamp] of recentMonitorSignals.entries()) {
    if (now - timestamp > MONITOR_SIGNAL_RETENTION_MS) {
      recentMonitorSignals.delete(key);
    }
  }
}

async function captureMonitoringSignals(): Promise<void> {
  if (!isArmed) {
    clearMonitorTimer();
    return;
  }

  const now = Date.now();
  pruneMonitorSignalState(now);

  if (watchClipboard) {
    readClipboardSignals(now).forEach((signal) => sendMonitorSignal(signal));
  }

  if (watchOCR) {
    await captureOcrSignals(now);
  }
}

async function captureOcrSignals(now: number): Promise<void> {
  if (!monitorSourceId) {
    sendMonitorStatus(false, {
      status: 'not-configured',
      message: 'OCR monitoring is enabled, but no capture target is selected for monitoring.'
    });

    return;
  }

  try {
    const imageDataUrl = await captureWindowSource(monitorSourceId);
    if (imageDataUrl === lastOCRImageDataUrl) {
      return;
    }

    const preprocessedImageDataUrl = preprocessOcrImageDataUrl(imageDataUrl);
    const profileKey = `${monitorSourceId}:${ocrContextMode}`;
    let normalizedProfile = ocrRegionProfiles.get(profileKey);
    if (!normalizedProfile || normalizedProfile.length === 0) {
      normalizedProfile = deriveDefaultNormalizedOcrProfile(ocrContextMode);
      ocrRegionProfiles.set(profileKey, normalizedProfile);
    }
    let ocrRegions = materializeOcrRegions(preprocessedImageDataUrl, normalizedProfile);

    const ocrResult = await runOcrOnImageDataUrl(preprocessedImageDataUrl, now, ocrRegions);
    if (ocrResult.confidence === 'low') {
      const recalibratedProfile = deriveDefaultNormalizedOcrProfile(ocrContextMode);
      ocrRegionProfiles.set(profileKey, recalibratedProfile);
      ocrRegions = materializeOcrRegions(preprocessedImageDataUrl, recalibratedProfile);
    }
    lastOCRImageDataUrl = imageDataUrl;
    const nextSignals = ocrResult.signals.filter((signal) => shouldPublishSignal(signal));

    for (const signal of nextSignals) {
      sendMonitorSignal(signal);
    }

    sendMonitorStatus(true, {
      message: `OCR monitoring active (${formatOcrContextMode(ocrContextMode)}, ${ocrResult.confidence}-confidence, ${ocrResult.text.length} chars, ${nextSignals.length} signal(s)).`
    });
  } catch (error) {
    sendMonitorStatus(false, {
      status: 'inactive',
      message: `OCR monitoring error: ${error instanceof Error ? error.message : 'unknown OCR failure.'}`
    });
  }
}

function formatOcrContextMode(mode: OcrContextMode): string {
  if (mode === 'order-panel') {
    return 'order-panel';
  }

  if (mode === 'chart-order-panel') {
    return 'chart+order';
  }

  return 'full-window';
}

function deriveDefaultNormalizedOcrProfile(mode: OcrContextMode): NormalizedOcrRegionProfile[] {
  if (mode === 'order-panel') {
    return [
      {
        id: 'order-panel',
        label: 'Order panel',
        rectangle: activeOcrRegionProfile.orderPanel
      }
    ];
  }

  if (mode === 'chart-order-panel') {
    return [
      {
        id: 'order-panel',
        label: 'Order panel',
        rectangle: activeOcrRegionProfile.orderPanel
      },
      {
        id: 'chart-zone',
        label: 'Chart and pair zone',
        rectangle: activeOcrRegionProfile.chartZone
      }
    ];
  }

  return [{ id: 'full-window', label: 'Full window' }];
}

function materializeOcrRegions(
  imageDataUrl: string,
  normalizedProfile: NormalizedOcrRegionProfile[]
): OcrRegion[] {
  const image = nativeImage.createFromDataURL(imageDataUrl);
  const size = image.getSize();
  const width = size.width;
  const height = size.height;

  if (width < 20 || height < 20) {
    return [{ id: 'full-window', label: 'Full window' }];
  }

  const regions = normalizedProfile
    .map((entry) =>
      buildRegion(entry.id, entry.label, entry.rectangle, width, height)
    )
    .filter((entry): entry is OcrRegion => Boolean(entry));

  return regions.length > 0 ? regions : [{ id: 'full-window', label: 'Full window' }];
}

function preprocessOcrImageDataUrl(imageDataUrl: string): string {
  const source = nativeImage.createFromDataURL(imageDataUrl);
  const size = source.getSize();
  if (size.width <= 0 || size.height <= 0) {
    return imageDataUrl;
  }

  const scaleFactor = Math.min(1.6, Math.max(1, 1300 / Math.max(size.width, size.height)));
  const resized = scaleFactor > 1
    ? source.resize({
        width: Math.max(10, Math.round(size.width * scaleFactor)),
        height: Math.max(10, Math.round(size.height * scaleFactor))
      })
    : source;

  const nextSize = resized.getSize();
  const bitmap = Buffer.from(resized.toBitmap());
  for (let index = 0; index < bitmap.length; index += 4) {
    const blue = bitmap[index];
    const green = bitmap[index + 1];
    const red = bitmap[index + 2];
    const grayscale = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const contrasted = ((grayscale - 128) * 1.28) + 128;
    const thresholded = contrasted > 122 ? 255 : 0;

    bitmap[index] = thresholded;
    bitmap[index + 1] = thresholded;
    bitmap[index + 2] = thresholded;
  }

  const processed = nativeImage.createFromBitmap(bitmap, {
    width: nextSize.width,
    height: nextSize.height
  });

  return processed.toDataURL();
}

function buildRegion(
  id: string,
  label: string,
  input:
    | {
        left: number;
        top: number;
        width: number;
        height: number;
      }
    | undefined,
  maxWidth: number,
  maxHeight: number
): OcrRegion | undefined {
  if (!input) {
    return {
      id,
      label
    };
  }

  const pixelRect = {
    left: Math.round(maxWidth * input.left),
    top: Math.round(maxHeight * input.top),
    width: Math.round(maxWidth * input.width),
    height: Math.round(maxHeight * input.height)
  };

  const left = Math.max(0, Math.min(pixelRect.left, maxWidth - 1));
  const top = Math.max(0, Math.min(pixelRect.top, maxHeight - 1));
  const maxAllowedWidth = Math.max(1, maxWidth - left);
  const maxAllowedHeight = Math.max(1, maxHeight - top);
  const width = Math.min(Math.max(10, pixelRect.width), maxAllowedWidth);
  const height = Math.min(Math.max(10, pixelRect.height), maxAllowedHeight);

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    id,
    label,
    rectangle: {
      left,
      top,
      width,
      height
    }
  };
}

function readClipboardSignals(now: number): MonitoringSignal[] {
  const text = clipboard.readText();
  if (!text) {
    return [];
  }

  if (!text.trim()) {
    return [];
  }

  if (text === lastClipboardText) {
    return [];
  }

  lastClipboardText = text;
  const rawSignals = extractClipboardSignalsFromText(text, now);
  const nextSignals = rawSignals.filter((signal) => shouldPublishSignal(signal));
  if (nextSignals.length === 0) {
    return [];
  }

  return nextSignals;
}

function shouldPublishSignal(signal: MonitoringSignal): boolean {
  const key = `${signal.source}:${signal.kind}:${signal.value.toLowerCase()}`;
  const lastSeen = recentMonitorSignals.get(key);
  const now = Date.now();

  if (lastSeen && now - lastSeen < MONITOR_SIGNAL_REPEAT_GAP_MS) {
    return false;
  }

  recentMonitorSignals.set(key, now);
  pruneMonitorSignalState(now);
  return true;
}


app.whenReady().then(() => {
  registerIpcHandlers();
  coachWindow = createCoachWindow({
    shouldHideOnClose: () => !isQuitting,
    onHide: () => {
      isWindowVisible = false;
      refreshTrayState();
    }
  });
  isWindowVisible = false;
  coachTray = createCoachTray({
    showCoach,
    hideCoach,
    capturePrompt: promptWindowSelection,
    openSettings: promptSettings,
    setArmedMode: (enabled) => {
      setArmedMode(enabled, true);
    },
    isArmed,
    isVisible: isWindowVisible,
    quit: () => {
      isQuitting = true;
      app.quit();
    }
  });
});

app.on('activate', showCoach);

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => undefined);

app.on('will-quit', () => {
  clearMonitorTimer();
  coachTray?.destroy();
  globalShortcut.unregisterAll();
  void closeOcrWorker();
});
