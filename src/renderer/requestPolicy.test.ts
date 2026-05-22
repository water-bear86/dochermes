import { describe, expect, it } from 'vitest';

import { canBypassRemoteConsent, shouldCaptureWindowForPrivacy } from './requestPolicy';

describe('shouldCaptureWindowForPrivacy', () => {
  it('does not capture a real window when maximum privacy is selected', () => {
    expect(shouldCaptureWindowForPrivacy({ preset: 'maximum' })).toBe(false);
  });

  it('captures a real window for balanced and full privacy presets', () => {
    expect(shouldCaptureWindowForPrivacy({ preset: 'balanced' })).toBe(true);
    expect(shouldCaptureWindowForPrivacy({ preset: 'full' })).toBe(true);
  });
});

describe('canBypassRemoteConsent', () => {
  it('only allows the explicit remote consent confirmation to bypass the prompt', () => {
    expect(canBypassRemoteConsent('remote-consent-confirmed')).toBe(true);
    expect(canBypassRemoteConsent('friction-action')).toBe(false);
    expect(canBypassRemoteConsent(undefined)).toBe(false);
  });
});
