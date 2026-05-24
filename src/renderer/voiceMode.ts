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
      return 'Option Space';
    case 'ctrl-space':
      return 'Control Space';
    case 'cmd-space':
      return 'Command Space';
  }
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
