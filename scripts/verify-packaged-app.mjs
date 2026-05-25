#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TIMEOUT_MS = 8_000;

export function resolvePackagedAppExecutable({
  platform = process.platform,
  arch = process.arch,
  distDir = path.join(repoRoot, 'dist')
} = {}) {
  const candidates = packagedExecutableCandidates(platform, arch, distDir);
  const executable = candidates.find((candidate) => existsSync(candidate));

  if (!executable) {
    throw new Error(
      [
        'Could not find a packaged DocHermes executable.',
        `Platform: ${platform}`,
        `Arch: ${arch}`,
        `Dist: ${distDir}`,
        'Checked:',
        ...candidates.map((candidate) => `- ${candidate}`)
      ].join('\n')
    );
  }

  return executable;
}

export async function verifyPackagedAppLaunch({
  executable = resolvePackagedAppExecutable(),
  timeoutMs = readTimeoutMs(process.env.DOC_HERMES_PACKAGED_LAUNCH_TIMEOUT_MS)
} = {}) {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'dochermes-packaged-launch-'));
  const child = spawn(executable, [`--user-data-dir=${userDataDir}`], {
    env: {
      ...process.env,
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];

  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  try {
    await waitForStableLaunch(child, output, timeoutMs);
  } finally {
    await stopProcess(child);
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

function packagedExecutableCandidates(platform, arch, distDir) {
  if (platform === 'darwin') {
    const preferred = arch === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-arm64'];
    return preferred.map((folder) => path.join(distDir, folder, 'DocHermes.app', 'Contents', 'MacOS', 'DocHermes'));
  }

  if (platform === 'win32') {
    return [
      path.join(distDir, 'win-unpacked', 'DocHermes.exe'),
      path.join(distDir, 'win-ia32-unpacked', 'DocHermes.exe'),
      path.join(distDir, 'win-arm64-unpacked', 'DocHermes.exe')
    ];
  }

  if (platform === 'linux') {
    return [path.join(distDir, 'linux-unpacked', 'dochermes')];
  }

  return [];
}

function readTimeoutMs(rawValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function waitForStableLaunch(child, output, timeoutMs) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, timeoutMs);

    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(
        new Error(
          [
            `Packaged DocHermes exited before the ${timeoutMs}ms launch window elapsed.`,
            `Exit code: ${code ?? 'none'}`,
            `Signal: ${signal ?? 'none'}`,
            'Output:',
            output.join('').trim() || '(none)'
          ].join('\n')
        )
      );
    });

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise((resolve) => {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyPackagedAppLaunch()
    .then(() => {
      console.log(`Packaged DocHermes launch check passed: ${resolvePackagedAppExecutable()}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
