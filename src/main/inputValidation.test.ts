import { describe, expect, it } from 'vitest';
import type { AskHermesInput } from '../shared/types';

import {
  assertAskHermesInput,
  assertHermesConnection,
  assertVoiceSettings,
  MAX_SCREENSHOT_BYTES,
  estimateBase64Bytes
} from './inputValidation';

const VALID_BASE_CONNECTION = {
  connectionKind: 'local' as const,
  endpointMode: 'auto' as const,
  baseUrl: 'http://localhost:8642',
  modelId: 'hermes-agent',
  bearerToken: ''
};

describe('estimateBase64Bytes', () => {
  it('returns zero for malformed data URLs', () => {
    expect(estimateBase64Bytes('not-a-data-url')).toBe(0);
  });

  it('computes rough binary byte size from base64 payload length', () => {
    expect(estimateBase64Bytes('data:image/png;base64,QQ==')).toBe(1);
  });
});

describe('assertHermesConnection', () => {
  it('trims and returns a normalized Hermes connection payload', () => {
    expect(
      assertHermesConnection({
        ...VALID_BASE_CONNECTION,
        baseUrl: '  http://localhost:8642  ',
        bearerToken: '  secret  '
      })
    ).toEqual({
      ...VALID_BASE_CONNECTION,
      baseUrl: 'http://localhost:8642',
      bearerToken: 'secret'
    });
  });

  it('rejects non-http/https endpoints', () => {
    expect(() => assertHermesConnection({ ...VALID_BASE_CONNECTION, baseUrl: 'ftp://example.com' })).toThrow(
      'Hermes base URL must be a valid http or https URL.'
    );
  });

  it('rejects missing model ID', () => {
    expect(() => assertHermesConnection({ ...VALID_BASE_CONNECTION, modelId: '   ' })).toThrow(
      'Hermes model ID is required.'
    );
  });

  it('rejects non-string model ID', () => {
    expect(() => assertHermesConnection({ ...VALID_BASE_CONNECTION, modelId: 123 as unknown as string })).toThrow(
      'Hermes model ID is required.'
    );
  });

  it('rejects non-string bearer token', () => {
    expect(() => assertHermesConnection({ ...VALID_BASE_CONNECTION, bearerToken: 123 as unknown as string })).toThrow(
      'Hermes bearer token must be a string.'
    );
  });
});

describe('assertAskHermesInput', () => {
  const baseInput: AskHermesInput = {
    connection: VALID_BASE_CONNECTION,
    question: 'Should I buy this token?',
    screenshotDataUrl: 'data:image/png;base64,QUFBQQ==',
    selectedWindow: {
      id: 'window:1',
      name: 'Trading App',
      kind: 'window',
      thumbnailDataUrl: ''
    }
  };

  it('accepts a valid Hermes ask request', () => {
    expect(() => assertAskHermesInput(baseInput)).not.toThrow();
  });

  it('rejects malformed screenshot content', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        screenshotDataUrl: 'data:image/png;base64,!!!'
      })
    ).toThrow('Screenshot must be a PNG data URL.');
  });

  it('rejects empty screenshot payload', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        screenshotDataUrl: 'data:image/png;base64,'
      })
    ).toThrow('Screenshot must include valid PNG base64 payload.');
  });

  it('rejects missing question', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        question: '   '
      })
    ).toThrow('Question is required.');
  });

  it('rejects missing selectedWindow id', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        selectedWindow: {
          id: '',
          name: 'Trading App',
          kind: 'window',
          thumbnailDataUrl: ''
        }
      })
    ).toThrow('Selected window id is required.');
  });

  it('rejects missing selectedWindow name', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        selectedWindow: {
          id: 'window:1',
          name: '   ',
          kind: 'window',
          thumbnailDataUrl: ''
        }
      })
    ).toThrow('Selected window name is required.');
  });

  it('rejects malformed selectedWindow payload', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        selectedWindow: 'bad' as unknown as AskHermesInput['selectedWindow']
      })
    ).toThrow('Selected window is required.');
  });

  it('rejects non-png screenshot prefix', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        screenshotDataUrl: 'data:text/plain;base64,QUFB'
      })
    ).toThrow('Screenshot must be a PNG data URL.');
  });

  it('rejects malformed connection payload', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        connection: { ...baseInput.connection, connectionKind: 'invalid' as unknown as 'local' }
      })
    ).toThrow('Hermes connection kind is invalid.');
  });

  it('rejects malformed window kind', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        selectedWindow: { ...baseInput.selectedWindow, kind: 'monitor' as unknown as 'window' }
      } as AskHermesInput)
    ).toThrow('Selected window kind is invalid.');
  });

  it('adds default privacy settings when omitted', () => {
    const input = assertAskHermesInput(baseInput);
    expect(input.privacy).toEqual({
      preset: 'balanced',
      redaction: {
        redactAddresses: false,
        redactBalances: false,
        redactUsernames: false,
        redactAmounts: false
      }
    });
  });

  it('normalizes provided privacy presets', () => {
    const input = assertAskHermesInput({
      ...baseInput,
      privacy: {
        preset: 'maximum',
        redaction: {
          redactAddresses: true,
          redactBalances: true,
          redactUsernames: false,
          redactAmounts: true
        }
      }
    });

    expect(input.privacy).toEqual({
      preset: 'maximum',
      redaction: {
        redactAddresses: true,
        redactBalances: true,
        redactUsernames: false,
        redactAmounts: true
      }
    });
  });

  it('rejects oversized screenshots at boundary', () => {
    const oversizedBase64 = 'A'.repeat(16_000_002);
    expect(estimateBase64Bytes(`data:image/png;base64,${oversizedBase64}`)).toBeGreaterThan(MAX_SCREENSHOT_BYTES);

    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        screenshotDataUrl: `data:image/png;base64,${oversizedBase64}`
      })
    ).toThrow('Screenshot payload is too large. Close the source window or resize capture target.');
  });

  it('rejects malformed memory context instead of passing it to the main process', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        memoryContext: {
          matchedPatterns: 'bad',
          recentNotes: []
        }
      } as unknown as AskHermesInput)
    ).toThrow('Memory context is invalid.');
  });

  it('rejects malformed monitoring context instead of passing it to the main process', () => {
    expect(() =>
      assertAskHermesInput({
        ...baseInput,
        monitoringContext: {
          localWarnings: ['Slow down.'],
          signals: [{ source: 'clipboard', kind: 'evm-address', maskedValue: 42, confidence: 'high', detectedAt: 'now' }]
        }
      } as unknown as AskHermesInput)
    ).toThrow('Monitoring context is invalid.');
  });
});

describe('assertVoiceSettings', () => {
  it('normalizes missing or malformed voice settings', () => {
    expect(() => assertVoiceSettings(undefined)).toThrow('Voice settings payload is required.');
    expect(assertVoiceSettings({ enabled: 'yes' as unknown as boolean, hotkey: 'invalid' as never, speakReplies: 'no' as never })).toEqual(
      {
        enabled: false,
        hotkey: 'space',
        speakReplies: false
      }
    );
  });

  it('accepts valid voice settings', () => {
    expect(
      assertVoiceSettings({
        enabled: true,
        hotkey: 'cmd-space',
        speakReplies: true
      })
    ).toEqual({
      enabled: true,
      hotkey: 'cmd-space',
      speakReplies: true
    });
  });
});
