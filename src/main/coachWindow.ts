import { BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CoachWindowOptions {
  shouldHideOnClose: () => boolean;
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

  window.setAlwaysOnTop(true);

  window.on('close', (event) => {
    if (options.shouldHideOnClose()) {
      event.preventDefault();
      window.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}
