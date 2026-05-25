import type { ReactElement } from 'react';

import type { HermesRequestDiagnostic } from '../shared/types';
import type { HermesRequestAverages } from './requestDiagnostics';

interface DiagnosticsPanelProps {
  diagnosticSummary: HermesRequestAverages;
  requestDiagnostics: HermesRequestDiagnostic[];
  diagnosticsOpen: boolean;
  copiedDiagnosticId?: string;
  formatTiming: (value?: number) => string;
  onClearHistory: () => void;
  onToggleHistory: () => void;
  onCopyReport: (diagnostic: HermesRequestDiagnostic) => void;
}

export function DiagnosticsPanel({
  diagnosticSummary,
  requestDiagnostics,
  diagnosticsOpen,
  copiedDiagnosticId,
  formatTiming,
  onClearHistory,
  onToggleHistory,
  onCopyReport
}: DiagnosticsPanelProps): ReactElement {
  return (
    <>
      <section className="control-strip control-strip--multi" aria-label="Request diagnostics">
        <div>
          <span className="label">Request diagnostics</span>
          <strong>
            {diagnosticSummary.count} recent request{diagnosticSummary.count === 1 ? '' : 's'} ·{' '}
            {diagnosticSummary.successCount}/{diagnosticSummary.count} success
          </strong>
          {diagnosticSummary.count > 0 ? (
            <small>
              Avg latency (success): {formatTiming(diagnosticSummary.avgLocalRiskMs)} risk checks ·{' '}
              {formatTiming(diagnosticSummary.avgOcrMs)} OCR · {formatTiming(diagnosticSummary.avgRequestBuildMs)} request build ·{' '}
              {formatTiming(diagnosticSummary.avgCaptureMs)} capture · {formatTiming(diagnosticSummary.avgHermesMs)} Hermes ·{' '}
              {formatTiming(diagnosticSummary.avgTotalMs)} total
            </small>
          ) : null}
        </div>
        <div className="button-row">
          <button type="button" onClick={onClearHistory} disabled={requestDiagnostics.length === 0}>
            Clear history
          </button>
          <button type="button" onClick={onToggleHistory}>
            {diagnosticsOpen ? 'Hide history' : 'Show history'}
          </button>
        </div>
      </section>

      {diagnosticsOpen ? (
        <section className="message diagnostics" aria-label="Diagnostics history">
          <div className="section-heading compact">
            <h2>Diagnostics history</h2>
          </div>
          {requestDiagnostics.length > 0 ? (
            <ol className="diagnostic-history">
              {requestDiagnostics.slice(0, 8).map((diagnostic) => (
                <li key={diagnostic.id} className={`diagnostic-item ${diagnostic.status}`}>
                  <div className="diagnostic-item-row">
                    <strong>{diagnostic.status.toUpperCase()}</strong>
                    <span>{diagnostic.selectedWindowName}</span>
                    <small>
                      {diagnostic.connection.connectionKind}/{diagnostic.connection.endpointMode}
                    </small>
                    <button
                      type="button"
                      onClick={() => {
                        onCopyReport(diagnostic);
                      }}
                    >
                      {copiedDiagnosticId === diagnostic.id ? 'Report copied' : 'Copy report'}
                    </button>
                  </div>
                  <div className="diagnostic-metrics">
                    <small>
                      Risk {formatTiming(diagnostic.timings.localRiskMs)} · OCR {formatTiming(diagnostic.timings.ocrMs)} · Build{' '}
                      {formatTiming(diagnostic.timings.requestBuildMs)} · Capture {formatTiming(diagnostic.timings.captureMs)} · Hermes{' '}
                      {formatTiming(diagnostic.timings.hermesMs)} · Total {formatTiming(diagnostic.timings.totalMs)}
                    </small>
                  </div>
                  {diagnostic.failure ? (
                    <small>
                      Failure: {diagnostic.failure.stage ?? 'unknown'} — {diagnostic.failure.reason ?? 'no detail'}
                    </small>
                  ) : null}
                  {diagnostic.debugNotes ? <small>Note: {diagnostic.debugNotes}</small> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="diagnostics-empty">No diagnostics recorded yet.</p>
          )}
        </section>
      ) : null}
    </>
  );
}
