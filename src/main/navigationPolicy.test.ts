import { describe, expect, it } from 'vitest';

import { createAllowedNavigationChecker } from './navigationPolicy';

describe('createAllowedNavigationChecker', () => {
  it('allows only same-origin navigation for the dev renderer URL', () => {
    const isAllowedNavigation = createAllowedNavigationChecker('http://localhost:5173/app');

    expect(isAllowedNavigation('http://localhost:5173/settings')).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/settings')).toBe(false);
    expect(isAllowedNavigation('https://example.com/phish')).toBe(false);
  });

  it('denies navigation when the configured renderer URL is invalid', () => {
    const isAllowedNavigation = createAllowedNavigationChecker('not a url');

    expect(isAllowedNavigation('http://localhost:5173/settings')).toBe(false);
    expect(isAllowedNavigation('file:///tmp/index.html')).toBe(false);
  });

  it('allows only file URLs for packaged renderer navigation', () => {
    const isAllowedNavigation = createAllowedNavigationChecker();

    expect(isAllowedNavigation('file:///opt/dochermes/out/renderer/index.html')).toBe(true);
    expect(isAllowedNavigation('https://example.com/phish')).toBe(false);
    expect(isAllowedNavigation('not a url')).toBe(false);
  });
});
