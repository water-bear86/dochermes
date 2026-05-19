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
  appInfo: () => Promise<{
    name: string;
    platform: string;
  }>;
}
