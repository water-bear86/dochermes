import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultBaseUrl = 'http://localhost:8642';

export interface FakeHermesFixture {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startFakeHermesServer(): Promise<FakeHermesFixture> {
  const child = spawn(process.execPath, ['scripts/fake-hermes-server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HERMES_FAKE_HOST: 'localhost',
      HERMES_FAKE_PORT: '8642',
      HERMES_FAKE_MODE: 'success'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const output: string[] = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  try {
    await waitForFakeHermes(child, output);
  } catch (error) {
    await stopProcess(child);
    throw error;
  }

  return {
    baseUrl: defaultBaseUrl,
    stop: () => stopProcess(child)
  };
}

async function waitForFakeHermes(child: ChildProcessWithoutNullStreams, output: string[]): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) {
      throw new Error(`Fake Hermes server exited early with code ${child.exitCode}.\n${output.join('')}`);
    }

    try {
      const response = await fetch(`${defaultBaseUrl}/health`);
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
