import { app, BrowserWindow, clipboard, ipcMain, type Tray } from 'electron';

import { askHermes, probeHermesConnection } from './hermesClient';
import { createCoachTray } from './tray';
import { createCoachWindow } from './coachWindow';
import { assertAskHermesInput, assertHermesConnection } from './inputValidation';
import { captureWindowSource, isSourceAvailable, listWindowSources } from './windowSources';
import type {
  MonitoringSignal,
  MonitoringStatus
} from '../shared/types';

let coachWindow: BrowserWindow | undefined;
let coachTray: Tray | undefined;
let isQuitting = false;
let isArmed = false;
let watchClipboard = false;
let watchOCR = false;
let monitorTimer: ReturnType<typeof setInterval> | undefined;
let lastClipboardText = '';
const recentMonitorSignals = new Map<string, number>();

const MONITOR_POLL_MS = 1000;
const MONITOR_SIGNAL_RETENTION_MS = 30_000;
const MONITOR_SIGNAL_REPEAT_GAP_MS = 10_000;

app.setName('Hermes Coach');

function showCoach(): void {
  if (!coachWindow || coachWindow.isDestroyed()) {
    coachWindow = createCoachWindow({
      shouldHideOnClose: () => !isQuitting
    });
    return;
  }

  coachWindow.show();
  coachWindow.focus();
}

function hideCoach(): void {
  coachWindow?.hide();
}

function promptWindowSelection(): void {
  sendRendererCommand('coach:open-window-picker');
}

function promptSettings(): void {
  sendRendererCommand('coach:open-settings');
}

function sendRendererCommand(
  channel:
    | 'coach:open-window-picker'
    | 'coach:open-settings'
    | 'coach:set-armed'
    | 'coach:monitor-signal'
    | 'coach:monitor-status',
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

    isArmed = enabled;
    syncMonitorMode();
    sendRendererCommand('coach:set-armed', enabled, false);
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
}

function sendMonitorSignal(signal: MonitoringSignal): void {
  sendRendererCommand('coach:monitor-signal', signal, false);
}

function sendMonitorStatus(enabled: boolean): void {
  const status: MonitoringStatus = enabled
    ? {
        source: 'ocr',
        status: 'active',
        message:
          'OCR monitoring is enabled. Local OCR extraction is not yet connected in this build; currently using placeholder mode.'
    }
    : {
        source: 'ocr',
        status: 'inactive',
        message: 'OCR monitoring currently inactive.'
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

function captureMonitoringSignals(): void {
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
    sendMonitorStatus(true);
  }
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
  const rawSignals = extractClipboardSignals(text, now);
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

function extractClipboardSignals(text: string, now: number): MonitoringSignal[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const signals = new Map<string, MonitoringSignal>();
  for (const rawMatch of normalized.matchAll(/0x[a-fA-F0-9]{64}\b/g)) {
    addSignal(signals, normalizeMatch(rawMatch[0], 'evm-tx-hash', 'high'));
  }

  for (const rawMatch of normalized.matchAll(/0x[a-fA-F0-9]{40}\b/g)) {
    addSignal(signals, normalizeMatch(rawMatch[0], 'evm-address', 'medium'));
  }

  for (const rawMatch of normalized.matchAll(/\b[1-9A-HJ-NP-Za-km-z]{40,88}\b/g)) {
    addSignal(signals, normalizeMatch(rawMatch[0], 'sol-address', 'medium'));
  }

  for (const rawMatch of normalized.matchAll(/https?:\/\/[^\s]+/g)) {
    const rawUrl = rawMatch[0];
    const sanitizedUrl = sanitizeUrlCandidate(rawUrl);
    if (!sanitizedUrl) {
      continue;
    }

    const kind: MonitoringSignal['kind'] =
      /dextools|dexscreener|birdeye|solscan|etherscan|solana|solana\.fm|raydium|meteora/.test(sanitizedUrl)
        ? 'dex-url'
        : 'wallet-address';
    const message = kind === 'dex-url' ? 'Detected trading-context URL' : undefined;
    addSignal(signals, {
      source: 'clipboard',
      kind,
      value: sanitizedUrl,
      maskedValue: sanitizeUrlCandidate(sanitizedUrl),
      confidence: kind === 'dex-url' ? 'medium' : 'low',
      message
    });
  }

  return [...signals.values()].map((value) => ({
    ...value,
    detectedAt: new Date(now).toISOString()
  }));

  function addSignal(
    target: Map<string, Omit<MonitoringSignal, 'detectedAt'>>,
    signal: Omit<MonitoringSignal, 'detectedAt'>
  ): void {
    if (target.has(signal.value.toLowerCase())) {
      return;
    }

    target.set(signal.value.toLowerCase(), signal);
  }

  function normalizeMatch(value: string, kind: MonitoringSignal['kind'], confidence: MonitoringSignal['confidence']): Omit<MonitoringSignal, 'detectedAt'> {
    return {
      source: 'clipboard',
      kind,
      value,
      maskedValue: maskValue(value),
      confidence
    };
  }
}

function sanitizeUrlCandidate(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;
    return `${host}${pathname}`.slice(0, 120);
  } catch {
    return rawUrl.slice(0, 120);
  }
}

function maskValue(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  coachWindow = createCoachWindow({
    shouldHideOnClose: () => !isQuitting
  });
  coachTray = createCoachTray({
    showCoach,
    hideCoach,
    capturePrompt: promptWindowSelection,
    openSettings: promptSettings,
    armCoach: () => {
      sendRendererCommand('coach:set-armed', true, false);
    },
    disarmCoach: () => {
      sendRendererCommand('coach:set-armed', false, false);
    },
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
});
