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

export type FrictionStrictness = 'low' | 'standard' | 'high';

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

export interface MonitoringContextPayload {
  localWarnings: string[];
  signals: JournalMonitoringSignal[];
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
  signals: JournalMonitoringSignal[];
}

export interface CoachBridgeApi {
  listWindowSources: () => Promise<WindowSourceOption[]>;
  captureWindowSource: (sourceId: string) => Promise<string>;
  validateSelectedWindow: (sourceId: string) => Promise<boolean>;
  setWatchClipboard: (enabled: boolean) => Promise<void>;
  setWatchOCR: (enabled: boolean) => Promise<void>;
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
  onMonitorSignal: (callback: (signal: MonitoringSignal) => void) => () => void;
  onMonitorStatus: (callback: (status: MonitoringStatus) => void) => () => void;
}

export interface LocalSettings {
  connection: HermesConnectionSettings;
  privacy: PrivacySettings;
  friction: FrictionSettings;
  keepAlwaysOnTop: boolean;
  armed: boolean;
  watchClipboard: boolean;
  watchOCR: boolean;
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
