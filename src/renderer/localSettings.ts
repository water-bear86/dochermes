import type { HermesConnectionKind, HermesEndpointMode, HermesConnectionSettings, LocalSettings } from '../shared/types';

export const LOCAL_SETTINGS_KEY = 'hermes.settings.v1';

export const DEFAULT_HERMES_CONNECTION: HermesConnectionSettings = {
  connectionKind: 'local',
  endpointMode: 'auto',
  baseUrl: 'http://localhost:8642',
  modelId: 'hermes-agent',
  bearerToken: ''
};

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  connection: DEFAULT_HERMES_CONNECTION,
  keepAlwaysOnTop: true
};

export function parseLocalSettings(rawValue: string | null): LocalSettings {
  if (!rawValue) {
    return DEFAULT_LOCAL_SETTINGS;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LocalSettings> & {
      gatewayUrl?: unknown;
    };

    return {
      connection: parseConnectionSettings(parsed.connection, parsed.gatewayUrl),
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
    connection: settings.connection,
    keepAlwaysOnTop: settings.keepAlwaysOnTop
  });
}

export function readLocalSettings(storage: Pick<Storage, 'getItem'>): LocalSettings {
  return parseLocalSettings(storage.getItem(LOCAL_SETTINGS_KEY));
}

export function writeLocalSettings(storage: Pick<Storage, 'setItem'>, settings: LocalSettings): void {
  storage.setItem(LOCAL_SETTINGS_KEY, serializeLocalSettings(settings));
}

function parseConnectionSettings(
  rawConnection: unknown,
  legacyGatewayUrl: unknown
): HermesConnectionSettings {
  if (rawConnection && typeof rawConnection === 'object') {
    const connection = rawConnection as Partial<HermesConnectionSettings>;

    return {
      connectionKind: parseConnectionKind(connection.connectionKind),
      endpointMode: parseEndpointMode(connection.endpointMode),
      baseUrl: parseNonEmptyString(connection.baseUrl, DEFAULT_HERMES_CONNECTION.baseUrl),
      modelId: parseNonEmptyString(connection.modelId, DEFAULT_HERMES_CONNECTION.modelId),
      bearerToken: typeof connection.bearerToken === 'string' ? connection.bearerToken : ''
    };
  }

  if (typeof legacyGatewayUrl === 'string' && legacyGatewayUrl.trim()) {
    return migrateLegacyGatewayUrl(legacyGatewayUrl.trim());
  }

  return DEFAULT_HERMES_CONNECTION;
}

function parseConnectionKind(value: unknown): HermesConnectionKind {
  return value === 'local' || value === 'hosted' || value === 'custom'
    ? value
    : DEFAULT_HERMES_CONNECTION.connectionKind;
}

function parseEndpointMode(value: unknown): HermesEndpointMode {
  return value === 'auto' || value === 'openai-chat' || value === 'legacy-coach' || value === 'custom'
    ? value
    : DEFAULT_HERMES_CONNECTION.endpointMode;
}

function parseNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function migrateLegacyGatewayUrl(gatewayUrl: string): HermesConnectionSettings {
  const normalized = normalizeLegacyGatewayUrl(gatewayUrl);

  if (normalized.endsWith('/coach')) {
    return {
      connectionKind: 'custom',
      endpointMode: 'legacy-coach',
      baseUrl: normalized.slice(0, -'/coach'.length),
      modelId: DEFAULT_HERMES_CONNECTION.modelId,
      bearerToken: ''
    };
  }

  return {
    connectionKind: 'custom',
    endpointMode: 'custom',
    baseUrl: normalized,
    modelId: DEFAULT_HERMES_CONNECTION.modelId,
    bearerToken: ''
  };
}

function normalizeLegacyGatewayUrl(gatewayUrl: string): string {
  try {
    const url = new URL(gatewayUrl);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return gatewayUrl.replace(/\/$/, '');
  }
}
