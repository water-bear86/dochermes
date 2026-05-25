import { describe, expect, it } from 'vitest';

import type { VoiceSettings } from '../shared/types';
import {
  canSpeakVoiceReply,
  getVoiceHotkeyPlatformNote,
  getVoiceTranscriptionProviderLabel,
  getVoiceHotkeyLabel,
  getSpeechRecognitionSupport,
  mapSpeechRecognitionError,
  normalizeVoiceTranscript,
  resolveVoiceTranscriptionPlan
} from './voiceMode';

describe('voiceMode', () => {
  describe('getSpeechRecognitionSupport', () => {
    it('uses the standard SpeechRecognition constructor when it is available', () => {
      class StandardRecognition {}
      class WebkitRecognition {}

      expect(
        getSpeechRecognitionSupport({
          SpeechRecognition: StandardRecognition,
          webkitSpeechRecognition: WebkitRecognition
        }).constructor
      ).toBe(StandardRecognition);
    });

    it('falls back to the webkit SpeechRecognition constructor when standard support is missing', () => {
      class WebkitRecognition {}

      expect(
        getSpeechRecognitionSupport({
          webkitSpeechRecognition: WebkitRecognition
        }).constructor
      ).toBe(WebkitRecognition);
    });

    it('reports unsupported recognition when no constructor is available', () => {
      expect(getSpeechRecognitionSupport({}).supported).toBe(false);
    });
  });

  it('formats push-to-talk hotkey labels', () => {
    expect(getVoiceHotkeyLabel('space')).toBe('Space');
    expect(getVoiceHotkeyLabel('alt-space')).toBe('Alt/Option Space');
    expect(getVoiceHotkeyLabel('ctrl-space')).toBe('Control Space');
    expect(getVoiceHotkeyLabel('cmd-space')).toBe('Command/Ctrl Space');
  });

  it('describes cross-platform hotkey conflicts for manual QA', () => {
    expect(getVoiceHotkeyPlatformNote('space', 'darwin')).toContain('active trading window');
    expect(getVoiceHotkeyPlatformNote('alt-space', 'win32')).toContain('Windows system menu');
    expect(getVoiceHotkeyPlatformNote('cmd-space', 'darwin')).toContain('Spotlight');
    expect(getVoiceHotkeyPlatformNote('ctrl-space', 'linux')).toContain('Wayland');
  });

  it('labels transcription provider choices without exposing model providers', () => {
    expect(getVoiceTranscriptionProviderLabel({ transcriptionProvider: 'auto' })).toBe('Auto');
    expect(getVoiceTranscriptionProviderLabel({ transcriptionProvider: 'browser' })).toBe('Browser speech only');
  });

  it('selects browser transcription when speech recognition is available', () => {
    class StandardRecognition {}

    const plan = resolveVoiceTranscriptionPlan(
      {
        enabled: true,
        transcriptionProvider: 'auto',
        fallbackMode: 'typed-question'
      },
      getSpeechRecognitionSupport({
        SpeechRecognition: StandardRecognition
      })
    );

    expect(plan.kind).toBe('browser');
    expect(plan.label).toBe('Browser speech');
  });

  it('falls back to the typed question path in auto mode when speech recognition is unavailable', () => {
    const plan = resolveVoiceTranscriptionPlan(
      {
        enabled: true,
        transcriptionProvider: 'auto',
        fallbackMode: 'typed-question'
      },
      getSpeechRecognitionSupport({})
    );

    expect(plan).toEqual({
      kind: 'typed-fallback',
      label: 'Typed fallback',
      message: 'Speech recognition is unavailable in this build, so DocHermes will keep you on the typed question path.'
    });
  });

  it('does not silently fall back when browser-only transcription is selected', () => {
    const plan = resolveVoiceTranscriptionPlan(
      {
        enabled: true,
        transcriptionProvider: 'browser',
        fallbackMode: 'typed-question'
      },
      getSpeechRecognitionSupport({})
    );

    expect(plan.kind).toBe('unavailable');
  });

  it('trims and joins final speech recognition transcripts', () => {
    expect(
      normalizeVoiceTranscript({
        length: 3,
        0: [{ transcript: '  should I hold ' }],
        1: [{ transcript: ' or trim ' }],
        2: [{ transcript: ' now?  ' }]
      })
    ).toBe('should I hold or trim now?');
  });

  it('returns an empty transcript when speech recognition captures no words', () => {
    expect(
      normalizeVoiceTranscript({
        length: 2,
        0: [{ transcript: '   ' }],
        1: [{ transcript: '' }]
      })
    ).toBe('');
  });

  it('maps speech recognition errors to user-facing messages', () => {
    expect(mapSpeechRecognitionError('not-allowed')).toBe('Microphone access is blocked. Allow microphone access and try again.');
    expect(mapSpeechRecognitionError('no-speech')).toBe('No clear speech captured. Try again.');
    expect(mapSpeechRecognitionError('network')).toBe('Speech recognition lost network access. Try again.');
    expect(mapSpeechRecognitionError('audio-capture')).toBe('No microphone was detected. Connect one and try again.');
    expect(mapSpeechRecognitionError('aborted')).toBe('Voice capture stopped.');
    expect(mapSpeechRecognitionError('language-not-supported')).toBe(
      'Speech recognition does not support the selected language.'
    );
    expect(mapSpeechRecognitionError('service-not-allowed')).toBe(
      'Speech recognition is not allowed in this browser context.'
    );
    expect(mapSpeechRecognitionError('unexpected-code')).toBe('Push-to-talk error: unexpected-code');
  });

  it('allows spoken replies only when enabled and speech synthesis exists', () => {
    const voice: VoiceSettings = {
      enabled: true,
      hotkey: 'space',
      transcriptionProvider: 'auto',
      fallbackMode: 'typed-question',
      speakReplies: true
    };

    expect(canSpeakVoiceReply(voice, {})).toBe(true);
    expect(canSpeakVoiceReply({ ...voice, speakReplies: false }, {})).toBe(false);
    expect(canSpeakVoiceReply(voice, undefined)).toBe(false);
  });
});
