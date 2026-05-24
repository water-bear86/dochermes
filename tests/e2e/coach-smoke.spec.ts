import { expect, test } from '@playwright/test';

import { collectRendererFailures, firstCoachWindow, launchDocHermes } from './electronHarness';

test.describe('Hermes Coach Electron smoke', () => {
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

  test.skip('TODO: verifies the gateway connection path against the fake Hermes server', async () => {
    // The fake server fixture is available in tests/e2e/fakeHermesServer.ts.
    // This should be enabled once the build-context Electron launch exposes a reliable
    // renderer bridge or a stable UI synchronization point for the Hermes heartbeat.
  });
});
