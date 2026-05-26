import { describe, expect, it } from 'vitest';

import type { BetaFeedbackConsent, HermesRequestDiagnostic } from '../shared/types';
import { createRequestDiagnostic } from './requestDiagnostics';
import {
  DEFAULT_BETA_FEEDBACK_CONSENT,
  buildBetaFeedbackBundle,
  formatBetaFeedbackJson,
  formatBetaFeedbackMarkdown
} from './betaFeedback';

const CREATED_AT = '2026-05-26T04:40:00.000Z';

const BASE_DIAGNOSTIC: HermesRequestDiagnostic = createRequestDiagnostic({
  id: 'req-1',
  startedAt: '2026-05-26T04:38:00.000Z',
  completedAt: '2026-05-26T04:38:02.000Z',
  status: 'failure',
  questionPreview: 'Why did the gateway reject this?',
  selectedWindowName: 'Telegram @ Trading Room',
  selectedWindowKind: 'window',
  selectedWindowId: 'window:secret-title',
  connection: {
    connectionKind: 'custom',
    endpointMode: 'auto',
    baseUrl: 'https://coach.example/hermes?api_key=sk-secret-token',
    modelId: 'hermes-agent',
    resolvedEndpoint: 'https://coach.example/v1/chat?authorization=Bearer%20secret-token',
    resolvedAdapter: 'openai-chat'
  },
  requestContext: {
    dataSharingScope: 'advanced',
    preset: 'balanced'
  },
  request: {
    redactionEnabled: true,
    usedFallbackImage: false,
    privacySummary: {
      screenshot: 'sent',
      memoryContext: 'sent',
      monitoringContext: 'sent',
      windowTitle: 'sent',
      tradeSummary: 'withheld',
      schemaRequiresScreenshot: true,
      remoteConsentRequired: true,
      dataSharingScope: 'advanced',
      connectionKind: 'custom',
      preset: 'balanced',
      destinationOrigin: 'https://coach.example'
    }
  },
  timings: {
    localRiskMs: 8,
    ocrMs: 0,
    requestBuildMs: 10,
    captureMs: 22,
    hermesMs: 310,
    totalMs: 350
  },
  connectionStatus: 'auth-error',
  failure: {
    stage: 'hermes',
    reason: 'Authorization: Bearer secret-token rejected'
  },
  debugNotes: 'Screenshot data:image/png;base64,AAA should never leave the app'
});

function consent(overrides: Partial<BetaFeedbackConsent> = {}): BetaFeedbackConsent {
  return {
    ...DEFAULT_BETA_FEEDBACK_CONSENT,
    ...overrides
  };
}

describe('beta feedback bundle', () => {
  it('builds a sanitized local-only bundle without screenshot bytes or obvious secrets', () => {
    const bundle = buildBetaFeedbackBundle({
      createdAt: CREATED_AT,
      app: {
        name: 'DocHermes',
        version: '0.1.0',
        platform: 'darwin'
      },
      review: {
        freeformContext: 'The gateway rejected this request. Key was sk-secret and preview was data:image/png;base64,BBB.',
        severity: 'blocking'
      },
      consent: consent({ includeDiagnostics: true, includeWindowInfo: false }),
      diagnostics: [BASE_DIAGNOSTIC]
    });

    const serialized = JSON.stringify(bundle);

    expect(bundle.schemaVersion).toBe('dochermes.beta-feedback.v1');
    expect(bundle.localOnly.networkSubmission).toBe(false);
    expect(bundle.localOnly.screenshotIncluded).toBe(false);
    expect(bundle.localOnly.advisoryOnly).toBe(true);
    expect(bundle.review.freeformContext).toContain('[redacted api token]');
    expect(bundle.review.freeformContext).toContain('[redacted screenshot data url]');
    expect(bundle.diagnostics).toHaveLength(1);
    expect(bundle.diagnostics[0].window.name).toBe('withheld by feedback consent');
    expect(bundle.diagnostics[0].window.id).toBe('withheld by feedback consent');
    expect(bundle.diagnostics[0].connection?.baseUrl).toContain('***');
    expect(bundle.diagnostics[0].connection?.resolvedEndpoint).toContain('***');
    expect(bundle.diagnostics[0].failure?.reason).toBe('[redacted sensitive diagnostic detail]');
    expect(bundle.diagnostics[0].debugNotes).toBe('[redacted sensitive diagnostic detail]');
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('Telegram @ Trading Room');
  });

  it('honors consent toggles for diagnostics, connection info, timings, and privacy summary', () => {
    const bundle = buildBetaFeedbackBundle({
      createdAt: CREATED_AT,
      app: {
        name: 'DocHermes',
        version: '0.1.0',
        platform: 'darwin'
      },
      review: {
        freeformContext: 'Please look at this flow.',
        severity: 'medium'
      },
      consent: consent({
        includeDiagnostics: true,
        includeConnectionInfo: false,
        includePrivacySummary: false,
        includeTimings: false,
        includeWindowInfo: true
      }),
      diagnostics: [BASE_DIAGNOSTIC]
    });

    expect(bundle.diagnostics).toHaveLength(1);
    expect(bundle.diagnostics[0].window.name).toBe('Telegram @ Trading Room');
    expect(bundle.diagnostics[0].connection).toBeUndefined();
    expect(bundle.diagnostics[0].privacySummary).toBeUndefined();
    expect(bundle.diagnostics[0].timings).toBeUndefined();

    const noDiagnosticsBundle = buildBetaFeedbackBundle({
      createdAt: CREATED_AT,
      app: {
        name: 'DocHermes',
        version: '0.1.0',
        platform: 'darwin'
      },
      review: {
        freeformContext: 'Keep this minimal.',
        severity: 'low'
      },
      consent: consent({ includeDiagnostics: false }),
      diagnostics: [BASE_DIAGNOSTIC]
    });

    expect(noDiagnosticsBundle.diagnostics).toEqual([]);
    expect(noDiagnosticsBundle.omitted).toContain('Request diagnostics withheld by tester.');
  });

  it('exports parseable JSON and readable Markdown with local-only privacy copy', () => {
    const bundle = buildBetaFeedbackBundle({
      createdAt: CREATED_AT,
      app: {
        name: 'DocHermes',
        version: '0.1.0',
        platform: 'darwin'
      },
      review: {
        freeformContext: 'Copy flow needs a clearer success state.',
        severity: 'high'
      },
      consent: consent(),
      diagnostics: [BASE_DIAGNOSTIC]
    });

    const json = formatBetaFeedbackJson(bundle);
    const markdown = formatBetaFeedbackMarkdown(bundle);

    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 'dochermes.beta-feedback.v1',
      review: {
        severity: 'high'
      }
    });
    expect(markdown).toContain('# DocHermes beta feedback');
    expect(markdown).toContain('Network submission: no');
    expect(markdown).toContain('Screenshot bytes included: no');
    expect(markdown).toContain('Copy flow needs a clearer success state.');
    expect(markdown).toContain('## Diagnostics');
    expect(markdown).toContain('req-1');
    expect(markdown).not.toContain('data:image');
    expect(markdown).not.toContain('sk-secret');
  });
});
