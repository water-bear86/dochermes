import { describe, expect, it } from 'vitest';

import type { HermesRequestDiagnostic, HermesRequestTiming } from '../shared/types';
import {
  appendRequestDiagnostic,
  buildDiagnosticReport,
  createRequestDiagnostic,
  readRequestDiagnostics,
  sanitizeQuestionPreview,
  summarizeDiagnostics
} from './requestDiagnostics';

const BASE_DIAGNOSTIC_INPUT = {
  id: 'req-1',
  startedAt: '2026-05-20T00:00:00.000Z',
  completedAt: '2026-05-20T00:00:00.200Z',
  status: 'success' as const,
  questionPreview: 'Should I buy this token?',
  selectedWindowName: 'Trading Terminal',
  selectedWindowKind: 'window' as const,
  selectedWindowId: 'window:1',
  connection: {
    connectionKind: 'local' as const,
    endpointMode: 'auto' as const,
    baseUrl: 'http://localhost:8642',
    modelId: 'hermes-agent'
  },
  request: {
    redactionEnabled: true,
    usedFallbackImage: false,
    privacySummary: {
      screenshot: 'sent' as const,
      memoryContext: 'sent' as const,
      monitoringContext: 'sent' as const,
      windowTitle: 'sent' as const,
      tradeSummary: 'sent' as const,
      schemaRequiresScreenshot: true,
      remoteConsentRequired: false,
      dataSharingScope: 'local-first' as const,
      connectionKind: 'local' as const,
      preset: 'balanced' as const,
      destinationOrigin: 'http://localhost:8642'
    }
  },
  timings: {
    localRiskMs: 12,
    ocrMs: 4,
    requestBuildMs: 18,
    captureMs: 34,
    hermesMs: 50,
    totalMs: 118
  } as HermesRequestTiming
};

function createStorage(initial: string): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } {
  const values = new Map<string, string>([['hermes.requestDiagnostics.v1', initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe('request diagnostics persistence', () => {
  it('drops malformed storage payloads and returns empty diagnostics', () => {
    const storage = createStorage('not-json');
    expect(readRequestDiagnostics(storage)).toEqual([]);

    const storageWithNoise = createStorage('{"foo":"bar"}');
    expect(readRequestDiagnostics(storageWithNoise)).toEqual([]);
  });

  it('builds a diagnostic with timing summaries and caps history size', () => {
    const storage = createStorage('[]');
    const first = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT
    });
    const second = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT,
      id: 'req-2',
      completedAt: '2026-05-20T00:00:01.000Z',
      timings: {
        localRiskMs: 4,
        ocrMs: 10,
        requestBuildMs: 16,
        captureMs: 30,
        hermesMs: 60,
        totalMs: 120
      } as HermesRequestTiming
    });

    const listAfterFirst = appendRequestDiagnostic(storage, first, 1);
    const listAfterSecond = appendRequestDiagnostic(storage, second, 1);
    const stored = readRequestDiagnostics(storage);

    expect(listAfterFirst).toHaveLength(1);
    expect(listAfterSecond).toHaveLength(1);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('req-2');
  });

  it('summarizes successful request latency with failures and readout safety', () => {
    const storage = createStorage('[]');
    const success: HermesRequestDiagnostic = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT,
      id: 'req-success'
    });
    const failed: HermesRequestDiagnostic = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT,
      id: 'req-fail',
      status: 'failure',
      timings: {
        localRiskMs: 20,
        ocrMs: 6,
        requestBuildMs: 10,
        captureMs: 5,
        hermesMs: 30,
        totalMs: 61
      } as HermesRequestTiming
    });

    appendRequestDiagnostic(storage, success);
    appendRequestDiagnostic(storage, failed);
    const summary = summarizeDiagnostics(readRequestDiagnostics(storage));

    expect(summary.count).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.failureCount).toBe(1);
    expect(summary.avgTotalMs).toBe(118);
    expect(summary.avgLocalRiskMs).toBe(12);
    expect(summary.avgOcrMs).toBe(4);
  });

  it('keeps OCR average undefined when no successful OCR timings are recorded', () => {
    const storage = createStorage('[]');
    const successNoOcr: HermesRequestDiagnostic = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT,
      id: 'req-no-ocr',
      timings: {
        localRiskMs: 2,
        requestBuildMs: 5,
        captureMs: 7,
        hermesMs: 10,
        totalMs: 24
      } as HermesRequestTiming
    });

    appendRequestDiagnostic(storage, successNoOcr);
    const summary = summarizeDiagnostics(readRequestDiagnostics(storage));

    expect(summary.avgOcrMs).toBeUndefined();
  });
});

describe('diagnostic reporting', () => {
  it('redacts sensitive values and truncates question previews', () => {
    const payload = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT,
      id: 'req-secret',
      selectedWindowId: 'window:private-account',
      connection: {
        ...BASE_DIAGNOSTIC_INPUT.connection,
        connectionKind: 'hosted',
        endpointMode: 'openai-chat',
        baseUrl: 'https://chatgpt.com/backend-api/codex?token=sk-abc123&api_key=abc',
        resolvedEndpoint: 'https://api.openai.com/v1/responses?authorization=Bearer%20secret'
      },
      request: {
        ...BASE_DIAGNOSTIC_INPUT.request,
        privacySummary: {
          screenshot: 'placeholder',
          memoryContext: 'withheld',
          monitoringContext: 'withheld',
          windowTitle: 'withheld',
          tradeSummary: 'withheld',
          schemaRequiresScreenshot: true,
          remoteConsentRequired: true,
          dataSharingScope: 'hosted',
          connectionKind: 'hosted',
          preset: 'maximum',
          destinationOrigin: 'https://chatgpt.com'
        }
      }
    });
    const report = buildDiagnosticReport(payload);

    expect(report).toContain('Request: req-secret');
    expect(report).toContain('Gateway route/profile: hermes-agent');
    expect(report).not.toContain('Model:');
    expect(report).toContain('Redaction: on');
    expect(report).toContain('Image input: placeholder');
    expect(report).toContain('Remote consent: required');
    expect(report).toContain('Screenshot: placeholder');
    expect(report).toContain('Memory context: withheld');
    expect(report).toContain('Monitoring context: withheld');
    expect(report).toContain('Window title: withheld');
    expect(report).toContain('Trade summary: withheld');
    expect(report).toContain('***');
    expect(report).not.toContain('Trading Terminal');
    expect(payload.selectedWindowName).toBe('Window title withheld');
    expect(payload.selectedWindowId).toBe('Window id withheld');
    expect(payload.connection.baseUrl).not.toContain('sk-abc123');
    expect(payload.connection.resolvedEndpoint).not.toContain('Bearer%20secret');
    expect(report).not.toContain('sk-abc123');
    expect(report).not.toContain('Bearer%20secret');
    expect(sanitizeQuestionPreview('')).toBe('[empty request]');
    expect(sanitizeQuestionPreview('buy now for 1212')).toBe('buy now for 1212');
  });

  it('reports sent versus withheld privacy context without leaking raw diagnostic values', () => {
    const payload = createRequestDiagnostic({
      ...BASE_DIAGNOSTIC_INPUT,
      selectedWindowName: 'Private Trading Terminal',
      connection: {
        ...BASE_DIAGNOSTIC_INPUT.connection,
        connectionKind: 'custom',
        endpointMode: 'custom',
        baseUrl: 'https://coach.example/hermes?token=secret-token'
      },
      requestContext: {
        dataSharingScope: 'advanced',
        preset: 'balanced'
      },
      request: {
        ...BASE_DIAGNOSTIC_INPUT.request,
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
      debugNotes: 'Request failed with Authorization: Bearer secret-token'
    });

    const report = buildDiagnosticReport(payload);

    expect(report).toContain('Remote consent: required');
    expect(report).toContain('Screenshot: sent');
    expect(report).toContain('Memory context: sent');
    expect(report).toContain('Monitoring context: sent');
    expect(report).toContain('Window title: sent');
    expect(report).toContain('Trade summary: withheld');
    expect(report).toContain('Schema screenshot: required');
    expect(report).not.toContain('secret-token');
    expect(report).not.toContain('Authorization');
  });
});

describe('sanitizeQuestionPreview', () => {
  it('truncates long question text while preserving start', () => {
    const preview = sanitizeQuestionPreview('a'.repeat(130));
    expect(preview).toMatch(/^a+...$/);
    expect(preview.length).toBe(120);
  });
});
