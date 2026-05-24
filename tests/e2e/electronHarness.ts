import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';

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

export function collectRendererFailures(page: Page): string[] {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console error: ${message.text()}`);
    }
  });

  return failures;
}
