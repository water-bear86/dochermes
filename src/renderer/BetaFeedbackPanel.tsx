import type { ChangeEvent, ReactElement } from 'react';

import type { BetaFeedbackConsent, BetaFeedbackSeverity } from '../shared/types';

export type BetaFeedbackPreviewFormat = 'markdown' | 'json';

interface BetaFeedbackPanelProps {
  open: boolean;
  diagnosticsCount: number;
  consent: BetaFeedbackConsent;
  severity: BetaFeedbackSeverity;
  freeformContext: string;
  previewFormat: BetaFeedbackPreviewFormat;
  previewText: string;
  copiedFormat?: BetaFeedbackPreviewFormat;
  onToggleOpen: () => void;
  onClose: () => void;
  onConsentChange: (consent: BetaFeedbackConsent) => void;
  onSeverityChange: (severity: BetaFeedbackSeverity) => void;
  onFreeformContextChange: (value: string) => void;
  onPreviewFormatChange: (format: BetaFeedbackPreviewFormat) => void;
  onCopy: (format: BetaFeedbackPreviewFormat) => void;
}

const CONSENT_LABELS: Array<{
  key: keyof BetaFeedbackConsent;
  label: string;
  detail: string;
}> = [
  {
    key: 'includeDiagnostics',
    label: 'Include request diagnostics',
    detail: 'Recent sanitized request status and failure details.'
  },
  {
    key: 'includeConnectionInfo',
    label: 'Include connection info',
    detail: 'Gateway route, endpoint mode, and redacted URL.'
  },
  {
    key: 'includeWindowInfo',
    label: 'Include window info',
    detail: 'Selected window name and source id when privacy allows it.'
  },
  {
    key: 'includeTimings',
    label: 'Include timings',
    detail: 'Capture, request build, Hermes, and total latency.'
  },
  {
    key: 'includePrivacySummary',
    label: 'Include privacy summary',
    detail: 'What was sent, withheld, or replaced with placeholders.'
  }
];

export function BetaFeedbackPanel({
  open,
  diagnosticsCount,
  consent,
  severity,
  freeformContext,
  previewFormat,
  previewText,
  copiedFormat,
  onToggleOpen,
  onClose,
  onConsentChange,
  onSeverityChange,
  onFreeformContextChange,
  onPreviewFormatChange,
  onCopy
}: BetaFeedbackPanelProps): ReactElement {
  return (
    <>
      <section className="control-strip control-strip--multi" aria-label="Beta feedback">
        <div>
          <span className="label">Beta feedback</span>
          <strong>Local export only</strong>
          <small>
            {diagnosticsCount} diagnostic{diagnosticsCount === 1 ? '' : 's'} available - no network send, no screenshot bytes.
          </small>
        </div>
        <div className="button-row">
          <button type="button" onClick={onToggleOpen}>
            {open ? 'Hide bundle' : 'Review bundle'}
          </button>
        </div>
      </section>

      {open ? (
        <section className="message beta-feedback-panel" aria-label="Beta feedback review">
          <div className="section-heading compact">
            <div>
              <span className="label">Review before export</span>
              <h2>What gets included</h2>
              <small>No network send. No screenshot bytes.</small>
            </div>
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="beta-feedback-grid">
            <div className="beta-feedback-controls">
              <label htmlFor="beta-feedback-severity">Severity</label>
              <select
                id="beta-feedback-severity"
                value={severity}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  onSeverityChange(event.target.value as BetaFeedbackSeverity);
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="blocking">Blocking</option>
              </select>

              <label htmlFor="beta-feedback-context">Freeform context</label>
              <textarea
                id="beta-feedback-context"
                value={freeformContext}
                placeholder="What happened? What did you expect?"
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  onFreeformContextChange(event.target.value);
                }}
              />

              <div className="consent-list" aria-label="Feedback consent toggles">
                {CONSENT_LABELS.map((item) => (
                  <label className="check-row" key={item.key}>
                    <input
                      type="checkbox"
                      checked={consent[item.key]}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        onConsentChange({
                          ...consent,
                          [item.key]: event.target.checked
                        });
                      }}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="beta-feedback-preview-card">
              <div className="section-heading compact">
                <div>
                  <span className="label">Preview</span>
                  <h3>{previewFormat === 'markdown' ? 'Markdown' : 'JSON'}</h3>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className={previewFormat === 'markdown' ? 'selected' : ''}
                    onClick={() => onPreviewFormatChange('markdown')}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className={previewFormat === 'json' ? 'selected' : ''}
                    onClick={() => onPreviewFormatChange('json')}
                  >
                    JSON
                  </button>
                </div>
              </div>

              <pre className="beta-feedback-preview">{previewText}</pre>

              <div className="button-row">
                <button type="button" onClick={() => onCopy('markdown')}>
                  {copiedFormat === 'markdown' ? 'Markdown copied' : 'Copy Markdown'}
                </button>
                <button type="button" onClick={() => onCopy('json')}>
                  {copiedFormat === 'json' ? 'JSON copied' : 'Copy JSON'}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
