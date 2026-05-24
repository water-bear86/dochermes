import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ipcHandlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown> | unknown>();
const askHermesMock = vi.fn(async () => 'ok');
const probeHermesConnectionMock = vi.fn(async () => ({
  status: 'connected',
  textCapable: true,
  imageCapable: true,
  models: [],
  attempts: [],
  summary: 'ok',
  debugReport: 'ok'
}));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dochermes-main-test-'));
const safeStorageMock = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''))
};

vi.mock('electron', () => {
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    })
  };

  return {
    app: {
      setName: vi.fn(),
      getName: vi.fn(() => 'Hermes Coach'),
      getPath: vi.fn(() => userDataDir),
      whenReady: vi.fn(() => Promise.resolve(undefined)),
      on: vi.fn()
    },
    BrowserWindow: class {},
    clipboard: {
      readText: vi.fn(() => '')
    },
    ipcMain,
    safeStorage: safeStorageMock
  };
});

vi.mock('./hermesClient', () => ({
  askHermes: askHermesMock,
  probeHermesConnection: probeHermesConnectionMock
}));

vi.mock('./coachWindow', () => ({
  createCoachWindow: vi.fn(() => ({
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: {
      isLoading: vi.fn(() => false),
      send: vi.fn()
    }
  }))
}));

vi.mock('./tray', () => ({
  createCoachTray: vi.fn(() => ({ destroy: vi.fn() })),
  refreshCoachTrayMenu: vi.fn()
}));

vi.mock('./windowSources', () => ({
  captureWindowSource: vi.fn(),
  isSourceAvailable: vi.fn(),
  listWindowSources: vi.fn()
}));

function getHermesAskHandler(): (event: unknown, input: unknown) => Promise<unknown> {
  const handler = ipcHandlers.get('hermes:ask');

  if (!handler) {
    throw new Error('hermes:ask IPC handler was not registered');
  }

  return handler as (event: unknown, input: unknown) => Promise<unknown>;
}

function getIpcHandler<TInput = unknown, TResult = unknown>(
  channel: string
): (event?: unknown, input?: TInput) => Promise<TResult> {
  const handler = ipcHandlers.get(channel);

  if (!handler) {
    throw new Error(`${channel} IPC handler was not registered`);
  }

  return handler as (event?: unknown, input?: TInput) => Promise<TResult>;
}

const baseInput = {
  connection: {
    connectionKind: 'local',
    endpointMode: 'auto',
    baseUrl: 'http://localhost:8642',
    modelId: 'hermes-agent',
    bearerToken: ''
  },
  question: 'Should I enter this trade?',
  screenshotDataUrl: 'data:image/png;base64,QUFBQQ==',
  selectedWindow: {
    id: 'window:42',
    name: 'Trading Terminal',
    kind: 'window',
    thumbnailDataUrl: 'data:image/png;base64,preview'
  }
};

beforeAll(async () => {
  await import('./main');
  await Promise.resolve();
});

beforeEach(() => {
  askHermesMock.mockClear().mockResolvedValue('ok');
  probeHermesConnectionMock.mockClear().mockResolvedValue({
    status: 'connected',
    textCapable: true,
    imageCapable: true,
    models: [],
    attempts: [],
    summary: 'ok',
    debugReport: 'ok'
  });
  safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
  safeStorageMock.encryptString.mockClear();
  safeStorageMock.decryptString.mockClear();
  fs.rmSync(path.join(userDataDir, 'hosted-hermes-token.json'), { force: true });
});

describe('main ipc validation', () => {
  it('rejects malformed Hermes ask requests before sending', async () => {
    const handler = getHermesAskHandler();

    await expect(
      handler(undefined, {
        ...baseInput,
        screenshotDataUrl: 'data:text/plain;base64,QUFB'
      })
    ).rejects.toThrow('Screenshot must be a PNG data URL.');

    expect(askHermesMock).not.toHaveBeenCalled();
  });

  it('rejects oversized screenshot payloads before calling Hermes', async () => {
    const oversizedBase64 = 'A'.repeat(16_000_002);
    const handler = getHermesAskHandler();

    await expect(
      handler(undefined, {
        ...baseInput,
        screenshotDataUrl: `data:image/png;base64,${oversizedBase64}`
      })
    ).rejects.toThrow('Screenshot payload is too large. Close the source window or resize capture target.');

    expect(askHermesMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing question', 'Question is required.', (input: typeof baseInput) => ({ ...input, question: '  ' })],
    ['missing connection', 'Hermes connection settings are required.', () => ({ ...baseInput, connection: undefined as never })],
    [
      'missing window kind',
      'Selected window kind is invalid.',
      (input: typeof baseInput) => ({ ...input, selectedWindow: { ...input.selectedWindow, kind: 'monitor' as const } })
    ],
    ['invalid gateway URL', 'Hermes gateway URL must be a valid http or https URL.', (input: typeof baseInput) => ({ ...input, connection: { ...input.connection, baseUrl: 'ftp://example.com' } })]
  ])(
    'rejects malformed ask payload: %s', async (_label, expectedMessage, buildInput) => {
      const invalidInput = buildInput(baseInput);
      const handler = getHermesAskHandler();

      await expect(handler(undefined, invalidInput)).rejects.toThrow(expectedMessage);
      expect(askHermesMock).not.toHaveBeenCalled();
    }
  );

  it('normalizes blank compatibility route/profile values before asking Hermes', async () => {
    const handler = getHermesAskHandler();

    await expect(
      handler(undefined, {
        ...baseInput,
        connection: {
          ...baseInput.connection,
          modelId: '   '
        }
      })
    ).resolves.toBe('ok');

    expect(askHermesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({
          modelId: 'hermes-agent'
        })
      })
    );
  });

  it('injects a securely stored hosted token when asking Hermes after reload', async () => {
    const saveToken = getIpcHandler<{ token: string }>('hosted-hermes-token:save');
    const handler = getHermesAskHandler();

    await saveToken(undefined, { token: 'hosted-secret-token' });
    await handler(undefined, {
      ...baseInput,
      connection: {
        ...baseInput.connection,
        connectionKind: 'hosted',
        baseUrl: 'https://hermes.example.com',
        bearerToken: ''
      }
    });

    expect(askHermesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({
          connectionKind: 'hosted',
          bearerToken: 'hosted-secret-token'
        })
      })
    );
  });

  it('does not inject a securely stored hosted token into custom gateways', async () => {
    const saveToken = getIpcHandler<{ token: string }>('hosted-hermes-token:save');
    const testConnection = getIpcHandler('hermes:test-connection');

    await saveToken(undefined, { token: 'hosted-secret-token' });
    await testConnection(undefined, {
      ...baseInput.connection,
      connectionKind: 'custom',
      endpointMode: 'custom',
      baseUrl: 'https://hermes.example.com/v1/chat/completions',
      bearerToken: ''
    });

    expect(probeHermesConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionKind: 'custom',
        bearerToken: ''
      })
    );
  });

  it('does not replace local gateway bearer tokens with securely stored hosted tokens', async () => {
    const saveToken = getIpcHandler<{ token: string }>('hosted-hermes-token:save');
    const testConnection = getIpcHandler('hermes:test-connection');

    await saveToken(undefined, { token: 'hosted-secret-token' });
    await testConnection(undefined, {
      ...baseInput.connection,
      bearerToken: 'local-token'
    });

    expect(probeHermesConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionKind: 'local',
        bearerToken: 'local-token'
      })
    );
  });
});

describe('hosted Hermes token IPC', () => {
  it('saves an encrypted hosted token and only returns token metadata', async () => {
    const saveToken = getIpcHandler<{ token: string }>('hosted-hermes-token:save');
    const getStatus = getIpcHandler('hosted-hermes-token:status');

    const saveResult = await saveToken(undefined, { token: 'hosted-secret-token' });
    const statusResult = await getStatus();
    const storedPayload = fs.readFileSync(path.join(userDataDir, 'hosted-hermes-token.json'), 'utf8');

    expect(saveResult).toMatchObject({
      available: true,
      hasToken: true
    });
    expect(statusResult).toMatchObject({
      available: true,
      hasToken: true,
      updatedAt: expect.any(String)
    });
    expect(JSON.stringify(saveResult)).not.toContain('hosted-secret-token');
    expect(JSON.stringify(statusResult)).not.toContain('hosted-secret-token');
    expect(storedPayload).not.toContain('hosted-secret-token');
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith('hosted-secret-token');
  });

  it('clears the hosted token without returning plaintext', async () => {
    const saveToken = getIpcHandler<{ token: string }>('hosted-hermes-token:save');
    const clearToken = getIpcHandler('hosted-hermes-token:clear');
    const getStatus = getIpcHandler('hosted-hermes-token:status');

    await saveToken(undefined, { token: 'hosted-secret-token' });

    const clearResult = await clearToken();
    const statusResult = await getStatus();

    expect(clearResult).toEqual({
      available: true,
      hasToken: false,
      reason: 'not-found'
    });
    expect(statusResult).toEqual({
      available: true,
      hasToken: false,
      reason: 'not-found'
    });
    expect(JSON.stringify(clearResult)).not.toContain('hosted-secret-token');
  });

  it('returns an explicit unavailable status instead of storing plaintext when safeStorage is unavailable', async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const saveToken = getIpcHandler<{ token: string }>('hosted-hermes-token:save');

    const saveResult = await saveToken(undefined, { token: 'hosted-secret-token' });

    expect(saveResult).toEqual({
      available: false,
      hasToken: false,
      reason: 'safe-storage-unavailable'
    });
    expect(fs.existsSync(path.join(userDataDir, 'hosted-hermes-token.json'))).toBe(false);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    expect(JSON.stringify(saveResult)).not.toContain('hosted-secret-token');
  });

  it('reports corrupt hosted token storage without returning plaintext', async () => {
    fs.writeFileSync(
      path.join(userDataDir, 'hosted-hermes-token.json'),
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        ciphertextBase64: Buffer.from('not-encrypted-hosted-secret-token', 'utf8').toString('base64')
      })
    );
    safeStorageMock.decryptString.mockImplementationOnce(() => {
      throw new Error('decrypt failed');
    });
    const getStatus = getIpcHandler('hosted-hermes-token:status');

    const statusResult = await getStatus();

    expect(statusResult).toEqual({
      available: true,
      hasToken: false,
      reason: 'corrupt-token-store'
    });
    expect(JSON.stringify(statusResult)).not.toContain('hosted-secret-token');
  });
});
