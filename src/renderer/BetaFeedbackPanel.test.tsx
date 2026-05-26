import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DEFAULT_BETA_FEEDBACK_CONSENT } from './betaFeedback';
import { BetaFeedbackPanel } from './BetaFeedbackPanel';

describe('BetaFeedbackPanel', () => {
  it('renders a compact local-only entry point when closed', () => {
    const markup = renderToStaticMarkup(
      <BetaFeedbackPanel
        open={false}
        diagnosticsCount={2}
        consent={DEFAULT_BETA_FEEDBACK_CONSENT}
        severity="medium"
        freeformContext=""
        previewFormat="markdown"
        previewText="# Preview"
        onToggleOpen={vi.fn()}
        onClose={vi.fn()}
        onConsentChange={vi.fn()}
        onSeverityChange={vi.fn()}
        onFreeformContextChange={vi.fn()}
        onPreviewFormatChange={vi.fn()}
        onCopy={vi.fn()}
      />
    );

    expect(markup).toContain('Beta feedback');
    expect(markup).toContain('Local export only');
    expect(markup).toContain('2 diagnostics available');
    expect(markup).toContain('Review bundle');
    expect(markup).not.toContain('What gets included');
  });

  it('renders review controls, consent toggles, and preview when open', () => {
    const markup = renderToStaticMarkup(
      <BetaFeedbackPanel
        open
        diagnosticsCount={1}
        consent={{
          ...DEFAULT_BETA_FEEDBACK_CONSENT,
          includeDiagnostics: false,
          includeWindowInfo: false
        }}
        severity="high"
        freeformContext="Copy button did not show success."
        previewFormat="markdown"
        previewText="# DocHermes beta feedback\nNetwork submission: no"
        copiedFormat="markdown"
        onToggleOpen={vi.fn()}
        onClose={vi.fn()}
        onConsentChange={vi.fn()}
        onSeverityChange={vi.fn()}
        onFreeformContextChange={vi.fn()}
        onPreviewFormatChange={vi.fn()}
        onCopy={vi.fn()}
      />
    );

    expect(markup).toContain('What gets included');
    expect(markup).toContain('No network send. No screenshot bytes.');
    expect(markup).toContain('Include request diagnostics');
    expect(markup).toContain('Include window info');
    expect(markup).toContain('Copy button did not show success.');
    expect(markup).toContain('# DocHermes beta feedback');
    expect(markup).toContain('Markdown copied');
    expect(markup).toContain('Copy JSON');
    expect(markup).toContain('Close');
  });
});
