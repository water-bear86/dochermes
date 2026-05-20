import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCAL_SETTINGS, parseLocalSettings, serializeLocalSettings } from './localSettings';

describe('parseLocalSettings', () => {
  it('returns defaults when storage has no settings', () => {
    expect(parseLocalSettings(null)).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it('keeps valid gateway and panel preferences from storage', () => {
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
      keepAlwaysOnTop: true,
      armed: false,
      watchClipboard: false,
      watchOCR: false
    });
  });

  it('falls back field-by-field when saved settings are malformed', () => {
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
        keepAlwaysOnTop: true,
        armed: false,
        watchClipboard: false,
        watchOCR: false,
        pairedWindow: {
          id: 'window:1',
          name: 'Trading Terminal',
          kind: 'window'
        }
      })
    ).toBe(
      '{"connection":{"connectionKind":"local","endpointMode":"auto","baseUrl":"http://localhost:8642","modelId":"hermes-agent","bearerToken":""},"keepAlwaysOnTop":true,"armed":false,"watchClipboard":false,"watchOCR":false,"pairedWindow":{"id":"window:1","name":"Trading Terminal","kind":"window"}}'
    );
  });
});
