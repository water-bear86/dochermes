export type WindowSourceKind = 'window' | 'screen';

export interface WindowSourceOption {
  id: string;
  name: string;
  kind: WindowSourceKind;
  thumbnailDataUrl: string;
}

export interface HermesPayload {
  question: string;
  screenshot: {
    mimeType: 'image/png';
    dataBase64: string;
  };
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
}

export interface AskHermesInput extends BuildHermesPayloadInput {
  gatewayUrl: string;
}

export interface CoachBridgeApi {
  listWindowSources: () => Promise<WindowSourceOption[]>;
  captureWindowSource: (sourceId: string) => Promise<string>;
  askHermes: (input: AskHermesInput) => Promise<string>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  appInfo: () => Promise<{
    name: string;
    platform: string;
  }>;
}

export interface LocalSettings {
  gatewayUrl: string;
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
