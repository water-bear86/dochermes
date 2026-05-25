import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolvePackagedAppExecutable } from '../../scripts/verify-packaged-app.mjs';

describe('resolvePackagedAppExecutable', () => {
  it('finds the unpacked macOS app executable for the current arch first', () => {
    const distDir = mkdtempSync(path.join(os.tmpdir(), 'dochermes-packaging-test-'));

    try {
      const armExecutable = path.join(distDir, 'mac-arm64', 'DocHermes.app', 'Contents', 'MacOS', 'DocHermes');
      mkdirSync(path.dirname(armExecutable), { recursive: true });
      writeFileSync(armExecutable, '');

      expect(resolvePackagedAppExecutable({ platform: 'darwin', arch: 'arm64', distDir })).toBe(armExecutable);
    } finally {
      rmSync(distDir, { recursive: true, force: true });
    }
  });

  it('finds Linux and Windows unpacked executables', () => {
    const distDir = mkdtempSync(path.join(os.tmpdir(), 'dochermes-packaging-test-'));

    try {
      const linuxExecutable = path.join(distDir, 'linux-unpacked', 'dochermes');
      const windowsExecutable = path.join(distDir, 'win-unpacked', 'DocHermes.exe');
      mkdirSync(path.dirname(linuxExecutable), { recursive: true });
      mkdirSync(path.dirname(windowsExecutable), { recursive: true });
      writeFileSync(linuxExecutable, '');
      writeFileSync(windowsExecutable, '');

      expect(resolvePackagedAppExecutable({ platform: 'linux', arch: 'x64', distDir })).toBe(linuxExecutable);
      expect(resolvePackagedAppExecutable({ platform: 'win32', arch: 'x64', distDir })).toBe(windowsExecutable);
    } finally {
      rmSync(distDir, { recursive: true, force: true });
    }
  });

  it('throws a useful error when no unpacked executable exists', () => {
    const distDir = mkdtempSync(path.join(os.tmpdir(), 'dochermes-packaging-test-'));

    try {
      expect(() => resolvePackagedAppExecutable({ platform: 'linux', arch: 'x64', distDir })).toThrow(
        /Could not find a packaged DocHermes executable/
      );
    } finally {
      rmSync(distDir, { recursive: true, force: true });
    }
  });
});
