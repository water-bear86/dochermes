import type { VoiceHotkey, VoiceSettings } from '../shared/types';

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: VoiceRecognitionEventLike) => void) | null;
  onerror: ((event: VoiceRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export interface SpeechRecognitionGlobalLike {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

export type SpeechRecognitionSupport =
  | {
      supported: true;
      constructor: SpeechRecognitionConstructor;
      vendor: 'standard' | 'webkit';
    }
  | {
      supported: false;
      constructor?: undefined;
      vendor?: undefined;
    };

export interface VoiceRecognitionResultLike {
  0?: {
    transcript?: string;
  };
}

export type VoiceTranscriptionPlan =
  | {
      kind: 'disabled';
      label: string;
      message: string;
    }
  | {
      kind: 'browser';
      label: string;
      constructor: SpeechRecognitionConstructor;
      vendor: 'standard' | 'webkit';
      message: string;
    }
  | {
      kind: 'typed-fallback';
      label: string;
      message: string;
    }
  | {
      kind: 'unavailable';
      label: string;
      message: string;
    };

export interface VoiceRecognitionResultListLike {
  length: number;
  [index: number]: VoiceRecognitionResultLike | undefined;
}

export interface VoiceRecognitionEventLike {
  results: VoiceRecognitionResultListLike;
}

export interface VoiceRecognitionErrorLike {
  error: string;
}

export function getSpeechRecognitionSupport(scope: SpeechRecognitionGlobalLike): SpeechRecognitionSupport {
  if (typeof scope.SpeechRecognition === 'function') {
    return {
      supported: true,
      constructor: scope.SpeechRecognition as SpeechRecognitionConstructor,
      vendor: 'standard'
    };
  }

  if (typeof scope.webkitSpeechRecognition === 'function') {
    return {
      supported: true,
      constructor: scope.webkitSpeechRecognition as SpeechRecognitionConstructor,
      vendor: 'webkit'
    };
  }

  return {
    supported: false,
    constructor: undefined,
    vendor: undefined
  };
}

export function getVoiceHotkeyLabel(hotkey: VoiceHotkey): string {
  switch (hotkey) {
    case 'space':
      return 'Space';
    case 'alt-space':
      return 'Alt/Option Space';
    case 'ctrl-space':
      return 'Control Space';
    case 'cmd-space':
      return 'Command/Ctrl Space';
  }
}

export function getVoiceHotkeyPlatformNote(hotkey: VoiceHotkey, platform: string): string {
  if (hotkey === 'space') {
    return 'Bare Space can conflict with the active trading window; verify it manually on this OS.';
  }

  if (hotkey === 'alt-space' && platform === 'win32') {
    return 'Alt Space can conflict with the Windows system menu; Control Space is usually safer.';
  }

  if (hotkey === 'cmd-space' && platform === 'darwin') {
    return 'Command Space can conflict with Spotlight unless the OS shortcut is changed.';
  }

  if (platform === 'linux') {
    return 'Linux global shortcuts can vary by desktop session, especially under Wayland.';
  }

  return 'Verify this shortcut once in the packaged desktop add-on before relying on it live.';
}

export function getVoiceTranscriptionProviderLabel(voice: Pick<VoiceSettings, 'transcriptionProvider'>): string {
  switch (voice.transcriptionProvider) {
    case 'browser':
      return 'Browser speech only';
    case 'auto':
      return 'Auto';
  }
}

export function resolveVoiceTranscriptionPlan(
  voice: Pick<VoiceSettings, 'enabled' | 'transcriptionProvider' | 'fallbackMode'>,
  support: SpeechRecognitionSupport
): VoiceTranscriptionPlan {
  if (!voice.enabled) {
    return {
      kind: 'disabled',
      label: 'Voice off',
      message: 'Push-to-talk is off.'
    };
  }

  if (support.supported) {
    return {
      kind: 'browser',
      label: support.vendor === 'webkit' ? 'Browser speech (webkit)' : 'Browser speech',
      constructor: support.constructor,
      vendor: support.vendor,
      message: 'Voice uses browser or OS speech recognition, then sends the transcript through the same Hermes path as typed asks.'
    };
  }

  if (voice.fallbackMode === 'typed-question' && voice.transcriptionProvider === 'auto') {
    return {
      kind: 'typed-fallback',
      label: 'Typed fallback',
      message: 'Speech recognition is unavailable in this build, so DocHermes will keep you on the typed question path.'
    };
  }

  return {
    kind: 'unavailable',
    label: 'Speech unavailable',
    message: 'Push-to-talk is unavailable because this build does not expose browser speech recognition.'
  };
}

export function normalizeVoiceTranscript(resultsOrEvent: VoiceRecognitionResultListLike | VoiceRecognitionEventLike): string {
  const results = 'results' in resultsOrEvent ? resultsOrEvent.results : resultsOrEvent;
  const transcripts: string[] = [];

  for (let index = 0; index < results.length; index += 1) {
    const transcript = results[index]?.[0]?.transcript;
    if (typeof transcript === 'string') {
      transcripts.push(transcript.trim());
    }
  }

  return transcripts.join(' ').trim().replace(/\s+/g, ' ');
}

export function mapSpeechRecognitionError(error: string): string {
  switch (error) {
    case 'not-allowed':
      return 'Microphone access is blocked. Allow microphone access and try again.';
    case 'no-speech':
      return 'No clear speech captured. Try again.';
    case 'network':
      return 'Speech recognition lost network access. Try again.';
    case 'audio-capture':
      return 'No microphone was detected. Connect one and try again.';
    case 'aborted':
      return 'Voice capture stopped.';
    case 'language-not-supported':
      return 'Speech recognition does not support the selected language.';
    case 'service-not-allowed':
      return 'Speech recognition is not allowed in this browser context.';
    default:
      return `Push-to-talk error: ${error}`;
  }
}

export function canSpeakVoiceReply(voice: Pick<VoiceSettings, 'speakReplies'>, speechSynthesis: unknown): boolean {
  return voice.speakReplies && speechSynthesis != null;
}
