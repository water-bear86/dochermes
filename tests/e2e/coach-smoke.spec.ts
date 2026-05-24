import { expect, test } from '@playwright/test';
import type { Page } from 'playwright';

import {
  collectRendererFailures,
  firstCoachWindow,
  installCoachRequestTestBridge,
  installHermesGatewayTestBridge,
  launchDocHermes
} from './electronHarness';
import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL, MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER } from '../../src/shared/privacy';
import { findAvailablePort, startFakeHermesServer, type FakeHermesFixture } from './fakeHermesServer';

type GatewayTestSettings = {
  baseUrl: string;
  bearerToken?: string;
  connectionKind?: 'local' | 'custom';
};

test.describe('Hermes Coach Electron smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('renders the advisory app shell and preserves the no-execution boundary', async () => {
    const app = await launchDocHermes();

    try {
      const page = await firstCoachWindow(app);
      const rendererFailures = collectRendererFailures(page);
      const skipSetupButton = page.getByRole('button', { name: 'Skip for dev/testing' });

      if (await skipSetupButton.isVisible()) {
        await expect(page.getByText('Advisory boundary')).toBeVisible();
        await expect(page.getByText(/never controls funds/i)).toBeVisible();
        await skipSetupButton.click();
      }

      await expect(page.getByRole('heading', { name: 'Hermes Coach', exact: true })).toBeVisible();
      await expect(page.getByText('Risk and execution coach')).toBeVisible();
      await expect(page.getByLabel('Hermes check-in status')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /Window selection required/ })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /Hermes check-in:/ })).toBeVisible();
      await expect(page.getByLabel('Ask Hermes')).toBeVisible();

      await expect(page.getByText('Platform agnostic. Read-only wallet context only. No signing. No order routing.')).toBeVisible();
      await expect(page.getByRole('button', { name: /place order|buy|sell|route order|sign|withdraw/i })).toHaveCount(0);
      await expect(page.getByLabel(/private key/i)).toHaveCount(0);
      await expect(page.getByText(/seed phrase/i)).toHaveCount(0);

      expect(rendererFailures).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('walks through first-run setup without granting execution capability', async () => {
    const app = await launchDocHermes();

    try {
      const page = await firstCoachWindow(app);
      const rendererFailures = collectRendererFailures(page, { ignoreSandboxedPreloadFailure: true });

      await expect(page.getByRole('heading', { name: 'Set up Hermes Coach' })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'First run' })).toBeVisible();
      await expect(page.getByText('Advisory boundary')).toBeVisible();
      await expect(page.getByText(/never controls funds/i)).toBeVisible();

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Hermes gateway', { exact: true })).toBeVisible();
      await expect(page.getByText(/model agnostic/i)).toBeVisible();

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Trading window', { exact: true })).toBeVisible();
      await expect(page.getByText(/does not grant trade execution/i)).toBeVisible();

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Ready', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Finish setup' }).click();
      await expect(page.getByRole('heading', { name: 'Hermes Coach', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /place order|buy|sell|route order|sign|withdraw/i })).toHaveCount(0);

      expect(rendererFailures).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('sends placeholder-only maximum privacy requests without capturing the real window', async () => {
    const app = await launchDocHermes();

    try {
      const page = await firstCoachWindow(app);
      const rendererFailures = collectRendererFailures(page, { ignoreSandboxedPreloadFailure: true });
      await configureMaximumPrivacyRequestApp(page);

      await page.getByLabel('Question').fill('Should I enter this trade right now?');
      await page.getByRole('button', { name: 'Capture and ask' }).click();

      await expect(page.getByText('E2E Hermes response: placeholder request received.')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'E2E Hermes response: placeholder request received.' })).toBeVisible();
      await expect(page.getByText(/Withheld from Hermes: Real screenshot/)).toBeVisible();

      const calls = await page.evaluate(() => {
        const testWindow = window as typeof window & {
          __dochermesBridgeCalls?: {
            captureCount: number;
            asks: unknown[];
          };
        };

        return testWindow.__dochermesBridgeCalls;
      });

      expect(calls?.captureCount).toBe(0);
      expect(calls?.asks).toHaveLength(1);
      expect(calls?.asks[0]).toMatchObject({
        screenshotDataUrl: MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL,
        selectedWindow: MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER,
        privacy: {
          preset: 'maximum'
        }
      });
      expect(JSON.stringify(calls?.asks[0])).not.toContain('E2E Trading Terminal');
      expect(JSON.stringify(calls?.asks[0])).not.toContain('memoryContext');
      expect(JSON.stringify(calls?.asks[0])).not.toContain('monitoringContext');
      expect(rendererFailures).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('reports success fake Hermes mode as connected without exposing execution controls', async () => {
    const fakeHermes = await startFakeHermesServer({ mode: 'success' });
    const app = await launchDocHermes();

    try {
      const page = await firstCoachWindow(app);
      const rendererFailures = collectRendererFailures(page, { ignoreSandboxedPreloadFailure: true });
      await configureGatewayTestApp(page, { baseUrl: fakeHermes.baseUrl });

      await runGatewayProbe(page);

      await expectGatewayReportStatus(page, 'connected');
      await expect(page.getByText('Text route OK')).toBeVisible();
      await expect(page.getByText('Image route OK')).toBeVisible();
      await expect(page.getByRole('button', { name: /place order|buy|sell|route order|sign|withdraw/i })).toHaveCount(0);
      await expect(page.getByLabel(/private key/i)).toHaveCount(0);

      expect(rendererFailures).toEqual([]);
    } finally {
      await app.close();
      await fakeHermes.stop();
    }
  });

  test('reports auth-required fake Hermes mode as an auth issue when the bearer token is bad', async () => {
    const fakeHermes = await startFakeHermesServer({ mode: 'auth-required' });

    await withGatewayPage(fakeHermes, { bearerToken: 'bad-token' }, async (page, rendererFailures) => {
      await runGatewayProbe(page);

      await expect(page.getByText('Hermes bearer token is missing or rejected. Check bearer auth for this endpoint.')).toBeVisible();
      await expectGatewayReportStatus(page, 'auth-error');
      expect(rendererFailures).toEqual([]);
    });
  });

  test('reports text-only fake Hermes mode as degraded instead of connected', async () => {
    const fakeHermes = await startFakeHermesServer({ mode: 'text-only' });

    await withGatewayPage(fakeHermes, { connectionKind: 'custom' }, async (page, rendererFailures) => {
      await runGatewayProbe(page);

      await expectGatewayReportStatus(page, 'degraded');
      await expect(page.getByText('Text route OK')).toBeVisible();
      await expect(page.getByText('Image route failed')).toBeVisible();
      expect(rendererFailures).toEqual([]);
    });
  });

  test('reports an offline Hermes gateway as disconnected', async () => {
    const unusedPort = await findAvailablePort();

    await withConfiguredGatewayPage(
      { baseUrl: `http://127.0.0.1:${unusedPort}`, connectionKind: 'custom' },
      async (page, rendererFailures) => {
        await runGatewayProbe(page);
        await expectGatewayReportStatus(page, 'disconnected');
        await expect(
          page
            .locator('.connection-report strong')
            .filter({ hasText: 'The local Hermes server was unreachable. Check that the local API server is running and the port is correct.' })
        ).toBeVisible();
        expect(rendererFailures).toEqual([]);
      }
    );
  });
});

async function withGatewayPage(
  fakeHermes: FakeHermesFixture,
  settings: Omit<GatewayTestSettings, 'baseUrl'>,
  callback: (page: Page, rendererFailures: string[]) => Promise<void>
): Promise<void> {
  await withConfiguredGatewayPage(
    {
      baseUrl: fakeHermes.baseUrl,
      bearerToken: settings.bearerToken,
      connectionKind: settings.connectionKind
    },
    callback,
    () => fakeHermes.stop()
  );
}

async function withConfiguredGatewayPage(
  settings: GatewayTestSettings,
  callback: (page: Page, rendererFailures: string[]) => Promise<void>,
  cleanup?: () => Promise<void>
): Promise<void> {
  const app = await launchDocHermes();

  try {
    const page = await firstCoachWindow(app);
    const rendererFailures = collectRendererFailures(page, { ignoreSandboxedPreloadFailure: true });
    await configureGatewayTestApp(page, settings);

    await callback(page, rendererFailures);
  } finally {
    await app.close();
    await cleanup?.();
  }
}

async function configureGatewayTestApp(page: Page, settings: GatewayTestSettings): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await installHermesGatewayTestBridge(page);

  await page.evaluate(
    ({ baseUrl, bearerToken, connectionKind }) => {
      localStorage.setItem(
        'hermes.settings.v1',
        JSON.stringify({
          connection: {
            connectionKind: connectionKind ?? 'local',
            endpointMode: 'auto',
            baseUrl,
            modelId: 'hermes-agent',
            bearerToken: bearerToken ?? ''
          },
          privacy: {
            preset: 'maximum',
            redaction: {
              redactAddresses: true,
              redactBalances: true,
              redactUsernames: true,
              redactAmounts: true
            }
          },
          friction: {
            enabled: false,
            strictness: 'standard'
          },
          setup: {
            completedAt: '2026-05-23T00:00:00.000Z'
          }
        })
      );
    },
    {
      baseUrl: settings.baseUrl,
      bearerToken: settings.bearerToken,
      connectionKind: settings.connectionKind
    }
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Hermes Coach', exact: true })).toBeVisible();
}

async function configureMaximumPrivacyRequestApp(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await installCoachRequestTestBridge(page);

  await page.evaluate(() => {
    localStorage.setItem(
      'hermes.settings.v1',
      JSON.stringify({
        connection: {
          connectionKind: 'local',
          endpointMode: 'auto',
          baseUrl: 'http://127.0.0.1:8642',
          modelId: 'hermes-agent',
          bearerToken: ''
        },
        privacy: {
          preset: 'maximum',
          redaction: {
            redactAddresses: true,
            redactBalances: true,
            redactUsernames: true,
            redactAmounts: true
          }
        },
        friction: {
          enabled: false,
          strictness: 'standard'
        },
        setup: {
          completedAt: '2026-05-23T00:00:00.000Z'
        },
        pairedWindow: {
          id: 'window:e2e-trading-terminal',
          name: 'E2E Trading Terminal',
          kind: 'window'
        }
      })
    );
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Hermes Coach', exact: true })).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByLabel('Local settings').getByRole('button', { name: 'Show' }).click();
  await expect(page.getByLabel('Gateway URL')).toBeVisible();
}

async function runGatewayProbe(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole('button', { name: 'Test gateway' }).click();
}

async function expectGatewayReportStatus(page: Page, status: string): Promise<void> {
  await expect(page.locator('.connection-report small').filter({ hasText: `Status: ${status}` })).toBeVisible();
}
