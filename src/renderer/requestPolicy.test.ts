import { describe, expect, it } from 'vitest';

import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL, MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER } from '../shared/privacy';
import type { AskHermesInput, MemoryContext, MonitoringContextPayload, PrivacyPreset } from '../shared/types';
import { buildPrivacyAwareAskHermesInput, canBypassRemoteConsent, shouldCaptureWindowForPrivacy } from './requestPolicy';

describe('shouldCaptureWindowForPrivacy', () => {
  it('does not capture a real window when maximum privacy is selected', () => {
    expect(shouldCaptureWindowForPrivacy({ preset: 'maximum' })).toBe(false);
  });

  it('captures a real window for balanced and full privacy presets', () => {
    expect(shouldCaptureWindowForPrivacy({ preset: 'balanced' })).toBe(true);
    expect(shouldCaptureWindowForPrivacy({ preset: 'full' })).toBe(true);
  });
});

describe('canBypassRemoteConsent', () => {
  it('only allows the explicit remote consent confirmation to bypass the prompt', () => {
    expect(canBypassRemoteConsent('remote-consent-confirmed')).toBe(true);
    expect(canBypassRemoteConsent('friction-action')).toBe(false);
    expect(canBypassRemoteConsent(undefined)).toBe(false);
  });
});

describe('buildPrivacyAwareAskHermesInput', () => {
  it('uses only placeholder screenshot and window metadata for maximum privacy', () => {
    const input = askInput({ privacyPreset: 'maximum' });

    const request = buildPrivacyAwareAskHermesInput(input);

    expect(request.screenshotDataUrl).toBe(MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL);
    expect(request.selectedWindow).toEqual(MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER);
    expect(request.memoryContext).toBeUndefined();
    expect(request.monitoringContext).toBeUndefined();
  });

  it.each(['balanced', 'full'] as const)('preserves screenshot, window metadata, memory, and monitoring for %s privacy', (preset) => {
    const input = askInput({ privacyPreset: preset });

    const request = buildPrivacyAwareAskHermesInput(input);

    expect(request.screenshotDataUrl).toBe(input.screenshotDataUrl);
    expect(request.selectedWindow).toBe(input.selectedWindow);
    expect(request.memoryContext).toBe(input.memoryContext);
    expect(request.monitoringContext).toBe(input.monitoringContext);
  });
});

function askInput({ privacyPreset }: { privacyPreset: PrivacyPreset }): AskHermesInput {
  const memoryContext: MemoryContext = {
    matchedPatterns: [
      {
        name: 'early-entry-risk',
        evidenceCount: 2,
        summary: 'Prior private note tied to this setup.',
        recommendation: 'Wait for confirmation.'
      }
    ],
    recentNotes: [
      {
        createdAt: '2026-05-22T12:00:00.000Z',
        question: 'Should I enter?',
        response: 'Wait.',
        notes: 'Private trading note.',
        selectedWindowName: 'Private Trading Terminal'
      }
    ]
  };
  const monitoringContext: MonitoringContextPayload = {
    localWarnings: ['Local duplicate-entry warning.'],
    signals: [
      {
        source: 'clipboard',
        kind: 'evm-address',
        maskedValue: '0x1234...abcd',
        confidence: 'high',
        detectedAt: '2026-05-22T12:00:00.000Z'
      }
    ]
  };

  return {
    connection: {
      connectionKind: 'local',
      endpointMode: 'auto',
      baseUrl: 'http://localhost:8642',
      modelId: 'hermes-agent',
      bearerToken: ''
    },
    question: 'Should I take this trade?',
    screenshotDataUrl: 'data:image/png;base64,QUFBQQ==',
    selectedWindow: {
      id: 'window:private',
      name: 'Private Trading Terminal',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,preview'
    },
    memoryContext,
    monitoringContext,
    privacy: {
      preset: privacyPreset,
      redaction: {
        redactAddresses: false,
        redactBalances: false,
        redactUsernames: false,
        redactAmounts: false
      }
    }
  };
}
