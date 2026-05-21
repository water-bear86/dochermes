import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_SETTINGS,
  DEFAULT_RISK_BUDGET_SETTINGS,
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
          },
          keepAlwaysOnTop: false,
          armed: true,
          watchClipboard: true,
          watchOCR: true,
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
        tiltSensitivity: 'standard'
      },
      keepAlwaysOnTop: false,
      armed: true,
      watchClipboard: true,
      watchOCR: true,
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
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false
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
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false
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
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false
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
          pairedWindow: {
            id: '',
            name: 'bad',
            kind: 'window'
          }
        })
      )
    ).toEqual(DEFAULT_LOCAL_SETTINGS);
  });
});

describe('serializeLocalSettings', () => {
  it('serializes only the settings shape the app owns', () => {
    expect(
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
          tiltSensitivity: 'standard'
        },
        keepAlwaysOnTop: true,
        armed: false,
        watchClipboard: false,
        watchOCR: false,
        pairedWindow: {
          id: 'window:1',
          name: 'Trading Window',
          kind: 'window'
        }
      })
    ).toBe(
      '{"connection":{"connectionKind":"local","endpointMode":"auto","baseUrl":"http://localhost:8642","modelId":"hermes-agent","bearerToken":""},"privacy":{"preset":"balanced","redaction":{"redactAddresses":true,"redactBalances":false,"redactUsernames":true,"redactAmounts":true}},"friction":{"enabled":true,"strictness":"standard"},"riskBudget":{"enabled":true,"maxTradesPerSession":6,"maxLossPerSessionPercent":18,"cooldownMinutesAfterLoss":20,"maxSizeMultiplier":1.8,"tiltSensitivity":"standard"},"keepAlwaysOnTop":true,"armed":false,"watchClipboard":false,"watchOCR":false,"pairedWindow":{"id":"window:1","name":"Trading Window","kind":"window"}}'
    );
  });
});
