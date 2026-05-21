import type {
  HermesConnectionKind,
  HermesEndpointMode,
  HermesConnectionSettings,
  LocalSettings,
  FrictionSettings,
  PrivacyPreset,
  PrivacyRedactionSettings,
  PrivacySettings
} from '../shared/types';

export const LOCAL_SETTINGS_KEY = 'hermes.settings.v1';

export const DEFAULT_HERMES_CONNECTION: HermesConnectionSettings = {
  connectionKind: 'local',
  endpointMode: 'auto',
  baseUrl: 'http://localhost:8642',
  modelId: 'hermes-agent',
  bearerToken: ''
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  preset: 'balanced',
  redaction: {
    redactAddresses: false,
    redactBalances: false,
    redactUsernames: false,
    redactAmounts: false
  }
};

export const DEFAULT_FRICTION_SETTINGS: FrictionSettings = {
  enabled: true,
  strictness: 'standard'
};

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  connection: DEFAULT_HERMES_CONNECTION,
  privacy: DEFAULT_PRIVACY_SETTINGS,
  friction: DEFAULT_FRICTION_SETTINGS,
  keepAlwaysOnTop: true,
  armed: false,
  watchClipboard: false,
  watchOCR: false
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
      privacy: parsePrivacySettings(parsed.privacy),
      friction: parseFrictionSettings(parsed.friction),
      keepAlwaysOnTop:
        typeof parsed.keepAlwaysOnTop === 'boolean'
          ? parsed.keepAlwaysOnTop
          : DEFAULT_LOCAL_SETTINGS.keepAlwaysOnTop,
      armed: typeof parsed.armed === 'boolean' ? parsed.armed : DEFAULT_LOCAL_SETTINGS.armed,
      watchClipboard:
        typeof parsed.watchClipboard === 'boolean' ? parsed.watchClipboard : DEFAULT_LOCAL_SETTINGS.watchClipboard,
      watchOCR: typeof parsed.watchOCR === 'boolean' ? parsed.watchOCR : DEFAULT_LOCAL_SETTINGS.watchOCR,
      pairedWindow: parsePairedWindow(parsed.pairedWindow)
    };
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

export function serializeLocalSettings(settings: LocalSettings): string {
  return JSON.stringify({
    connection: settings.connection,
    privacy: settings.privacy,
    friction: settings.friction,
    keepAlwaysOnTop: settings.keepAlwaysOnTop,
    armed: settings.armed,
    watchClipboard: settings.watchClipboard,
    watchOCR: settings.watchOCR,
    pairedWindow: settings.pairedWindow
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

function parsePrivacySettings(value: unknown): PrivacySettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PRIVACY_SETTINGS;
  }

  const candidate = value as Partial<PrivacySettings>;
  const preset = parsePrivacyPreset(candidate.preset);
  const redaction = parsePrivacyRedaction(candidate.redaction);

  return {
    preset,
    redaction
  };
}

function parseFrictionSettings(rawFriction: unknown): FrictionSettings {
  if (!rawFriction || typeof rawFriction !== 'object') {
    return DEFAULT_FRICTION_SETTINGS;
  }

  const candidate = rawFriction as Partial<FrictionSettings>;
  const strictness =
    candidate.strictness === 'low' || candidate.strictness === 'standard' || candidate.strictness === 'high'
      ? candidate.strictness
      : DEFAULT_FRICTION_SETTINGS.strictness;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_FRICTION_SETTINGS.enabled,
    strictness
  };
}

function parsePrivacyPreset(value: unknown): PrivacyPreset {
  return value === 'maximum' || value === 'balanced' || value === 'full' ? value : DEFAULT_PRIVACY_SETTINGS.preset;
}

function parsePrivacyRedaction(rawRedaction: unknown): PrivacyRedactionSettings {
  if (!rawRedaction || typeof rawRedaction !== 'object') {
    return DEFAULT_PRIVACY_SETTINGS.redaction;
  }

  const candidate = rawRedaction as Partial<PrivacyRedactionSettings>;

  return {
    redactAddresses:
      typeof candidate.redactAddresses === 'boolean'
        ? candidate.redactAddresses
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactAddresses,
    redactBalances:
      typeof candidate.redactBalances === 'boolean'
        ? candidate.redactBalances
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactBalances,
    redactUsernames:
      typeof candidate.redactUsernames === 'boolean'
        ? candidate.redactUsernames
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactUsernames,
    redactAmounts:
      typeof candidate.redactAmounts === 'boolean'
        ? candidate.redactAmounts
        : DEFAULT_PRIVACY_SETTINGS.redaction.redactAmounts
  };
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

function parsePairedWindow(rawWindow: unknown): LocalSettings['pairedWindow'] {
  if (!rawWindow || typeof rawWindow !== 'object') {
    return undefined;
  }

  const candidate = rawWindow as {
    id?: unknown;
    name?: unknown;
    kind?: string;
  };

  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    return undefined;
  }

  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    return undefined;
  }

  if (candidate.kind !== 'window' && candidate.kind !== 'screen') {
    return undefined;
  }

  return {
    id: candidate.id.trim(),
    name: candidate.name.trim(),
    kind: candidate.kind
  };
}
