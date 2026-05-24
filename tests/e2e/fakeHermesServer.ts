import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type FakeHermesMode = 'success' | 'auth-required' | 'text-only' | 'timeout';

export interface FakeHermesOptions {
  mode?: FakeHermesMode;
  authToken?: string;
  delayMs?: number;
}

export interface FakeHermesFixture {
  baseUrl: string;
  authToken: string;
  stop: () => Promise<void>;
}

export async function startFakeHermesServer(options: FakeHermesOptions = {}): Promise<FakeHermesFixture> {
  const port = await findAvailablePort();
  const host = '127.0.0.1';
  const baseUrl = `http://${host}:${port}`;
  const mode = options.mode ?? 'success';
  const authToken = options.authToken ?? 'fake-hermes-token';
  const child = spawn(process.execPath, ['scripts/fake-hermes-server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HERMES_FAKE_HOST: host,
      HERMES_FAKE_PORT: String(port),
      HERMES_FAKE_MODE: mode,
      HERMES_FAKE_AUTH_TOKEN: authToken,
      ...(options.delayMs === undefined ? {} : { HERMES_FAKE_DELAY_MS: String(options.delayMs) })
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const output: string[] = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  try {
    if (mode === 'timeout') {
      await waitForFakeHermesListening(child, output, baseUrl);
    } else {
      await waitForFakeHermesHealth(child, output, baseUrl, authToken);
    }
  } catch (error) {
    await stopProcess(child);
    throw error;
  }

  return {
    baseUrl,
    authToken,
    stop: () => stopProcess(child)
  };
}

async function waitForFakeHermesHealth(
  child: ChildProcessWithoutNullStreams,
  output: string[],
  baseUrl: string,
  authToken: string
): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) {
      throw new Error(`Fake Hermes server exited early with code ${child.exitCode}.\n${output.join('')}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const suffix = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Fake Hermes server did not become ready: ${suffix}\n${output.join('')}`);
}

async function waitForFakeHermesListening(
  child: ChildProcessWithoutNullStreams,
  output: string[],
  baseUrl: string
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) {
      throw new Error(`Fake Hermes server exited early with code ${child.exitCode}.\n${output.join('')}`);
    }

    if (output.join('').includes(`URL: ${baseUrl}`)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Fake Hermes server did not report a listening URL.\n${output.join('')}`);
}

async function stopProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

export async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a fake Hermes port.')));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}
