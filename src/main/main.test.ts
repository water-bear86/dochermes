import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown> | unknown>();
const askHermesMock = vi.fn(async () => 'ok');

vi.mock('electron', () => {
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    })
  };

  return {
    app: {
      setName: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve(undefined)),
      on: vi.fn()
    },
    BrowserWindow: class {},
    clipboard: {
      readText: vi.fn(() => '')
    },
    ipcMain
  };
});

vi.mock('./hermesClient', () => ({
  askHermes: askHermesMock,
  probeHermesConnection: vi.fn()
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
});
