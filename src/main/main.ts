import { app, BrowserWindow, ipcMain, type Tray } from 'electron';

import { askHermes } from './hermesClient';
import { createCoachTray } from './tray';
import { createCoachWindow } from './coachWindow';
import { captureWindowSource, listWindowSources } from './windowSources';
import type { AskHermesInput } from '../shared/types';

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

  if (typeof record.gatewayUrl !== 'string') {
    throw new Error('Hermes gateway URL is required.');
  }

  if (typeof record.question !== 'string' || !record.question.trim()) {
    throw new Error('Question is required.');
  }

  if (typeof record.screenshotDataUrl !== 'string' || !record.screenshotDataUrl.trim()) {
    throw new Error('Screenshot is required.');
  }

  if (!record.selectedWindow || typeof record.selectedWindow !== 'object') {
    throw new Error('Selected window is required.');
  }

  return record;
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
