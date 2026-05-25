import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { createRequestDiagnostic, summarizeDiagnostics } from './requestDiagnostics';
import { DiagnosticsPanel } from './DiagnosticsPanel';

const diagnostic = createRequestDiagnostic({
  id: 'request-1',
  startedAt: '2026-05-25T10:00:00.000Z',
  completedAt: '2026-05-25T10:00:01.000Z',
  status: 'success',
  questionPreview: 'Should I enter?',
  selectedWindowName: 'Trading Window',
  selectedWindowKind: 'window',
  selectedWindowId: 'window:1',
  connection: {
    connectionKind: 'local',
    endpointMode: 'openai-chat',
    baseUrl: 'http://localhost:8642',
    modelId: 'hermes-agent'
  },
  request: {
    redactionEnabled: false,
    usedFallbackImage: false
  },
  timings: {
    localRiskMs: 3,
    ocrMs: 4,
    requestBuildMs: 5,
    captureMs: 6,
    hermesMs: 700,
    totalMs: 718
  }
});

describe('DiagnosticsPanel', () => {
  it('renders the diagnostics summary and collapsed controls', () => {
    const markup = renderToStaticMarkup(
      <DiagnosticsPanel
        diagnosticSummary={summarizeDiagnostics([diagnostic])}
        requestDiagnostics={[diagnostic]}
        diagnosticsOpen={false}
        formatTiming={(value) => `${value ?? 0}ms`}
        onClearHistory={vi.fn()}
        onToggleHistory={vi.fn()}
        onCopyReport={vi.fn()}
      />
    );

    expect(markup).toContain('1 recent request');
    expect(markup).toContain('1/1 success');
    expect(markup).toContain('Show history');
    expect(markup).not.toContain('Diagnostics history');
  });

  it('renders diagnostic history rows when open', () => {
    const markup = renderToStaticMarkup(
      <DiagnosticsPanel
        diagnosticSummary={summarizeDiagnostics([diagnostic])}
        requestDiagnostics={[diagnostic]}
        diagnosticsOpen
        copiedDiagnosticId="request-1"
        formatTiming={(value) => `${value ?? 0}ms`}
        onClearHistory={vi.fn()}
        onToggleHistory={vi.fn()}
        onCopyReport={vi.fn()}
      />
    );

    expect(markup).toContain('Diagnostics history');
    expect(markup).toContain('Trading Window');
    expect(markup).toContain('local/openai-chat');
    expect(markup).toContain('Report copied');
  });
});
