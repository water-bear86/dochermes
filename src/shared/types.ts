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

export interface VoiceSettings {
  enabled: boolean;
  hotkey: VoiceHotkey;
  speakReplies: boolean;
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
  | 'unknown';

export interface MonitoringSignal {
  source: 'clipboard' | 'ocr-placeholder';
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
  errorKind?: 'timeout' | 'auth' | 'model' | 'network' | 'incompatible';
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
  source: 'clipboard' | 'ocr-placeholder';
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
  };
  timings: HermesRequestTiming;
  connectionStatus?: HermesConnectionStatus;
  failure?: HermesFailureDetail;
  debugNotes?: string;
}

export interface CoachBridgeApi {
  listWindowSources: () => Promise<WindowSourceOption[]>;
  captureWindowSource: (sourceId: string) => Promise<string>;
  validateSelectedWindow: (sourceId: string) => Promise<boolean>;
  setWatchClipboard: (enabled: boolean) => Promise<void>;
  setWatchOCR: (enabled: boolean) => Promise<void>;
  setVoiceSettings: (settings: VoiceSettings) => Promise<void>;
  askHermes: (input: AskHermesInput) => Promise<string>;
  testHermesConnection: (connection: HermesConnectionSettings) => Promise<HermesConnectionReport>;
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
  personalRules: PersonalRule[];
  keepAlwaysOnTop: boolean;
  armed: boolean;
  watchClipboard: boolean;
  watchOCR: boolean;
  voice: VoiceSettings;
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
  updatedAt?: string;
}
