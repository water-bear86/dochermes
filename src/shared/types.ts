import type { TradeBehaviorStats } from './tradeStats';

export type WindowSourceKind = 'window' | 'screen';

export interface WindowSourceOption {
  id: string;
  name: string;
  kind: WindowSourceKind;
  thumbnailDataUrl: string;
}

export interface WindowSourceRef {
  id: string;
  name: string;
  kind: WindowSourceKind;
}

export type HermesConnectionKind = 'local' | 'hosted' | 'custom';
export type HermesEndpointMode = 'auto' | 'openai-chat' | 'legacy-coach' | 'custom';
export type HermesConnectionStatus = 'connected' | 'degraded' | 'disconnected' | 'auth-error' | 'model-error' | 'incompatible';
export type DataSharingScope = 'local-first' | 'hosted' | 'advanced';

export type FrictionStrictness = 'low' | 'standard' | 'high';
export type CoachMode = 'advisory' | 'guardrail' | 'policy';
export type SessionRiskPolicyLevel = 'advisory' | 'guardrail' | 'policy';
export type PersonalRulePolicyLevel = 'advisory' | 'guardrail' | 'policy';
export type VoiceHotkey = 'space' | 'alt-space' | 'ctrl-space' | 'cmd-space';
export type VoiceTranscriptionProvider = 'auto' | 'browser';
export type VoiceFallbackMode = 'typed-question' | 'none';
export type OcrContextMode = 'full-window' | 'order-panel' | 'chart-order-panel';

export interface OcrNormalizedRegionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrRegionProfileSettings {
  overlayEnabled: boolean;
  orderPanel: OcrNormalizedRegionRect;
  chartZone: OcrNormalizedRegionRect;
}

export interface VoiceSettings {
  enabled: boolean;
  hotkey: VoiceHotkey;
  transcriptionProvider: VoiceTranscriptionProvider;
  fallbackMode: VoiceFallbackMode;
  speakReplies: boolean;
}

export interface SetupSettings {
  completedAt?: string;
}

export interface PersonalRule {
  id: string;
  text: string;
  enabled: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalRuleMatch {
  ruleId: string;
  text: string;
  policyLevel: PersonalRulePolicyLevel;
  requiresPolicyOverride?: boolean;
  policyOverrideReason?: string;
  warningText: string;
  source: string;
  detail: string;
  confidence: SourceQualityConfidence;
  provenance: string;
}

export interface PersonalRuleContext {
  totalRules: number;
  activeRules: number;
  matchedRules: PersonalRuleMatch[];
}

export type ClipboardCandidateKind =
  | 'evm-address'
  | 'evm-tx-hash'
  | 'sol-address'
  | 'dex-url'
  | 'wallet-address'
  | 'token-address'
  | 'pair-address'
  | 'pair'
  | 'chain'
  | 'order-side'
  | 'order-direction'
  | 'order-size'
  | 'leverage'
  | 'order-type'
  | 'route'
  | 'source'
  | 'liquidity'
  | 'volume'
  | 'unknown';

export interface MonitoringSignal {
  source: 'clipboard' | 'ocr-placeholder' | 'ocr';
  kind: ClipboardCandidateKind;
  value: string;
  maskedValue: string;
  confidence: 'high' | 'medium' | 'low';
  detectedAt: string;
  message?: string;
}

export interface MonitoringStatus {
  source: 'ocr';
  status: 'active' | 'inactive' | 'not-configured';
  message: string;
}

export type PrivacyPreset = 'maximum' | 'balanced' | 'full';

export interface PrivacyRedactionSettings {
  redactAddresses: boolean;
  redactBalances: boolean;
  redactUsernames: boolean;
  redactAmounts: boolean;
}

export interface PrivacySettings {
  preset: PrivacyPreset;
  redaction: PrivacyRedactionSettings;
}

export interface FrictionSettings {
  enabled: boolean;
  strictness: FrictionStrictness;
}

export interface SourceConstraintSetting {
  enabled: boolean;
  maxSizeMultiplier: number;
}

export type SourceConstraintCatalog = Partial<Record<SourceCategory, SourceConstraintSetting>>;

export type TiltSensitivity = 'low' | 'standard' | 'high';

export interface SessionBudgetSettings {
  enabled: boolean;
  maxTradesPerSession: number;
  maxLossPerSessionPercent: number;
  cooldownMinutesAfterLoss: number;
  maxSizeMultiplier: number;
  tiltSensitivity: TiltSensitivity;
  sourceConstraints: SourceConstraintCatalog;
}

export interface DataSharingSettings {
  useLocalTradeHistoryForRiskChecks: boolean;
  sendCompactTradeSummaryToHermes: boolean;
  sendRawTradeRecordsToHermes: boolean;
  observedWalletAddresses: string[];
}

export interface RememberedRemoteConsentGrant {
  destinationOrigin: string;
  connectionKind: HermesConnectionKind;
  endpointMode: HermesEndpointMode;
  dataSharingScope: DataSharingScope;
  payloadClasses: string[];
  localOnlyClasses: string[];
  approvedAt: string;
}

export interface RemoteConsentSettings {
  rememberApprovedDestinations: boolean;
  grants: RememberedRemoteConsentGrant[];
}

export interface MonitoringContextPayload {
  localWarnings: string[];
  warningEvidence?: WarningEvidenceSummary[];
  signals: JournalMonitoringSignal[];
  sourceQuality?: SourceQualityFinding[];
}

export interface HermesConnectionSettings {
  connectionKind: HermesConnectionKind;
  endpointMode: HermesEndpointMode;
  baseUrl: string;
  modelId: string;
  bearerToken: string;
}

export interface HermesPayload {
  question: string;
  screenshot: {
    mimeType: 'image/png';
    dataBase64: string;
  };
  memoryContext?: MemoryContext;
  monitoringContext?: MonitoringContextPayload;
  selectedWindow: {
    id: string;
    name: string;
    kind: WindowSourceKind;
  };
  constraints: {
    executionCapability: false;
    platformAgnostic: true;
    captureRequiresUserSelection: true;
  };
}

export interface BuildHermesPayloadInput {
  question: string;
  screenshotDataUrl: string;
  selectedWindow: WindowSourceOption;
  memoryContext?: MemoryContext;
  monitoringContext?: MonitoringContextPayload;
  privacy?: PrivacySettings;
}

export interface AskHermesInput extends BuildHermesPayloadInput {
  connection: HermesConnectionSettings;
}

export interface ProbeAttempt {
  url: string;
  method: 'GET' | 'POST';
  ok: boolean;
  status: number;
  label: string;
  detail: string;
  errorKind?: 'timeout' | 'auth' | 'model' | 'network' | 'incompatible' | 'invalid-json' | 'unexpected-shape';
}

export interface HermesConnectionReport {
  status: HermesConnectionStatus;
  activeAdapter?: HermesEndpointMode;
  effectiveConnection?: HermesConnectionSettings;
  resolvedEndpoint?: string;
  textCapable: boolean;
  imageCapable: boolean;
  models: string[];
  attempts: ProbeAttempt[];
  summary: string;
  debugReport: string;
}

export interface JournalMonitoringSignal {
  source: 'clipboard' | 'ocr-placeholder' | 'ocr';
  kind: ClipboardCandidateKind;
  maskedValue: string;
  confidence: 'high' | 'medium' | 'low';
  detectedAt: string;
  message?: string;
}

export interface JournalMonitoringMetadata {
  localWarnings: string[];
  warningEvidence?: WarningEvidenceSummary[];
  signals: JournalMonitoringSignal[];
  sourceQuality?: SourceQualityFinding[];
}

export interface WarningEvidenceSummary {
  warningText: string;
  source: string;
  detail: string;
  confidence: SourceQualityConfidence;
  provenance?: string;
  detectedAt?: string;
}

export type WarningEvidenceEntry = Omit<WarningEvidenceSummary, 'warningText'>;

export interface WarningCard {
  text: string;
  evidences: WarningEvidenceEntry[];
}

export interface PolicyCard {
  id: string;
  question: string;
  warnings: string[];
  blockers: string[];
}

export type SourceCategory =
  | 'telegram'
  | 'discord'
  | 'social'
  | 'dex-link'
  | 'token-address'
  | 'wallet'
  | 'unknown';

export type SourceQualityOutcome = 'good' | 'neutral' | 'bad' | 'unknown';
export type SourceQualityConfidence = 'low' | 'medium' | 'high';

export interface SourceQualityFinding {
  category: SourceCategory;
  confidence: SourceQualityConfidence;
  provenance: string;
  tokenHint?: string;
  reason: string;
  detectedAt?: string;
}

export interface JournalSourceProfile {
  category: SourceCategory;
  outcome: SourceQualityOutcome;
  tokenHint?: string;
}

export interface HermesRequestTiming {
  localRiskMs?: number;
  ocrMs?: number;
  requestBuildMs?: number;
  captureMs?: number;
  hermesMs?: number;
  totalMs?: number;
}

export interface HermesFailureDetail {
  stage?: 'validation' | 'local-analysis' | 'capture' | 'request-build' | 'hermes' | 'total';
  reason?: string;
}

export type HermesRequestPrivacyDisposition = 'sent' | 'withheld' | 'placeholder' | 'not-provided';

export interface HermesRequestPrivacySummary {
  screenshot: HermesRequestPrivacyDisposition;
  memoryContext: HermesRequestPrivacyDisposition;
  monitoringContext: HermesRequestPrivacyDisposition;
  windowTitle: HermesRequestPrivacyDisposition;
  tradeSummary: HermesRequestPrivacyDisposition;
  schemaRequiresScreenshot: boolean;
  remoteConsentRequired: boolean;
  dataSharingScope: DataSharingScope;
  connectionKind: HermesConnectionKind;
  preset: PrivacyPreset;
  destinationOrigin: string;
}

export interface HermesRequestDiagnostic {
  id: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure';
  questionPreview: string;
  selectedWindowName: string;
  selectedWindowKind: WindowSourceKind;
  selectedWindowId: string;
  connection: {
    connectionKind: HermesConnectionKind;
    endpointMode: HermesEndpointMode;
    baseUrl: string;
    modelId: string;
    resolvedEndpoint?: string;
    resolvedAdapter?: HermesEndpointMode;
  };
  requestContext?: {
    dataSharingScope: DataSharingScope;
    preset: PrivacyPreset;
  };
  request: {
    redactionEnabled: boolean;
    usedFallbackImage: boolean;
    privacySummary?: HermesRequestPrivacySummary;
  };
  timings: HermesRequestTiming;
  connectionStatus?: HermesConnectionStatus;
  failure?: HermesFailureDetail;
  debugNotes?: string;
}

export type BetaFeedbackSeverity = 'low' | 'medium' | 'high' | 'blocking';

export interface BetaFeedbackConsent {
  includeDiagnostics: boolean;
  includeConnectionInfo: boolean;
  includeWindowInfo: boolean;
  includeTimings: boolean;
  includePrivacySummary: boolean;
}

export interface BetaFeedbackReview {
  freeformContext: string;
  severity: BetaFeedbackSeverity;
}

export interface BetaFeedbackAppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface BetaFeedbackDiagnosticEntry {
  id: string;
  startedAt: string;
  completedAt: string;
  status: HermesRequestDiagnostic['status'];
  questionPreview: string;
  window: {
    kind: WindowSourceKind;
    name: string;
    id: string;
  };
  request: {
    redactionEnabled: boolean;
    usedFallbackImage: boolean;
  };
  requestContext?: HermesRequestDiagnostic['requestContext'];
  connectionStatus?: HermesConnectionStatus;
  connection?: HermesRequestDiagnostic['connection'];
  privacySummary?: HermesRequestPrivacySummary;
  timings?: HermesRequestTiming;
  failure?: HermesFailureDetail;
  debugNotes?: string;
}

export interface BetaFeedbackBundle {
  schemaVersion: 'dochermes.beta-feedback.v1';
  createdAt: string;
  app: BetaFeedbackAppInfo;
  review: BetaFeedbackReview;
  consent: BetaFeedbackConsent;
  localOnly: {
    networkSubmission: false;
    screenshotIncluded: false;
    advisoryOnly: true;
  };
  diagnostics: BetaFeedbackDiagnosticEntry[];
  omitted: string[];
}

export interface HostedHermesTokenSaveInput {
  token: string;
}

export type HostedHermesTokenStatusReason =
  | 'safe-storage-unavailable'
  | 'not-found'
  | 'corrupt-token-store';

export interface HostedHermesTokenStatus {
  available: boolean;
  hasToken: boolean;
  updatedAt?: string;
  reason?: HostedHermesTokenStatusReason;
}

export interface CoachBridgeApi {
  listWindowSources: () => Promise<WindowSourceOption[]>;
  captureWindowSource: (sourceId: string) => Promise<string>;
  validateSelectedWindow: (sourceId: string) => Promise<boolean>;
  setWatchClipboard: (enabled: boolean) => Promise<void>;
  setWatchOCR: (enabled: boolean) => Promise<void>;
  setMonitorSource: (sourceId?: string) => Promise<void>;
  setOcrContextMode: (mode: OcrContextMode) => Promise<void>;
  recalibrateOCR: () => Promise<void>;
  setOcrRegionProfile: (profile: OcrRegionProfileSettings) => Promise<void>;
  setVoiceSettings: (settings: VoiceSettings) => Promise<void>;
  askHermes: (input: AskHermesInput) => Promise<string>;
  testHermesConnection: (connection: HermesConnectionSettings) => Promise<HermesConnectionReport>;
  saveHostedHermesToken: (input: HostedHermesTokenSaveInput) => Promise<HostedHermesTokenStatus>;
  getHostedHermesTokenStatus: () => Promise<HostedHermesTokenStatus>;
  clearHostedHermesToken: () => Promise<HostedHermesTokenStatus>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setArmedMode: (enabled: boolean) => Promise<void>;
  appInfo: () => Promise<{
    name: string;
    platform: string;
  }>;
  onOpenWindowPicker: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  onArmCoach: (callback: (enabled: boolean) => void) => () => void;
  onVoiceHotkey: (callback: () => void) => () => void;
  onMonitorSignal: (callback: (signal: MonitoringSignal) => void) => () => void;
  onMonitorStatus: (callback: (status: MonitoringStatus) => void) => () => void;
}

export interface LocalSettings {
  connection: HermesConnectionSettings;
  privacy: PrivacySettings;
  friction: FrictionSettings;
  coachMode: CoachMode;
  riskBudget: SessionBudgetSettings;
  dataSharing: DataSharingSettings;
  remoteConsent: RemoteConsentSettings;
  personalRules: PersonalRule[];
  keepAlwaysOnTop: boolean;
  armed: boolean;
  watchClipboard: boolean;
  watchOCR: boolean;
  ocrContextMode: OcrContextMode;
  ocrRegionProfile: OcrRegionProfileSettings;
  voice: VoiceSettings;
  setup: SetupSettings;
  pairedWindow?: WindowSourceRef;
}

export interface JournalEntry {
  id: string;
  createdAt: string;
  question: string;
  response: string;
  notes: string;
  selectedWindow: {
    id: string;
    name: string;
    kind: WindowSourceKind;
  };
  screenshot: {
    captured: boolean;
    imageStored: false;
  };
  monitoring?: JournalMonitoringMetadata;
  sourceContext?: JournalSourceProfile;
}

export interface MemoryPattern {
  name: string;
  evidenceCount: number;
  summary: string;
  recommendation: string;
}

export interface MemoryPostmortemSummary {
  id: string;
  generatedAt: string;
  sessionId: string;
  sessionLabel: string;
  compactSummary: string;
  eventCount: number;
  taggedEventCount: number;
  tagCounts: {
    'good-skip': number;
    'bad-entry': number;
    'ignored-warning': number;
    'followed-plan': number;
    'note-for-next-time': number;
  };
  notableRisks: string[];
}

export interface TradeHistorySignal {
  unit: string;
  medianSize: number;
  maxSize: number;
  sampleCount: number;
}

export interface TradeRecord {
  id: string;
  createdAt: string;
  source: 'journal' | 'csv' | 'wallet';
  size?: {
    value: number;
    unit: string;
  };
  lossPercent?: number;
  tokenHint?: string;
}

export interface TradeHistorySummary {
  totalTrades: number;
  importedTrades: number;
  walletTrades: number;
  tradesLastHour: number;
  tradesLastDay: number;
  recentLossStreak: number;
  sizeSignals: TradeHistorySignal[];
}

export interface MemoryContext {
  matchedPatterns: MemoryPattern[];
  tradeBehaviorStats?: TradeBehaviorStats;
  recentNotes: Array<{
    createdAt: string;
    question: string;
    response: string;
    notes: string;
    selectedWindowName: string;
  }>;
  tradeHistorySummary?: TradeHistorySummary;
  postmortemSummaries?: MemoryPostmortemSummary[];
  personalRules?: PersonalRuleContext;
}

export type WarningFeedbackAction = 'took-it-anyway' | 'skipped' | 'followed-plan' | 'added-note' | 'false-positive';

export interface WarningFeedbackRecord {
  id: string;
  createdAt: string;
  requestId?: string;
  warningText: string;
  action: WarningFeedbackAction;
  question: string;
  response: string;
  selectedWindowName: string;
  selectedWindowId: string;
  selectedWindowKind: WindowSourceKind;
  notes?: string;
  policyOverride?: {
    required: true;
    blockers: string[];
    overrideNote: string;
    auditSource: 'policy-card';
  };
  updatedAt?: string;
}
