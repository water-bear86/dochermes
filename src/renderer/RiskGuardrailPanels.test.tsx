import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  FrictionCardPanel,
  LocalGuardrailPanel,
  PolicyGuardrailPanel,
  SessionRiskStatusPanel
} from './RiskGuardrailPanels';

describe('RiskGuardrailPanels', () => {
  it('renders the session risk status summary', () => {
    const markup = renderToStaticMarkup(
      <SessionRiskStatusPanel
        statusClass="session-risk-status--high"
        tradeText="4 / 6"
        lossText="1.2 SOL / 2 SOL"
        cooldownText="12 min left"
        tiltSensitivity="high"
        candidateSize="0.5 SOL"
        medianSize="0.08 SOL"
        signalSummary="Candidate size is above recent median."
      />
    );

    expect(markup).toContain('Session risk status');
    expect(markup).toContain('4 / 6');
    expect(markup).toContain('12 min left');
    expect(markup).toContain('Candidate size: 0.5 SOL');
    expect(markup).toContain('Session median: 0.08 SOL');
  });

  it('renders the policy block card with audit copy and disabled override state', () => {
    const markup = renderToStaticMarkup(
      <PolicyGuardrailPanel
        policyCard={{
          id: 'policy-1',
          question: 'Should I buy now?',
          blockers: ['Daily loss limit reached'],
          warnings: ['Low liquidity exposure']
        }}
        policyBlockUi={{
          title: 'Policy mode block',
          summary: 'Policy mode paused this request.',
          boundary: 'DocHermes cannot route, sign, execute, or enforce trades in your wallet.',
          blockerHeading: 'Policy conditions requiring override',
          contextHeading: 'Context used for the block',
          noteLabel: 'Override note (required)',
          notePlaceholder: 'State why this policy override is acceptable right now.',
          noteHint: 'Write a short override reason before sending is enabled.',
          auditLabel: 'Local audit trail',
          auditDetail: 'The override note and blocked conditions will be saved locally.',
          canOverride: false
        }}
        policyNoteText=""
        onPolicyNoteChange={vi.fn()}
        onOverride={vi.fn()}
        onBlock={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(markup).toContain('Policy mode block');
    expect(markup).toContain('Daily loss limit reached');
    expect(markup).toContain('Low liquidity exposure');
    expect(markup).toContain('Local audit trail');
    expect(markup).toContain('disabled=""');
  });

  it('renders pre-trade friction prompts and note controls', () => {
    const markup = renderToStaticMarkup(
      <FrictionCardPanel
        frictionCard={{
          id: 'friction-1',
          question: 'Should I buy this momentum trade right now?',
          warnings: ['Similar early entries lost money before.'],
          prompts: ['What confirms you are wrong before entering?']
        }}
        frictionNoteText="Need volume expansion."
        onFrictionNoteChange={vi.fn()}
        onHavePlan={vi.fn()}
        onSkipTrade={vi.fn()}
        onAskHermes={vi.fn()}
        onDismiss={vi.fn()}
        onSaveNote={vi.fn()}
        onClearNote={vi.fn()}
      />
    );

    expect(markup).toContain('Pre-trade friction card');
    expect(markup).toContain('High-risk context: Should I buy this momentum trade right now?');
    expect(markup).toContain('Similar early entries lost money before.');
    expect(markup).toContain('What confirms you are wrong before entering?');
    expect(markup).toContain('Save note');
  });

  it('renders local guardrail evidence with uncertainty labeling', () => {
    const markup = renderToStaticMarkup(
      <LocalGuardrailPanel
        localWarningCards={[
          {
            text: 'This resembles prior early entries that performed poorly.',
            evidences: [
              {
                source: 'journal',
                detail: 'Immediate entries averaged -22%.',
                confidence: 'low',
                provenance: 'local notes',
                detectedAt: '2026-05-25T10:00:00.000Z'
              }
            ]
          }
        ]}
        onFeedback={vi.fn()}
        onAddNote={vi.fn()}
      />
    );

    expect(markup).toContain('Local guardrail');
    expect(markup).toContain('This resembles prior early entries that performed poorly.');
    expect(markup).toContain('Confidence: low');
    expect(markup).toContain('(uncertain)');
    expect(markup).toContain('Provenance: local notes');
    expect(markup).toContain('Mark false positive');
  });
});
