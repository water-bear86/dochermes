import type { LocalSettings } from '../shared/types';

export const LOCAL_SETTINGS_KEY = 'hermes.settings.v1';

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  gatewayUrl: 'http://localhost:8787/coach',
  keepAlwaysOnTop: true
};

export function parseLocalSettings(rawValue: string | null): LocalSettings {
  if (!rawValue) {
    return DEFAULT_LOCAL_SETTINGS;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LocalSettings>;

    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === 'string' && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : DEFAULT_LOCAL_SETTINGS.gatewayUrl,
      keepAlwaysOnTop:
        typeof parsed.keepAlwaysOnTop === 'boolean'
          ? parsed.keepAlwaysOnTop
          : DEFAULT_LOCAL_SETTINGS.keepAlwaysOnTop
    };
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

export function serializeLocalSettings(settings: LocalSettings): string {
  return JSON.stringify({
    gatewayUrl: settings.gatewayUrl,
    keepAlwaysOnTop: settings.keepAlwaysOnTop
  });
}

export function readLocalSettings(storage: Pick<Storage, 'getItem'>): LocalSettings {
  return parseLocalSettings(storage.getItem(LOCAL_SETTINGS_KEY));
}

export function writeLocalSettings(storage: Pick<Storage, 'setItem'>, settings: LocalSettings): void {
  storage.setItem(LOCAL_SETTINGS_KEY, serializeLocalSettings(settings));
}
