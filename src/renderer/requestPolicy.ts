import type { PrivacyPreset } from '../shared/types';

export type RemoteConsentBypassReason = 'remote-consent-confirmed' | 'friction-action';

export function shouldCaptureWindowForPrivacy(privacy: { preset: PrivacyPreset }): boolean {
  return privacy.preset !== 'maximum';
}

export function canBypassRemoteConsent(reason: RemoteConsentBypassReason | undefined): boolean {
  return reason === 'remote-consent-confirmed';
}
