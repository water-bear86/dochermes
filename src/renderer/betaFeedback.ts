import type {
  BetaFeedbackAppInfo,
  BetaFeedbackBundle,
  BetaFeedbackConsent,
  BetaFeedbackDiagnosticEntry,
  BetaFeedbackReview,
  HermesRequestDiagnostic
} from '../shared/types';

export const DEFAULT_BETA_FEEDBACK_CONSENT: BetaFeedbackConsent = {
  includeDiagnostics: true,
  includeConnectionInfo: true,
  includeWindowInfo: true,
  includeTimings: true,
  includePrivacySummary: true
};

export interface BuildBetaFeedbackBundleInput {
  createdAt?: string;
  app: BetaFeedbackAppInfo;
  review: BetaFeedbackReview;
  consent?: Partial<BetaFeedbackConsent>;
  diagnostics: HermesRequestDiagnostic[];
}

export function buildBetaFeedbackBundle(input: Readonly<BuildBetaFeedbackBundleInput>): BetaFeedbackBundle {
  const consent = {
    ...DEFAULT_BETA_FEEDBACK_CONSENT,
    ...input.consent
  };
  const omitted: string[] = [];

  const diagnostics = consent.includeDiagnostics
    ? input.diagnostics.slice(0, 8).map((diagnostic) => sanitizeDiagnostic(diagnostic, consent, omitted))
    : [];

  if (!consent.includeDiagnostics && input.diagnostics.length > 0) {
    omitted.push('Request diagnostics withheld by tester.');
  }

  return {
    schemaVersion: 'dochermes.beta-feedback.v1',
    createdAt: input.createdAt ?? new Date().toISOString(),
    app: {
      name: sanitizePlainText(input.app.name),
      version: sanitizePlainText(input.app.version),
      platform: sanitizePlainText(input.app.platform)
    },
    review: {
      freeformContext: sanitizeUserText(input.review.freeformContext),
      severity: input.review.severity
    },
    consent,
    localOnly: {
      networkSubmission: false,
      screenshotIncluded: false,
      advisoryOnly: true
    },
    diagnostics,
    omitted: Array.from(new Set(omitted))
  };
}

export function formatBetaFeedbackJson(bundle: BetaFeedbackBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function formatBetaFeedbackMarkdown(bundle: BetaFeedbackBundle): string {
  const lines = [
    '# DocHermes beta feedback',
    '',
    `Created: ${bundle.createdAt}`,
    `Severity: ${bundle.review.severity}`,
    `App: ${bundle.app.name} ${bundle.app.version} (${bundle.app.platform})`,
    '',
    '## Local-only boundary',
    '',
    `Network submission: ${bundle.localOnly.networkSubmission ? 'yes' : 'no'}`,
    `Screenshot bytes included: ${bundle.localOnly.screenshotIncluded ? 'yes' : 'no'}`,
    `Advisory-only product boundary: ${bundle.localOnly.advisoryOnly ? 'yes' : 'no'}`,
    '',
    '## Tester context',
    '',
    bundle.review.freeformContext || '_No additional context provided._',
    '',
    '## Consent',
    '',
    `Diagnostics: ${bundle.consent.includeDiagnostics ? 'included' : 'withheld'}`,
    `Connection info: ${bundle.consent.includeConnectionInfo ? 'included' : 'withheld'}`,
    `Window info: ${bundle.consent.includeWindowInfo ? 'included' : 'withheld'}`,
    `Timings: ${bundle.consent.includeTimings ? 'included' : 'withheld'}`,
    `Privacy summary: ${bundle.consent.includePrivacySummary ? 'included' : 'withheld'}`
  ];

  if (bundle.omitted.length > 0) {
    lines.push('', '## Omitted', '', ...bundle.omitted.map((item) => `- ${item}`));
  }

  lines.push('', '## Diagnostics', '');

  if (bundle.diagnostics.length === 0) {
    lines.push('_No diagnostics included._');
  } else {
    for (const diagnostic of bundle.diagnostics) {
      lines.push(`### ${diagnostic.id}`);
      lines.push(`- Status: ${diagnostic.status}`);
      lines.push(`- Started: ${diagnostic.startedAt}`);
      lines.push(`- Finished: ${diagnostic.completedAt}`);
      lines.push(`- Question: ${diagnostic.questionPreview}`);
      lines.push(`- Window: ${diagnostic.window.name} (${diagnostic.window.kind})`);
      lines.push(`- Image input: ${diagnostic.request.usedFallbackImage ? 'placeholder' : 'screenshot used in request, not exported'}`);

      if (diagnostic.connection) {
        lines.push(`- Connection: ${diagnostic.connection.connectionKind}/${diagnostic.connection.endpointMode}`);
        lines.push(`- Gateway route/profile: ${diagnostic.connection.modelId}`);
        lines.push(`- Base: ${diagnostic.connection.baseUrl}`);
        if (diagnostic.connection.resolvedEndpoint) {
          lines.push(`- Resolved endpoint: ${diagnostic.connection.resolvedEndpoint}`);
        }
      }

      if (diagnostic.privacySummary) {
        lines.push(`- Privacy preset: ${diagnostic.privacySummary.preset}`);
        lines.push(`- Screenshot disposition: ${diagnostic.privacySummary.screenshot}`);
        lines.push(`- Memory context: ${diagnostic.privacySummary.memoryContext}`);
        lines.push(`- Monitoring context: ${diagnostic.privacySummary.monitoringContext}`);
        lines.push(`- Window title: ${diagnostic.privacySummary.windowTitle}`);
      }

      if (diagnostic.timings) {
        lines.push(`- Total: ${diagnostic.timings.totalMs ?? 0}ms`);
        lines.push(`- Hermes: ${diagnostic.timings.hermesMs ?? 0}ms`);
        lines.push(`- Capture: ${diagnostic.timings.captureMs ?? 0}ms`);
      }

      if (diagnostic.failure?.stage || diagnostic.failure?.reason) {
        lines.push(`- Failure stage: ${diagnostic.failure.stage ?? 'unknown'}`);
        lines.push(`- Failure detail: ${diagnostic.failure.reason ?? 'none'}`);
      }

      if (diagnostic.debugNotes) {
        lines.push(`- Notes: ${diagnostic.debugNotes}`);
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

function sanitizeDiagnostic(
  diagnostic: HermesRequestDiagnostic,
  consent: BetaFeedbackConsent,
  omitted: string[]
): BetaFeedbackDiagnosticEntry {
  if (!consent.includeConnectionInfo) {
    omitted.push('Connection info withheld by tester.');
  }
  if (!consent.includeWindowInfo) {
    omitted.push('Window info withheld by tester.');
  }
  if (!consent.includeTimings) {
    omitted.push('Request timings withheld by tester.');
  }
  if (!consent.includePrivacySummary) {
    omitted.push('Privacy summary withheld by tester.');
  }

  return {
    id: sanitizePlainText(diagnostic.id),
    startedAt: sanitizePlainText(diagnostic.startedAt),
    completedAt: sanitizePlainText(diagnostic.completedAt),
    status: diagnostic.status,
    questionPreview: sanitizePlainText(diagnostic.questionPreview),
    window: {
      kind: diagnostic.selectedWindowKind,
      name: consent.includeWindowInfo ? sanitizePlainText(diagnostic.selectedWindowName) : 'withheld by feedback consent',
      id: consent.includeWindowInfo ? sanitizePlainText(diagnostic.selectedWindowId) : 'withheld by feedback consent'
    },
    request: {
      redactionEnabled: diagnostic.request.redactionEnabled,
      usedFallbackImage: diagnostic.request.usedFallbackImage
    },
    ...(diagnostic.requestContext ? { requestContext: { ...diagnostic.requestContext } } : {}),
    ...(diagnostic.connectionStatus ? { connectionStatus: diagnostic.connectionStatus } : {}),
    ...(consent.includeConnectionInfo
      ? {
          connection: {
            connectionKind: diagnostic.connection.connectionKind,
            endpointMode: diagnostic.connection.endpointMode,
            baseUrl: sanitizeUrl(diagnostic.connection.baseUrl),
            modelId: sanitizePlainText(diagnostic.connection.modelId),
            ...(diagnostic.connection.resolvedEndpoint
              ? { resolvedEndpoint: sanitizeUrl(diagnostic.connection.resolvedEndpoint) }
              : {}),
            ...(diagnostic.connection.resolvedAdapter ? { resolvedAdapter: diagnostic.connection.resolvedAdapter } : {})
          }
        }
      : {}),
    ...(consent.includePrivacySummary && diagnostic.request.privacySummary
      ? { privacySummary: { ...diagnostic.request.privacySummary, destinationOrigin: sanitizeUrl(diagnostic.request.privacySummary.destinationOrigin) } }
      : {}),
    ...(consent.includeTimings ? { timings: { ...diagnostic.timings } } : {}),
    ...(diagnostic.failure
      ? {
          failure: {
            ...diagnostic.failure,
            ...(diagnostic.failure.reason ? { reason: sanitizeDiagnosticDetail(diagnostic.failure.reason) } : {})
          }
        }
      : {}),
    ...(diagnostic.debugNotes ? { debugNotes: sanitizeDiagnosticDetail(diagnostic.debugNotes) } : {})
  };
}

function sanitizeUrl(value: string): string {
  const sanitized = sanitizePlainText(value);
  try {
    const parsed = new URL(sanitized);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = parsed.password ? '***' : '';
    }
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, '***');
      }
    }
    return parsed.toString();
  } catch {
    return sanitized;
  }
}

function sanitizePlainText(value: string): string {
  return redactApiTokens(redactScreenshotDataUrls(value)).trim();
}

function sanitizeUserText(value: string): string {
  return sanitizePlainText(value).slice(0, 4000);
}

function sanitizeDiagnosticDetail(value: string): string {
  if (containsSensitiveDiagnosticDetail(value)) {
    return '[redacted sensitive diagnostic detail]';
  }

  return sanitizePlainText(value);
}

function containsSensitiveDiagnosticDetail(value: string): boolean {
  return /data:image\/[a-z0-9.+-]+;base64,/i.test(value) || /\b(authorization|bearer|access[_-]?token|api[_-]?key|token|secret)\b/i.test(value);
}

function redactScreenshotDataUrls(value: string): string {
  return value.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[redacted screenshot data url]');
}

function redactApiTokens(value: string): string {
  return value
    .replace(/\bsk-(?:or-)?[a-z0-9_-]+\b/gi, '[redacted api token]')
    .replace(/\bBearer\s+[a-z0-9._-]+\b/gi, 'Bearer [redacted]');
}

function isSensitiveKey(key: string): boolean {
  return /^(access_token|authorization|api_key|token|key|auth|bearer)$/i.test(key);
}
