import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';

import { probeHermesConnection } from '../../src/main/hermesClient';
import type { AskHermesInput, HermesConnectionSettings, WindowSourceOption } from '../../src/shared/types';

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

export async function installCoachRequestTestBridge(page: Page): Promise<void> {
  const source: WindowSourceOption = {
    id: 'window:e2e-trading-terminal',
    name: 'E2E Trading Terminal',
    kind: 'window',
    thumbnailDataUrl: 'data:image/png;base64,QUFBQQ=='
  };

  await page.addInitScript((inputSource) => {
    const testWindow = window as typeof window & {
      hermesCoach?: Record<string, unknown>;
      __dochermesBridgeCalls?: {
        captureCount: number;
        asks: AskHermesInput[];
      };
    };
    const noop = async (): Promise<void> => undefined;
    const unsubscribe = (): (() => void) => () => undefined;
    const calls = {
      captureCount: 0,
      asks: [] as AskHermesInput[]
    };

    testWindow.__dochermesBridgeCalls = calls;
    testWindow.hermesCoach = {
      listWindowSources: async () => [inputSource],
      validateSelectedWindow: async (sourceId: string) => sourceId === inputSource.id,
      captureWindowSource: async () => {
        calls.captureCount += 1;
        return 'data:image/png;base64,QUFBQQ==';
      },
      setWatchClipboard: noop,
      setWatchOCR: noop,
      setMonitorSource: noop,
      setOcrContextMode: noop,
      setOcrRegionProfile: noop,
      recalibrateOCR: noop,
      setVoiceSettings: noop,
      askHermes: async (request: AskHermesInput) => {
        calls.asks.push(request);
        return 'E2E Hermes response: placeholder request received.';
      },
      testHermesConnection: async () => ({
        status: 'connected',
        activeAdapter: 'openai-chat',
        textCapable: true,
        imageCapable: true,
        models: ['hermes-agent'],
        attempts: [],
        summary: 'E2E Hermes test bridge connected.',
        debugReport: 'E2E Hermes test bridge connected.'
      }),
      saveHostedHermesToken: async () => ({ available: true, hasToken: true, updatedAt: new Date().toISOString() }),
      getHostedHermesTokenStatus: async () => ({ available: true, hasToken: false }),
      clearHostedHermesToken: async () => ({ available: true, hasToken: false, reason: 'not-found' }),
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
  }, source);
}
