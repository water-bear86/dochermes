import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';

import { probeHermesConnection } from '../../src/main/hermesClient';
import type { HermesConnectionSettings } from '../../src/shared/types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function launchDocHermes(): Promise<ElectronApplication> {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'dochermes-e2e-'));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
  const close = app.close.bind(app);

  app.close = async () => {
    try {
      await close();
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  };

  return app;
}

export async function firstCoachWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return page;
}

export interface RendererFailureOptions {
  ignoreSandboxedPreloadFailure?: boolean;
}

export function collectRendererFailures(page: Page, options: RendererFailureOptions = {}): string[] {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (
        options.ignoreSandboxedPreloadFailure &&
        (message.text().includes('Unable to load preload script') ||
          message.text().includes('Cannot use import statement outside a module'))
      ) {
        return;
      }

      failures.push(`console error: ${message.text()}`);
    }
  });

  return failures;
}

export async function installHermesGatewayTestBridge(page: Page): Promise<void> {
  await page.exposeFunction('__dochermesTestHermesConnection', async (connection: HermesConnectionSettings) =>
    probeHermesConnection(connection)
  );

  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      hermesCoach?: Record<string, unknown>;
      __dochermesTestHermesConnection: (connection: HermesConnectionSettings) => Promise<unknown>;
    };
    const noop = async (): Promise<void> => undefined;
    const unsubscribe = (): (() => void) => () => undefined;
    const unavailable = async (): Promise<never> => {
      throw new Error('This E2E harness bridge only supports Hermes gateway connection tests.');
    };

    if (testWindow.hermesCoach) {
      return;
    }

    testWindow.hermesCoach = {
      listWindowSources: unavailable,
      validateSelectedWindow: async () => false,
      captureWindowSource: unavailable,
      setWatchClipboard: noop,
      setWatchOCR: noop,
      setMonitorSource: noop,
      setOcrContextMode: noop,
      setOcrRegionProfile: noop,
      recalibrateOCR: noop,
      setVoiceSettings: noop,
      askHermes: unavailable,
      testHermesConnection: (connection: HermesConnectionSettings) => testWindow.__dochermesTestHermesConnection(connection),
      saveHostedHermesToken: unavailable,
      getHostedHermesTokenStatus: unavailable,
      clearHostedHermesToken: unavailable,
      setAlwaysOnTop: noop,
      setArmedMode: noop,
      appInfo: async () => ({ name: 'DocHermes E2E', platform: 'test' }),
      onOpenWindowPicker: unsubscribe,
      onOpenSettings: unsubscribe,
      onArmCoach: unsubscribe,
      onVoiceHotkey: unsubscribe,
      onMonitorSignal: unsubscribe,
      onMonitorStatus: unsubscribe
    };
  });
}
