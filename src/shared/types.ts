export type WindowSourceKind = 'window' | 'screen';

export interface WindowSourceOption {
  id: string;
  name: string;
  kind: WindowSourceKind;
  thumbnailDataUrl: string;
}

export type HermesConnectionKind = 'local' | 'hosted' | 'custom';
export type HermesEndpointMode = 'auto' | 'openai-chat' | 'legacy-coach' | 'custom';
export type HermesConnectionStatus = 'connected' | 'degraded' | 'disconnected' | 'auth-error' | 'model-error' | 'incompatible';

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

export interface CoachBridgeApi {
  listWindowSources: () => Promise<WindowSourceOption[]>;
  captureWindowSource: (sourceId: string) => Promise<string>;
  askHermes: (input: AskHermesInput) => Promise<string>;
  testHermesConnection: (connection: HermesConnectionSettings) => Promise<HermesConnectionReport>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  appInfo: () => Promise<{
    name: string;
    platform: string;
  }>;
}

export interface LocalSettings {
  connection: HermesConnectionSettings;
  keepAlwaysOnTop: boolean;
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
}

export interface MemoryPattern {
  name: string;
  evidenceCount: number;
  summary: string;
  recommendation: string;
}

export interface MemoryContext {
  matchedPatterns: MemoryPattern[];
  recentNotes: Array<{
    createdAt: string;
    question: string;
    response: string;
    notes: string;
    selectedWindowName: string;
  }>;
}
