import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_SETTINGS,
  DEFAULT_OCR_REGION_PROFILE,
  DEFAULT_RISK_BUDGET_SETTINGS,
  DEFAULT_VOICE_SETTINGS,
  DEFAULT_SOURCE_CONSTRAINTS,
  LOCAL_SETTINGS_KEY,
  clearLocalSettings,
  parseLocalSettings,
  serializeLocalSettings
} from './localSettings';

describe('parseLocalSettings', () => {
  it('returns defaults when storage has no settings', () => {
    expect(parseLocalSettings(null)).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it('keeps valid gateway, privacy, and panel preferences from storage', () => {
    expect(
      parseLocalSettings(
        JSON.stringify({
          connection: {
            connectionKind: 'hosted',
            endpointMode: 'openai-chat',
            baseUrl: 'https://hermes.example.com',
            modelId: 'hermes-agent',
            bearerToken: 'secret'
          },
          privacy: {
            preset: 'full',
            redaction: {
              redactAddresses: true,
              redactBalances: false,
              redactUsernames: true,
              redactAmounts: true
            }
          },
          friction: {
            enabled: false,
            strictness: 'high'
          },
          riskBudget: {
            enabled: true,
            maxTradesPerSession: 9,
            maxLossPerSessionPercent: 18,
            cooldownMinutesAfterLoss: 22,
            maxSizeMultiplier: 1.8,
            tiltSensitivity: 'standard'
          // not expected, parse should default constraints for missing source rules
          },
          coachMode: 'advisory',
          dataSharing: {
            useLocalTradeHistoryForRiskChecks: true,
            sendCompactTradeSummaryToHermes: false,
            sendRawTradeRecordsToHermes: false,
            observedWalletAddresses: ['0xabc123']
          },
          keepAlwaysOnTop: false,
          armed: true,
          watchClipboard: true,
          watchOCR: true,
          ocrContextMode: 'order-panel',
          ocrRegionProfile: {
            overlayEnabled: false,
            orderPanel: {
              left: 0.61,
              top: 0.05,
              width: 0.34,
              height: 0.88
            },
            chartZone: {
              left: 0.05,
              top: 0.05,
              width: 0.5,
              height: 0.6
            }
          },
          voice: {
            enabled: true,
            hotkey: 'alt-space',
            speakReplies: true
          },
          pairedWindow: {
            id: 'window:42',
            name: 'Trading Terminal',
            kind: 'window'
          }
        })
      )
      ).toEqual({
      connection: {
        connectionKind: 'hosted',
        endpointMode: 'openai-chat',
        baseUrl: 'https://hermes.example.com',
        modelId: 'hermes-agent',
        bearerToken: 'secret'
      },
      privacy: {
        preset: 'full',
        redaction: {
          redactAddresses: true,
          redactBalances: false,
          redactUsernames: true,
          redactAmounts: true
        }
      },
      friction: {
        enabled: false,
        strictness: 'high'
      },
      riskBudget: {
        enabled: true,
        maxTradesPerSession: 9,
        maxLossPerSessionPercent: 18,
        cooldownMinutesAfterLoss: 22,
        maxSizeMultiplier: 1.8,
        tiltSensitivity: 'standard',
        sourceConstraints: DEFAULT_SOURCE_CONSTRAINTS
      },
      personalRules: [],
      coachMode: 'advisory',
      dataSharing: {
        useLocalTradeHistoryForRiskChecks: true,
        sendCompactTradeSummaryToHermes: false,
        sendRawTradeRecordsToHermes: false,
        observedWalletAddresses: ['0xabc123']
      },
      keepAlwaysOnTop: false,
      armed: true,
      watchClipboard: true,
      watchOCR: true,
      ocrContextMode: 'order-panel',
      ocrRegionProfile: {
        overlayEnabled: false,
        orderPanel: {
          left: 0.61,
          top: 0.05,
          width: 0.34,
          height: 0.88
        },
        chartZone: {
          left: 0.05,
          top: 0.05,
          width: 0.5,
          height: 0.6
        }
      },
      voice: {
        enabled: true,
        hotkey: 'alt-space',
        speakReplies: true
      },
      pairedWindow: {
        id: 'window:42',
        name: 'Trading Terminal',
        kind: 'window'
      }
    });
  });

  it('migrates old gatewayUrl settings into explicit legacy mode', () => {
    expect(
      parseLocalSettings(
        JSON.stringify({
          gatewayUrl: 'http://localhost:8787/coach',
          keepAlwaysOnTop: true
        })
      )
    ).toEqual({
      connection: {
        connectionKind: 'custom',
        endpointMode: 'legacy-coach',
        baseUrl: 'http://localhost:8787',
        modelId: 'hermes-agent',
        bearerToken: ''
      },
      privacy: {
        preset: 'balanced',
        redaction: {
          redactAddresses: false,
          redactBalances: false,
          redactUsernames: false,
          redactAmounts: false
        }
      },
      friction: {
        enabled: true,
        strictness: 'standard'
      },
      riskBudget: DEFAULT_RISK_BUDGET_SETTINGS,
      personalRules: [],
      coachMode: 'advisory',
      dataSharing: DEFAULT_LOCAL_SETTINGS.dataSharing,
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false,
      ocrContextMode: 'full-window',
      ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
      voice: DEFAULT_VOICE_SETTINGS
    });
  });

  it('migrates old /coach gateway variants into explicit legacy mode', () => {
    expect(
      parseLocalSettings(
        JSON.stringify({
          gatewayUrl: 'http://localhost:8787/coach/'
        })
      )
    ).toEqual({
      connection: {
        connectionKind: 'custom',
        endpointMode: 'legacy-coach',
        baseUrl: 'http://localhost:8787',
        modelId: 'hermes-agent',
        bearerToken: ''
      },
      privacy: {
        preset: 'balanced',
        redaction: {
          redactAddresses: false,
          redactBalances: false,
          redactUsernames: false,
          redactAmounts: false
        }
      },
      friction: {
        enabled: true,
        strictness: 'standard'
      },
      riskBudget: DEFAULT_RISK_BUDGET_SETTINGS,
      personalRules: [],
      coachMode: 'advisory',
      dataSharing: DEFAULT_LOCAL_SETTINGS.dataSharing,
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false,
      ocrContextMode: 'full-window',
      ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
      voice: DEFAULT_VOICE_SETTINGS
    });

    expect(
      parseLocalSettings(
        JSON.stringify({
          gatewayUrl: 'http://localhost:8787/coach?token=old'
        })
      )
    ).toEqual({
      connection: {
        connectionKind: 'custom',
        endpointMode: 'legacy-coach',
        baseUrl: 'http://localhost:8787',
        modelId: 'hermes-agent',
        bearerToken: ''
      },
      privacy: {
        preset: 'balanced',
        redaction: {
          redactAddresses: false,
          redactBalances: false,
          redactUsernames: false,
          redactAmounts: false
        }
      },
      friction: {
        enabled: true,
        strictness: 'standard'
      },
      riskBudget: DEFAULT_RISK_BUDGET_SETTINGS,
      personalRules: [],
      coachMode: 'advisory',
      dataSharing: DEFAULT_LOCAL_SETTINGS.dataSharing,
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false,
      ocrContextMode: 'full-window',
      ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
      voice: DEFAULT_VOICE_SETTINGS
    });
  });

  it('validates malformed privacy settings while preserving known-good connection settings', () => {
    expect(
      parseLocalSettings(
        JSON.stringify({
          connection: {
            connectionKind: 'nope',
            endpointMode: 'wat',
            baseUrl: '',
            modelId: '',
            bearerToken: 123
          },
          privacy: {
            preset: 'sledgehammer',
            redaction: {
              redactAddresses: 'yes',
              redactBalances: 1,
              redactUsernames: null,
              redactAmounts: 'no'
            }
          },
          friction: {
            enabled: 'no',
            strictness: 'ultra'
          },
          riskBudget: {
            enabled: 'yes',
            maxTradesPerSession: 'four',
            maxLossPerSessionPercent: -1,
            cooldownMinutesAfterLoss: 30.2,
            maxSizeMultiplier: 0
          },
          keepAlwaysOnTop: 'yes',
          armed: 'yes',
          watchClipboard: 'no',
          watchOCR: null,
          ocrContextMode: 'bogus',
          pairedWindow: {
            id: '',
            name: 'bad',
            kind: 'window'
          }
        })
      )
    ).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it('parses stored personal rules and drops invalid entries', () => {
    const { personalRules } = parseLocalSettings(
      JSON.stringify({
        connection: {
          connectionKind: 'local',
          endpointMode: 'auto',
          baseUrl: 'http://localhost:8642',
          modelId: 'hermes-agent',
          bearerToken: ''
        },
        privacy: {
          preset: 'balanced',
          redaction: {
            redactAddresses: false,
            redactBalances: false,
            redactUsernames: false,
            redactAmounts: false
          }
        },
        friction: {
          enabled: true,
          strictness: 'standard'
        },
        riskBudget: {
          enabled: true,
          maxTradesPerSession: 9,
          maxLossPerSessionPercent: 18,
          cooldownMinutesAfterLoss: 0,
          maxSizeMultiplier: 2,
          tiltSensitivity: 'standard',
          sourceConstraints: DEFAULT_SOURCE_CONSTRAINTS
        },
        coachMode: 'advisory',
        dataSharing: DEFAULT_LOCAL_SETTINGS.dataSharing,
        keepAlwaysOnTop: true,
        armed: false,
        watchClipboard: false,
        watchOCR: false,
        ocrContextMode: 'full-window',
        ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
        voice: DEFAULT_VOICE_SETTINGS,
        personalRules: [
          {
            id: 'rule-1',
            text: 'Never enter without confirmation',
            enabled: true,
            archived: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z'
          },
          {
            id: 123,
            text: '   ',
            enabled: 'yes'
          },
          {
            text: 'Never size above 5 SOL',
            enabled: true,
            archived: false
          }
        ]
      })
    );

    expect(personalRules).toHaveLength(2);
    expect(personalRules[0]).toMatchObject({
      id: 'rule-1',
      text: 'Never enter without confirmation',
      enabled: true,
      archived: false
    });
    expect(personalRules[1]).toMatchObject({
      id: expect.stringMatching(/^rule-\d+/),
      text: 'Never size above 5 SOL',
      enabled: true,
      archived: false
    });
  });
});

describe('serializeLocalSettings', () => {
  it('serializes only the settings shape the app owns', () => {
    expect(
      JSON.parse(
        serializeLocalSettings({
          connection: {
            connectionKind: 'local',
            endpointMode: 'auto',
            baseUrl: 'http://localhost:8642',
            modelId: 'hermes-agent',
            bearerToken: ''
          },
          privacy: {
            preset: 'balanced',
            redaction: {
              redactAddresses: true,
              redactBalances: false,
              redactUsernames: true,
              redactAmounts: true
            }
          },
          friction: {
            enabled: true,
            strictness: 'standard'
          },
          riskBudget: {
            enabled: true,
            maxTradesPerSession: 6,
            maxLossPerSessionPercent: 18,
            cooldownMinutesAfterLoss: 20,
            maxSizeMultiplier: 1.8,
            tiltSensitivity: 'standard',
            sourceConstraints: DEFAULT_SOURCE_CONSTRAINTS
          },
          personalRules: [],
          coachMode: 'advisory',
          dataSharing: {
            useLocalTradeHistoryForRiskChecks: true,
            sendCompactTradeSummaryToHermes: true,
            sendRawTradeRecordsToHermes: false,
            observedWalletAddresses: ['wallet-one', 'wallet-two']
          },
          keepAlwaysOnTop: true,
          armed: false,
          watchClipboard: false,
          watchOCR: false,
          ocrContextMode: 'chart-order-panel',
          ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
          voice: DEFAULT_VOICE_SETTINGS,
          pairedWindow: {
            id: 'window:1',
            name: 'Trading Window',
            kind: 'window'
          }
        })
      )
    ).toEqual({
      connection: {
        connectionKind: 'local',
        endpointMode: 'auto',
        baseUrl: 'http://localhost:8642',
        modelId: 'hermes-agent',
        bearerToken: ''
      },
      privacy: {
        preset: 'balanced',
        redaction: {
          redactAddresses: true,
          redactBalances: false,
          redactUsernames: true,
          redactAmounts: true
        }
      },
      friction: {
        enabled: true,
        strictness: 'standard'
      },
      coachMode: 'advisory',
      riskBudget: {
        enabled: true,
        maxTradesPerSession: 6,
        maxLossPerSessionPercent: 18,
        cooldownMinutesAfterLoss: 20,
        maxSizeMultiplier: 1.8,
        tiltSensitivity: 'standard',
        sourceConstraints: DEFAULT_SOURCE_CONSTRAINTS
      },
      personalRules: [],
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false,
      ocrContextMode: 'chart-order-panel',
      ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
      dataSharing: {
        useLocalTradeHistoryForRiskChecks: true,
        sendCompactTradeSummaryToHermes: true,
        sendRawTradeRecordsToHermes: false,
        observedWalletAddresses: ['wallet-one', 'wallet-two']
      },
      voice: DEFAULT_VOICE_SETTINGS,
      pairedWindow: {
        id: 'window:1',
        name: 'Trading Window',
        kind: 'window'
      }
    });
  });
});

describe('clearLocalSettings', () => {
  it('removes local settings from storage and returns defaults', () => {
    const storage = new MapBackedStorage();
    storage.setItem(
      LOCAL_SETTINGS_KEY,
      JSON.stringify({
        connection: {
          connectionKind: 'hosted',
          endpointMode: 'openai-chat',
          baseUrl: 'https://hermes.example.com',
          modelId: 'remote-model',
          bearerToken: 'secret'
        },
        keepAlwaysOnTop: false
      })
    );
    storage.setItem('hermes.journal.v1', '[]');

    expect(clearLocalSettings(storage)).toEqual(DEFAULT_LOCAL_SETTINGS);
    expect(storage.getItem(LOCAL_SETTINGS_KEY)).toBeNull();
    expect(storage.getItem('hermes.journal.v1')).toBe('[]');
  });
});

class MapBackedStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
