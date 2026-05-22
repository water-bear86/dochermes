import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL, MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER } from '../shared/privacy';
import type { AskHermesInput, PrivacyPreset } from '../shared/types';

export type RemoteConsentBypassReason = 'remote-consent-confirmed' | 'friction-action';

export function shouldCaptureWindowForPrivacy(privacy: { preset: PrivacyPreset }): boolean {
  return privacy.preset !== 'maximum';
}

export function buildPrivacyAwareAskHermesInput(input: AskHermesInput): AskHermesInput {
  if (input.privacy?.preset !== 'maximum') {
    return input;
  }

  const { memoryContext: _memoryContext, monitoringContext: _monitoringContext, ...request } = input;

  return {
    ...request,
    screenshotDataUrl: MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL,
    selectedWindow: MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER
  };
}

export function canBypassRemoteConsent(reason: RemoteConsentBypassReason | undefined): boolean {
  return reason === 'remote-consent-confirmed';
}
