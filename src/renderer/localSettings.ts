import type {
  HermesConnectionKind,
  HermesEndpointMode,
  HermesConnectionSettings,
  LocalSettings,
  FrictionSettings,
  PersonalRule,
  CoachMode,
  SessionBudgetSettings,
  DataSharingSettings,
  SourceConstraintCatalog,
  SourceCategory,
  VoiceSettings,
  VoiceHotkey,
  OcrContextMode,
  OcrRegionProfileSettings,
  SetupSettings,
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

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  hotkey: 'space',
  speakReplies: false
};

export const DEFAULT_SETUP_SETTINGS: SetupSettings = {};

export const DEFAULT_OCR_REGION_PROFILE: OcrRegionProfileSettings = {
  overlayEnabled: true,
  orderPanel: {
    left: 0.58,
    top: 0.03,
    width: 0.39,
    height: 0.94
  },
  chartZone: {
    left: 0.03,
    top: 0.03,
    width: 0.54,
    height: 0.58
  }
};

const DEFAULT_COACH_MODE: CoachMode = 'advisory';

export const DEFAULT_SOURCE_CONSTRAINTS: SourceConstraintCatalog = {
  'telegram': { enabled: false, maxSizeMultiplier: 1 },
  'discord': { enabled: false, maxSizeMultiplier: 1 },
  'social': { enabled: false, maxSizeMultiplier: 1 },
  'dex-link': { enabled: false, maxSizeMultiplier: 1 },
  'token-address': { enabled: false, maxSizeMultiplier: 1 },
  'wallet': { enabled: false, maxSizeMultiplier: 1 },
  'unknown': { enabled: false, maxSizeMultiplier: 1 }
};

export const DEFAULT_RISK_BUDGET_SETTINGS: SessionBudgetSettings = {
  enabled: false,
  maxTradesPerSession: 4,
  maxLossPerSessionPercent: 12,
  cooldownMinutesAfterLoss: 45,
  maxSizeMultiplier: 2,
  tiltSensitivity: 'standard',
  sourceConstraints: DEFAULT_SOURCE_CONSTRAINTS
};

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  connection: DEFAULT_HERMES_CONNECTION,
  privacy: DEFAULT_PRIVACY_SETTINGS,
  friction: DEFAULT_FRICTION_SETTINGS,
  coachMode: DEFAULT_COACH_MODE,
  dataSharing: {
    useLocalTradeHistoryForRiskChecks: true,
    sendCompactTradeSummaryToHermes: true,
    sendRawTradeRecordsToHermes: false,
    observedWalletAddresses: []
  },
  personalRules: [],
  riskBudget: DEFAULT_RISK_BUDGET_SETTINGS,
  keepAlwaysOnTop: true,
  armed: false,
  watchClipboard: false,
  watchOCR: false,
  ocrContextMode: 'full-window',
  ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE,
  voice: DEFAULT_VOICE_SETTINGS,
  setup: DEFAULT_SETUP_SETTINGS
};

export function parseLocalSettings(rawValue: string | null): LocalSettings {
  if (!rawValue) {
    return DEFAULT_LOCAL_SETTINGS;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LocalSettings> & {
      gatewayUrl?: unknown;
    };
    const pairedWindow = parsePairedWindow(parsed.pairedWindow);

    return {
      connection: parseConnectionSettings(parsed.connection, parsed.gatewayUrl),
      privacy: parsePrivacySettings(parsed.privacy),
      friction: parseFrictionSettings(parsed.friction),
      riskBudget: parseRiskBudgetSettings(parsed.riskBudget),
      dataSharing: parseDataSharingSettings(parsed.dataSharing),
      personalRules: parsePersonalRules(parsed.personalRules),
      coachMode: parseCoachMode(parsed.coachMode),
      keepAlwaysOnTop:
        typeof parsed.keepAlwaysOnTop === 'boolean'
          ? parsed.keepAlwaysOnTop
          : DEFAULT_LOCAL_SETTINGS.keepAlwaysOnTop,
      armed: typeof parsed.armed === 'boolean' ? parsed.armed : DEFAULT_LOCAL_SETTINGS.armed,
      watchClipboard:
        typeof parsed.watchClipboard === 'boolean' ? parsed.watchClipboard : DEFAULT_LOCAL_SETTINGS.watchClipboard,
      watchOCR: typeof parsed.watchOCR === 'boolean' ? parsed.watchOCR : DEFAULT_LOCAL_SETTINGS.watchOCR,
      ocrContextMode: parseOcrContextMode(parsed.ocrContextMode),
      ocrRegionProfile: parseOcrRegionProfile(parsed.ocrRegionProfile),
      voice: parseVoiceSettings(parsed.voice),
      setup: parseSetupSettings(parsed.setup),
      ...(pairedWindow ? { pairedWindow } : {})
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
    coachMode: settings.coachMode,
    dataSharing: settings.dataSharing,
    personalRules: settings.personalRules,
    riskBudget: settings.riskBudget,
    keepAlwaysOnTop: settings.keepAlwaysOnTop,
    armed: settings.armed,
    watchClipboard: settings.watchClipboard,
    watchOCR: settings.watchOCR,
    ocrContextMode: settings.ocrContextMode,
    ocrRegionProfile: settings.ocrRegionProfile,
    voice: settings.voice,
    setup: settings.setup,
    pairedWindow: settings.pairedWindow
  });
}

export function readLocalSettings(storage: Pick<Storage, 'getItem'>): LocalSettings {
  return parseLocalSettings(storage.getItem(LOCAL_SETTINGS_KEY));
}

export function writeLocalSettings(storage: Pick<Storage, 'setItem'>, settings: LocalSettings): void {
  storage.setItem(LOCAL_SETTINGS_KEY, serializeLocalSettings(settings));
}

export function clearLocalSettings(storage: Pick<Storage, 'removeItem'>): LocalSettings {
  storage.removeItem(LOCAL_SETTINGS_KEY);
  return DEFAULT_LOCAL_SETTINGS;
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

function parseCoachMode(value: unknown): CoachMode {
  return value === 'advisory' || value === 'guardrail' || value === 'policy' ? value : DEFAULT_COACH_MODE;
}

function parseRiskBudgetSettings(rawRiskBudget: unknown): SessionBudgetSettings {
  if (!rawRiskBudget || typeof rawRiskBudget !== 'object') {
    return DEFAULT_RISK_BUDGET_SETTINGS;
  }

  const candidate = rawRiskBudget as Partial<SessionBudgetSettings>;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_RISK_BUDGET_SETTINGS.enabled,
    maxTradesPerSession: sanitizeNonNegativeInteger(
      candidate.maxTradesPerSession,
      DEFAULT_RISK_BUDGET_SETTINGS.maxTradesPerSession
    ),
    maxLossPerSessionPercent: sanitizeNonNegativeNumber(
      candidate.maxLossPerSessionPercent,
      DEFAULT_RISK_BUDGET_SETTINGS.maxLossPerSessionPercent
    ),
    cooldownMinutesAfterLoss: sanitizeNonNegativeInteger(
      candidate.cooldownMinutesAfterLoss,
      DEFAULT_RISK_BUDGET_SETTINGS.cooldownMinutesAfterLoss
    ),
    maxSizeMultiplier: sanitizeSizeMultiplier(candidate.maxSizeMultiplier),
    tiltSensitivity: parseTiltSensitivity(candidate.tiltSensitivity),
    sourceConstraints: parseSourceConstraints(candidate.sourceConstraints)
  };
}

function parseSourceConstraints(rawSourceConstraints: unknown): SourceConstraintCatalog {
  if (!rawSourceConstraints || typeof rawSourceConstraints !== 'object') {
    return DEFAULT_SOURCE_CONSTRAINTS;
  }

  const candidate = rawSourceConstraints as Record<string, unknown>;
  const next: SourceConstraintCatalog = {};
  const allCategories: SourceCategory[] = [
    'telegram',
    'discord',
    'social',
    'dex-link',
    'token-address',
    'wallet',
    'unknown'
  ];

  for (const source of allCategories) {
    const rawSetting = candidate[source];
    if (!rawSetting || typeof rawSetting !== 'object') {
      continue;
    }

    const setting = rawSetting as {
      enabled?: unknown;
      maxSizeMultiplier?: unknown;
    };

    if (typeof setting.enabled !== 'boolean' && typeof setting.maxSizeMultiplier !== 'number') {
      continue;
    }

    next[source] = {
      enabled: typeof setting.enabled === 'boolean' ? setting.enabled : false,
      maxSizeMultiplier: sanitizeSourceConstraintMultiplier(setting.maxSizeMultiplier)
    };
  }

  return next;
}

function parseDataSharingSettings(rawDataSharing: unknown): DataSharingSettings {
  if (!rawDataSharing || typeof rawDataSharing !== 'object') {
    return DEFAULT_LOCAL_SETTINGS.dataSharing;
  }

  const candidate = rawDataSharing as Partial<DataSharingSettings>;

  return {
    useLocalTradeHistoryForRiskChecks:
      typeof candidate.useLocalTradeHistoryForRiskChecks === 'boolean'
        ? candidate.useLocalTradeHistoryForRiskChecks
        : DEFAULT_LOCAL_SETTINGS.dataSharing.useLocalTradeHistoryForRiskChecks,
    sendCompactTradeSummaryToHermes:
      typeof candidate.sendCompactTradeSummaryToHermes === 'boolean'
        ? candidate.sendCompactTradeSummaryToHermes
        : DEFAULT_LOCAL_SETTINGS.dataSharing.sendCompactTradeSummaryToHermes,
    sendRawTradeRecordsToHermes:
      typeof candidate.sendRawTradeRecordsToHermes === 'boolean'
        ? candidate.sendRawTradeRecordsToHermes
        : DEFAULT_LOCAL_SETTINGS.dataSharing.sendRawTradeRecordsToHermes,
    observedWalletAddresses: Array.isArray(candidate.observedWalletAddresses)
      ? candidate.observedWalletAddresses.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean).slice(0, 12)
      : []
  };
}

function sanitizeSourceConstraintMultiplier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }

  if (value < 1) {
    return 1;
  }

  return value;
}

function parseTiltSensitivity(value: unknown): SessionBudgetSettings['tiltSensitivity'] {
  return value === 'low' || value === 'standard' || value === 'high' ? value : DEFAULT_RISK_BUDGET_SETTINGS.tiltSensitivity;
}

function parsePersonalRules(rawRules: unknown): PersonalRule[] {
  if (!Array.isArray(rawRules)) {
    return [];
  }

  return rawRules
    .map(parsePersonalRule)
    .filter((entry): entry is PersonalRule => entry !== undefined)
    .filter((entry) => entry.text.length > 0);
}

function parsePersonalRule(value: unknown): PersonalRule | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PersonalRule>;

  const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
  if (!text) {
    return undefined;
  }

  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : createRuleId();

  const now = new Date().toISOString();

  return {
    id,
    text,
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    archived: typeof candidate.archived === 'boolean' ? candidate.archived : false,
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt.trim() ? candidate.createdAt.trim() : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim() ? candidate.updatedAt.trim() : now
  };
}

function sanitizeSizeMultiplier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RISK_BUDGET_SETTINGS.maxSizeMultiplier;
  }

  if (value < 1) {
    return DEFAULT_RISK_BUDGET_SETTINGS.maxSizeMultiplier;
  }

  return Math.round(value * 100) / 100;
}

function sanitizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

function sanitizeNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
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

function createRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
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

function parseVoiceSettings(rawVoice: unknown): VoiceSettings {
  if (!rawVoice || typeof rawVoice !== 'object') {
    return DEFAULT_VOICE_SETTINGS;
  }

  const candidate = rawVoice as Partial<VoiceSettings>;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_VOICE_SETTINGS.enabled,
    hotkey: parseVoiceHotkey(candidate.hotkey),
    speakReplies: typeof candidate.speakReplies === 'boolean' ? candidate.speakReplies : DEFAULT_VOICE_SETTINGS.speakReplies
  };
}

function parseSetupSettings(rawSetup: unknown): SetupSettings {
  if (!rawSetup || typeof rawSetup !== 'object') {
    return DEFAULT_SETUP_SETTINGS;
  }

  const candidate = rawSetup as Partial<SetupSettings>;
  const completedAt = typeof candidate.completedAt === 'string' ? candidate.completedAt.trim() : '';

  return completedAt ? { completedAt } : DEFAULT_SETUP_SETTINGS;
}

function parseVoiceHotkey(value: unknown): VoiceHotkey {
  return value === 'space' || value === 'alt-space' || value === 'ctrl-space' || value === 'cmd-space'
    ? value
    : DEFAULT_VOICE_SETTINGS.hotkey;
}

function parseOcrContextMode(value: unknown): OcrContextMode {
  return value === 'full-window' || value === 'order-panel' || value === 'chart-order-panel'
    ? value
    : DEFAULT_LOCAL_SETTINGS.ocrContextMode;
}

function parseOcrRegionProfile(value: unknown): OcrRegionProfileSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_OCR_REGION_PROFILE;
  }

  const candidate = value as Partial<OcrRegionProfileSettings>;

  return {
    overlayEnabled:
      typeof candidate.overlayEnabled === 'boolean'
        ? candidate.overlayEnabled
        : DEFAULT_OCR_REGION_PROFILE.overlayEnabled,
    orderPanel: parseNormalizedRect(candidate.orderPanel, DEFAULT_OCR_REGION_PROFILE.orderPanel),
    chartZone: parseNormalizedRect(candidate.chartZone, DEFAULT_OCR_REGION_PROFILE.chartZone)
  };
}

function parseNormalizedRect(
  value: unknown,
  fallback: OcrRegionProfileSettings['orderPanel']
): OcrRegionProfileSettings['orderPanel'] {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<OcrRegionProfileSettings['orderPanel']>;
  const left = clampNormalizedNumber(candidate.left, fallback.left, 0, 1);
  const top = clampNormalizedNumber(candidate.top, fallback.top, 0, 1);
  const width = clampNormalizedNumber(candidate.width, fallback.width, 0.02, 1);
  const height = clampNormalizedNumber(candidate.height, fallback.height, 0.02, 1);

  return {
    left: Math.min(left, 1 - 0.02),
    top: Math.min(top, 1 - 0.02),
    width: Math.min(width, 1 - Math.min(left, 1 - 0.02)),
    height: Math.min(height, 1 - Math.min(top, 1 - 0.02))
  };
}

function clampNormalizedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
