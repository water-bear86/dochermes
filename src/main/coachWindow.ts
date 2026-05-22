import { BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllowedNavigationChecker } from './navigationPolicy';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CoachWindowOptions {
  shouldHideOnClose: () => boolean;
  onHide?: () => void;
}

export function createCoachWindow(options: CoachWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 440,
    height: 680,
    minWidth: 380,
    minHeight: 520,
    show: false,
    title: 'Hermes Coach',
    alwaysOnTop: true,
    backgroundColor: '#101214',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  const packagedRendererFile = join(__dirname, '../renderer/index.html');
  const isAllowedNavigation = createAllowedNavigationChecker(process.env.ELECTRON_RENDERER_URL, packagedRendererFile);

  window.setAlwaysOnTop(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl)) {
      event.preventDefault();
    }
  });

  window.on('close', (event) => {
    if (options.shouldHideOnClose()) {
      event.preventDefault();
      window.hide();
      options.onHide?.();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(packagedRendererFile);
  }

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}
