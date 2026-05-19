import { app, BrowserWindow, ipcMain, type Tray } from 'electron';

import { askHermes, probeHermesConnection } from './hermesClient';
import { createCoachTray } from './tray';
import { createCoachWindow } from './coachWindow';
import { captureWindowSource, listWindowSources } from './windowSources';
import type { AskHermesInput, HermesConnectionKind, HermesConnectionSettings, HermesEndpointMode } from '../shared/types';

let coachWindow: BrowserWindow | undefined;
let coachTray: Tray | undefined;
let isQuitting = false;

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

function sendRendererCommand(channel: 'coach:open-window-picker' | 'coach:open-settings'): void {
  showCoach();
  const contents = coachWindow?.webContents;

  if (!contents) {
    return;
  }

  if (contents.isLoading()) {
    contents.once('did-finish-load', () => contents.send(channel));
    return;
  }

  contents.send(channel);
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
}

function assertAskHermesInput(input: unknown): AskHermesInput {
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

function assertHermesConnection(input: unknown): HermesConnectionSettings {
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

  try {
    new URL(record.baseUrl);
  } catch {
    throw new Error('Hermes base URL must be a valid URL.');
  }

  if (typeof record.modelId !== 'string' || !record.modelId.trim()) {
    throw new Error('Hermes model ID is required.');
  }

  if (typeof record.bearerToken !== 'string') {
    throw new Error('Hermes bearer token must be a string.');
  }

  return record;
}

function isConnectionKind(value: unknown): value is HermesConnectionKind {
  return value === 'local' || value === 'hosted' || value === 'custom';
}

function isEndpointMode(value: unknown): value is HermesEndpointMode {
  return value === 'auto' || value === 'openai-chat' || value === 'legacy-coach' || value === 'custom';
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
  coachTray?.destroy();
});
