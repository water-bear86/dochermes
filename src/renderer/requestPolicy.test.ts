import { describe, expect, it } from 'vitest';

import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL, MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER } from '../shared/privacy';
import type { AskHermesInput, MemoryContext, MonitoringContextPayload, PrivacyPreset } from '../shared/types';
import {
  buildPrivacyAwareAskHermesInput,
  buildRemoteConsentMetadata,
  canBypassRemoteConsent,
  requiresRemoteConsent,
  summarizePrivacyRequestPolicy,
  shouldCaptureWindowForPrivacy
} from './requestPolicy';

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

describe('remote consent metadata', () => {
  it('requires consent for hosted endpoints even when the URL is loopback', () => {
    const input = askInput({ privacyPreset: 'balanced', connectionKind: 'hosted', baseUrl: 'http://localhost:8642?token=secret' });

    expect(requiresRemoteConsent(input.connection)).toBe(true);

    const metadata = buildRemoteConsentMetadata(input);
    expect(metadata.requiresRemoteConsent).toBe(true);
    expect(metadata.dataSharingScope).toBe('hosted');
    expect(metadata.destinationOrigin).toBe('http://localhost:8642');
    expect(metadata.payloadClasses).toContain('Screenshot image');
    expect(JSON.stringify(metadata)).not.toContain('secret');
  });

  it('requires consent for custom remote endpoints but not custom loopback endpoints', () => {
    const customRemote = askInput({ privacyPreset: 'balanced', connectionKind: 'custom', baseUrl: 'https://coach.example/api?api_key=secret' });
    const customLocal = askInput({ privacyPreset: 'balanced', connectionKind: 'custom', baseUrl: 'http://127.0.0.1:8787/hermes' });

    expect(requiresRemoteConsent(customRemote.connection)).toBe(true);
    expect(buildRemoteConsentMetadata(customRemote).dataSharingScope).toBe('advanced');
    expect(requiresRemoteConsent(customLocal.connection)).toBe(false);
    expect(buildRemoteConsentMetadata(customLocal).dataSharingScope).toBe('local-first');
  });
});

describe('summarizePrivacyRequestPolicy', () => {
  it.each(['local', 'hosted', 'custom'] as const)('withholds real context and sends only schema placeholder imagery for maximum privacy over %s', (connectionKind) => {
    const input = askInput({
      privacyPreset: 'maximum',
      connectionKind,
      baseUrl: connectionKind === 'custom' ? 'https://coach.example/hermes?token=secret' : undefined
    });

    const summary = summarizePrivacyRequestPolicy(input);

    expect(summary.screenshot).toBe('placeholder');
    expect(summary.schemaRequiresScreenshot).toBe(true);
    expect(summary.windowTitle).toBe('withheld');
    expect(summary.memoryContext).toBe('withheld');
    expect(summary.monitoringContext).toBe('withheld');
    expect(summary.tradeSummary).toBe('withheld');
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(JSON.stringify(summary)).not.toContain('Private Trading Terminal');
  });

  it.each(['balanced', 'full'] as const)('summarizes sent context for %s privacy without leaking raw values', (preset) => {
    const input = askInput({ privacyPreset: preset, connectionKind: 'hosted', baseUrl: 'https://hosted.example/hermes?token=secret' });

    const summary = summarizePrivacyRequestPolicy(input);

    expect(summary.screenshot).toBe('sent');
    expect(summary.windowTitle).toBe('sent');
    expect(summary.memoryContext).toBe('sent');
    expect(summary.monitoringContext).toBe('sent');
    expect(summary.tradeSummary).toBe('sent');
    expect(summary.remoteConsentRequired).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(JSON.stringify(summary)).not.toContain('0x1234');
  });

  it('treats decision outcome stats as compact memory and trade summary content', () => {
    const input = askInput({ privacyPreset: 'balanced', connectionKind: 'hosted', baseUrl: 'https://hosted.example/hermes?token=secret' });
    input.memoryContext = statsOnlyMemoryContext();

    const summary = summarizePrivacyRequestPolicy(input);
    const metadata = buildRemoteConsentMetadata(input);

    expect(summary.memoryContext).toBe('sent');
    expect(summary.tradeSummary).toBe('sent');
    expect(metadata.payloadClasses).toContain('Compact memory context');
    expect(metadata.payloadClasses).toContain('Compact trade summary');
    expect(JSON.stringify(metadata)).not.toContain('secret');
  });

  it('withholds decision outcome stats in maximum privacy summaries', () => {
    const input = askInput({ privacyPreset: 'maximum' });
    input.memoryContext = statsOnlyMemoryContext();

    const summary = summarizePrivacyRequestPolicy(input);
    const metadata = buildRemoteConsentMetadata(input);

    expect(summary.memoryContext).toBe('withheld');
    expect(summary.tradeSummary).toBe('withheld');
    expect(metadata.localOnlyClasses).toContain('Compact memory context');
    expect(metadata.localOnlyClasses).toContain('Compact trade summary');
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

function askInput({
  privacyPreset,
  connectionKind = 'local',
  baseUrl
}: {
  privacyPreset: PrivacyPreset;
  connectionKind?: AskHermesInput['connection']['connectionKind'];
  baseUrl?: string;
}): AskHermesInput {
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
    ],
    tradeHistorySummary: {
      totalTrades: 3,
      importedTrades: 2,
      walletTrades: 1,
      tradesLastHour: 1,
      tradesLastDay: 3,
      recentLossStreak: 2,
      sizeSignals: [{ unit: 'SOL', medianSize: 1.2, maxSize: 3, sampleCount: 3 }]
    }
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
      connectionKind,
      endpointMode: connectionKind === 'hosted' ? 'openai-chat' : connectionKind === 'custom' ? 'custom' : 'auto',
      baseUrl: baseUrl ?? (connectionKind === 'hosted' ? 'https://hosted.example/hermes' : 'http://localhost:8642'),
      modelId: 'hermes-agent',
      bearerToken: 'secret-token'
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

function statsOnlyMemoryContext(): MemoryContext {
  return {
    matchedPatterns: [],
    recentNotes: [],
    tradeBehaviorStats: {
      tradeCount: 3,
      recentLossStreak: 1,
      tradesLastHour: 1,
      tradesLastDay: 3,
      commonMistakeTags: [{ tag: 'early-entry', count: 2 }],
      decisionOutcomeStats: {
        immediateEntry: {
          count: 2,
          wins: 0,
          losses: 2,
          breakeven: 0,
          skipped: 0,
          unknown: 0,
          winRate: 0,
          lossRate: 1
        },
        waitedConfirmation: {
          count: 1,
          wins: 1,
          losses: 0,
          breakeven: 0,
          skipped: 0,
          unknown: 0,
          winRate: 1,
          lossRate: 0
        },
        skipped: {
          count: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          skipped: 0,
          unknown: 0,
          winRate: undefined,
          lossRate: undefined
        }
      }
    }
  };
}
