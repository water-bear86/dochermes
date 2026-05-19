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
          gatewayUrl: 'http://localhost:9000/api/coach',
          keepAlwaysOnTop: false
        })
      )
    ).toEqual({
      gatewayUrl: 'http://localhost:9000/api/coach',
      keepAlwaysOnTop: false
    });
  });

  it('falls back field-by-field when saved settings are malformed', () => {
    expect(
      parseLocalSettings(
        JSON.stringify({
          gatewayUrl: '',
          keepAlwaysOnTop: 'yes'
        })
      )
    ).toEqual(DEFAULT_LOCAL_SETTINGS);
  });
});

describe('serializeLocalSettings', () => {
  it('serializes only the settings shape the app owns', () => {
    expect(
      serializeLocalSettings({
        gatewayUrl: 'http://localhost:8787/coach',
        keepAlwaysOnTop: true
      })
    ).toBe('{"gatewayUrl":"http://localhost:8787/coach","keepAlwaysOnTop":true}');
  });
});
