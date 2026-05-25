import { MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL, MAX_PRIVACY_SELECTED_WINDOW_PLACEHOLDER } from '../shared/privacy';
import type {
  AskHermesInput,
  DataSharingScope,
  HermesConnectionSettings,
  HermesRequestPrivacyDisposition,
  HermesRequestPrivacySummary,
  PrivacyPreset,
  RememberedRemoteConsentGrant,
  RemoteConsentSettings
} from '../shared/types';

export type RemoteConsentBypassReason = 'remote-consent-confirmed' | 'friction-action';

export interface RemoteConsentMetadata {
  destinationOrigin: string;
  connectionKind: HermesConnectionSettings['connectionKind'];
  endpointMode: HermesConnectionSettings['endpointMode'];
  dataSharingScope: DataSharingScope;
  payloadClasses: string[];
  localOnlyClasses: string[];
  requiresRemoteConsent: boolean;
}

const DEFAULT_REMEMBERED_CONSENT_LIMIT = 20;

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

export function buildRememberedRemoteConsentGrant(
  metadata: RemoteConsentMetadata,
  approvedAt: string
): RememberedRemoteConsentGrant {
  return {
    destinationOrigin: originFromBaseUrl(metadata.destinationOrigin),
    connectionKind: metadata.connectionKind,
    endpointMode: metadata.endpointMode,
    dataSharingScope: metadata.dataSharingScope,
    payloadClasses: normalizeClassList(metadata.payloadClasses),
    localOnlyClasses: normalizeClassList(metadata.localOnlyClasses),
    approvedAt
  };
}

export function canUseRememberedRemoteConsent(
  metadata: RemoteConsentMetadata,
  settings: RemoteConsentSettings
): boolean {
  if (!metadata.requiresRemoteConsent || !settings.rememberApprovedDestinations) {
    return false;
  }

  const candidate = buildRememberedRemoteConsentGrant(metadata, 'candidate');

  return settings.grants.some((grant) => equivalentRememberedConsentGrant(grant, candidate));
}

export function appendRememberedRemoteConsentGrant(
  settings: RemoteConsentSettings,
  metadata: RemoteConsentMetadata,
  approvedAt: string,
  limit = DEFAULT_REMEMBERED_CONSENT_LIMIT
): RemoteConsentSettings {
  if (!metadata.requiresRemoteConsent) {
    return {
      ...settings,
      rememberApprovedDestinations: true
    };
  }

  const grant = buildRememberedRemoteConsentGrant(metadata, approvedAt);
  const nextGrants = [
    grant,
    ...settings.grants.filter((entry) => !equivalentRememberedConsentGrant(entry, grant))
  ].slice(0, Math.max(1, limit));

  return {
    rememberApprovedDestinations: true,
    grants: nextGrants
  };
}

export function requiresRemoteConsent(connection: HermesConnectionSettings): boolean {
  return inferDataSharingScope(connection).requiresRemoteConsent;
}

export function buildRemoteConsentMetadata(input: AskHermesInput): RemoteConsentMetadata {
  const profile = inferDataSharingScope(input.connection);
  const summary = summarizePrivacyRequestPolicy(input);
  const payloadClasses = ['Question text'];
  const localOnlyClasses: string[] = [];

  addClass(payloadClasses, summary.screenshot, 'Screenshot image', 'Placeholder screenshot');
  addWithheldClass(localOnlyClasses, summary.screenshot, 'Real screenshot');
  addClass(payloadClasses, summary.windowTitle, 'Selected window metadata', 'Placeholder window metadata');
  addWithheldClass(localOnlyClasses, summary.windowTitle, 'Window title');
  addClass(payloadClasses, summary.memoryContext, 'Compact memory context', 'Memory context');
  addWithheldClass(localOnlyClasses, summary.memoryContext, 'Compact memory context');
  addClass(payloadClasses, summary.monitoringContext, 'Monitoring summary', 'Monitoring summary');
  addWithheldClass(localOnlyClasses, summary.monitoringContext, 'Monitoring summary');
  addClass(payloadClasses, summary.tradeSummary, 'Compact trade summary', 'Trade summary');
  addWithheldClass(localOnlyClasses, summary.tradeSummary, 'Compact trade summary');

  return {
    destinationOrigin: originFromBaseUrl(input.connection.baseUrl),
    connectionKind: input.connection.connectionKind,
    endpointMode: input.connection.endpointMode,
    dataSharingScope: profile.scope,
    payloadClasses,
    localOnlyClasses,
    requiresRemoteConsent: profile.requiresRemoteConsent
  };
}

export function summarizePrivacyRequestPolicy(input: AskHermesInput): HermesRequestPrivacySummary {
  const preset = input.privacy?.preset ?? 'balanced';
  const profile = inferDataSharingScope(input.connection);
  const hasMemoryContext = input.memoryContext !== undefined && hasMemoryContent(input.memoryContext);
  const hasMonitoringContext =
    (input.monitoringContext?.localWarnings.length ?? 0) > 0 ||
    (input.monitoringContext?.warningEvidence?.length ?? 0) > 0 ||
    (input.monitoringContext?.signals.length ?? 0) > 0 ||
    (input.monitoringContext?.sourceQuality?.length ?? 0) > 0;
  const hasTradeSummary =
    input.memoryContext?.tradeHistorySummary !== undefined || input.memoryContext?.tradeBehaviorStats !== undefined;

  if (preset === 'maximum') {
    return {
      screenshot: 'placeholder',
      memoryContext: hasMemoryContext ? 'withheld' : 'not-provided',
      monitoringContext: hasMonitoringContext ? 'withheld' : 'not-provided',
      windowTitle: input.selectedWindow.name ? 'withheld' : 'not-provided',
      tradeSummary: hasTradeSummary ? 'withheld' : 'not-provided',
      schemaRequiresScreenshot: true,
      remoteConsentRequired: profile.requiresRemoteConsent,
      dataSharingScope: profile.scope,
      connectionKind: input.connection.connectionKind,
      preset,
      destinationOrigin: originFromBaseUrl(input.connection.baseUrl)
    };
  }

  return {
    screenshot: input.screenshotDataUrl ? 'sent' : 'not-provided',
    memoryContext: hasMemoryContext ? 'sent' : 'not-provided',
    monitoringContext: hasMonitoringContext ? 'sent' : 'not-provided',
    windowTitle: input.selectedWindow.name ? 'sent' : 'not-provided',
    tradeSummary: hasTradeSummary ? 'sent' : 'not-provided',
    schemaRequiresScreenshot: true,
    remoteConsentRequired: profile.requiresRemoteConsent,
    dataSharingScope: profile.scope,
    connectionKind: input.connection.connectionKind,
    preset,
    destinationOrigin: originFromBaseUrl(input.connection.baseUrl)
  };
}

function inferDataSharingScope(connection: HermesConnectionSettings): { scope: DataSharingScope; requiresRemoteConsent: boolean } {
  const isLocal = isLoopbackEndpoint(connection.baseUrl);

  if (connection.connectionKind === 'hosted') {
    return { scope: 'hosted', requiresRemoteConsent: true };
  }

  if (isLocal) {
    return { scope: 'local-first', requiresRemoteConsent: false };
  }

  return { scope: 'advanced', requiresRemoteConsent: true };
}

function isLoopbackEndpoint(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  } catch {
    return false;
  }
}

function originFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return 'unconfigured endpoint';
  }
}

function hasMemoryContent(memoryContext: NonNullable<AskHermesInput['memoryContext']>): boolean {
  return (
    memoryContext.matchedPatterns.length > 0 ||
    memoryContext.recentNotes.length > 0 ||
    (memoryContext.postmortemSummaries?.length ?? 0) > 0 ||
    memoryContext.tradeHistorySummary !== undefined ||
    memoryContext.tradeBehaviorStats !== undefined ||
    (memoryContext.personalRules?.matchedRules.length ?? 0) > 0
  );
}

function addClass(
  list: string[],
  disposition: HermesRequestPrivacyDisposition,
  sentLabel: string,
  placeholderLabel: string
): void {
  if (disposition === 'sent') {
    list.push(sentLabel);
  }
  if (disposition === 'placeholder') {
    list.push(placeholderLabel);
  }
}

function addWithheldClass(list: string[], disposition: HermesRequestPrivacyDisposition, label: string): void {
  if (disposition === 'withheld' || disposition === 'placeholder') {
    list.push(label);
  }
}

function equivalentRememberedConsentGrant(
  left: RememberedRemoteConsentGrant,
  right: RememberedRemoteConsentGrant
): boolean {
  return (
    left.destinationOrigin === right.destinationOrigin &&
    left.connectionKind === right.connectionKind &&
    left.endpointMode === right.endpointMode &&
    left.dataSharingScope === right.dataSharingScope &&
    sameStringList(left.payloadClasses, right.payloadClasses) &&
    sameStringList(left.localOnlyClasses, right.localOnlyClasses)
  );
}

function sameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function normalizeClassList(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}
