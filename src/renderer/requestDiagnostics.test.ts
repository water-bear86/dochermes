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
    usedFallbackImage: false
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
      connection: {
        ...BASE_DIAGNOSTIC_INPUT.connection,
        baseUrl: 'https://chatgpt.com/backend-api/codex?token=sk-abc123&api_key=abc'
      }
    });
    const report = buildDiagnosticReport(payload);

    expect(report).toContain('Request: req-secret');
    expect(report).toContain('Gateway route/profile: hermes-agent');
    expect(report).not.toContain('Model:');
    expect(report).toContain('Redaction: on');
    expect(report).toContain('Image input: screenshot image');
    expect(report).toContain('***');
    expect(sanitizeQuestionPreview('')).toBe('[empty request]');
    expect(sanitizeQuestionPreview('buy now for 1212')).toBe('buy now for 1212');
  });
});

describe('sanitizeQuestionPreview', () => {
  it('truncates long question text while preserving start', () => {
    const preview = sanitizeQuestionPreview('a'.repeat(130));
    expect(preview).toMatch(/^a+...$/);
    expect(preview.length).toBe(120);
  });
});
