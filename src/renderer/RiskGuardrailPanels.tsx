import type { ReactElement } from 'react';

import type { PolicyCard, SourceQualityConfidence, WarningCard } from '../shared/types';
import type { FrictionCard } from './frictionCards';
import type { PolicyBlockUiCopy } from './policyBlockUi';
import type { WarningFeedbackAction } from './warningFeedback';

interface SessionRiskStatusPanelProps {
  statusClass: string;
  tradeText: string;
  lossText: string;
  cooldownText: string;
  tiltSensitivity: string;
  candidateSize?: string;
  medianSize?: string;
  signalSummary: string;
}

interface PolicyGuardrailPanelProps {
  policyCard?: PolicyCard;
  policyBlockUi?: PolicyBlockUiCopy;
  policyNoteText: string;
  onPolicyNoteChange: (value: string) => void;
  onOverride: () => void;
  onBlock: () => void;
  onDismiss: () => void;
}

interface FrictionCardPanelProps {
  frictionCard?: FrictionCard;
  frictionNoteText: string;
  onFrictionNoteChange: (value: string) => void;
  onHavePlan: () => void;
  onSkipTrade: () => void;
  onAskHermes: () => void;
  onDismiss: () => void;
  onSaveNote: () => void;
  onClearNote: () => void;
}

interface LocalGuardrailPanelProps {
  localWarningCards: WarningCard[];
  onFeedback: (warningText: string, action: WarningFeedbackAction) => void;
  onAddNote: (warningText: string) => void;
}

export function SessionRiskStatusPanel({
  statusClass,
  tradeText,
  lossText,
  cooldownText,
  tiltSensitivity,
  candidateSize,
  medianSize,
  signalSummary
}: SessionRiskStatusPanelProps): ReactElement {
  return (
    <section className={`message session-risk-status ${statusClass}`} aria-label="Session risk budget status">
      <span className="label">Session risk status</span>
      <div className="session-risk-grid">
        <div>
          <strong>Trades today</strong>
          <p>{tradeText}</p>
        </div>
        <div>
          <strong>Loss usage</strong>
          <p>{lossText}</p>
        </div>
        <div>
          <strong>Cooldown</strong>
          <p>{cooldownText}</p>
        </div>
        <div>
          <strong>Tilt sensitivity</strong>
          <p>{tiltSensitivity}</p>
        </div>
      </div>
      {candidateSize ? (
        <p className="session-risk-note">
          Candidate size: {candidateSize} · Session median: {medianSize ?? 'unknown'}
        </p>
      ) : null}
      <small className="session-risk-note">{signalSummary}</small>
    </section>
  );
}

export function PolicyGuardrailPanel({
  policyCard,
  policyBlockUi,
  policyNoteText,
  onPolicyNoteChange,
  onOverride,
  onBlock,
  onDismiss
}: PolicyGuardrailPanelProps): ReactElement | null {
  if (!policyCard || !policyBlockUi) {
    return null;
  }

  return (
    <section className="message warning policy-card" aria-label="Policy mode guardrail">
      <span className="label">{policyBlockUi.title}</span>
      <p>{policyBlockUi.summary}</p>
      <small className="policy-card-boundary">{policyBlockUi.boundary}</small>
      {policyCard.blockers.length > 0 ? (
        <div className="policy-card-panel">
          <strong>{policyBlockUi.blockerHeading}</strong>
          <ol className="policy-blocker-list">
            {policyCard.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {policyCard.warnings.length > 0 ? (
        <details className="policy-card-panel">
          <summary>{policyBlockUi.contextHeading}</summary>
          <ul className="warning-list">
            {policyCard.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="policy-card-audit">
        <strong>{policyBlockUi.auditLabel}</strong>
        <small>{policyBlockUi.auditDetail}</small>
      </div>
      <label htmlFor="policy-note">{policyBlockUi.noteLabel}</label>
      <textarea
        id="policy-note"
        className="notes"
        value={policyNoteText}
        onChange={(event) => onPolicyNoteChange(event.target.value)}
        placeholder={policyBlockUi.notePlaceholder}
      />
      <small className="policy-note-hint">{policyBlockUi.noteHint}</small>
      <div className="button-row">
        <button type="button" disabled={!policyBlockUi.canOverride} onClick={onOverride}>
          Override and send
        </button>
        <button type="button" className="ghost" onClick={onBlock}>
          Block (no send)
        </button>
        <button type="button" className="ghost" onClick={onDismiss}>
          Dismiss for now
        </button>
      </div>
    </section>
  );
}

export function FrictionCardPanel({
  frictionCard,
  frictionNoteText,
  onFrictionNoteChange,
  onHavePlan,
  onSkipTrade,
  onAskHermes,
  onDismiss,
  onSaveNote,
  onClearNote
}: FrictionCardPanelProps): ReactElement | null {
  if (!frictionCard) {
    return null;
  }

  return (
    <section className="message warning">
      <span className="label">Pre-trade friction card</span>
      <p>{frictionCard.question ? `High-risk context: ${frictionCard.question}` : 'High-risk context detected.'}</p>
      {frictionCard.warnings.length > 0 ? (
        <div className="warning-list">
          {frictionCard.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      <div className="warning-list">
        {frictionCard.prompts.map((prompt) => (
          <p key={prompt}>{prompt}</p>
        ))}
      </div>
      <div className="button-row" style={{ marginTop: '8px' }}>
        <button type="button" onClick={onHavePlan}>
          I have a plan
        </button>
        <button type="button" onClick={onSkipTrade}>
          Skip this trade
        </button>
        <button type="button" onClick={onAskHermes}>
          Ask Hermes
        </button>
        <button type="button" className="ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <label htmlFor="friction-note">Add friction note</label>
      <textarea
        id="friction-note"
        className="notes"
        value={frictionNoteText}
        onChange={(event) => onFrictionNoteChange(event.target.value)}
        placeholder="If this is a false-positive or special case, capture it here."
      />
      <div className="button-row">
        <button type="button" onClick={onSaveNote}>
          Save note
        </button>
        <button type="button" className="ghost" onClick={onClearNote}>
          Clear note
        </button>
      </div>
      <small>Dismiss does not log an action. Use an action to proceed, skip, or save a note.</small>
    </section>
  );
}

export function LocalGuardrailPanel({
  localWarningCards,
  onFeedback,
  onAddNote
}: LocalGuardrailPanelProps): ReactElement | null {
  if (localWarningCards.length === 0) {
    return null;
  }

  return (
    <section className="message warning">
      <span className="label">Local guardrail</span>
      <div className="warning-cards">
        {localWarningCards.map((warning) => (
          <article key={warning.text} className="warning-card">
            <p className="warning-card-text">{warning.text}</p>
            <p className="warning-card-subtitle">Why am I seeing this?</p>
            <ul className="warning-evidence-list">
              {warning.evidences.length > 0 ? (
                warning.evidences.map((evidence, index) => (
                  <li
                    key={`${warning.text}-${evidence.source}-${evidence.detail}-${index}`}
                    className={`warning-evidence ${isLowConfidenceEvidence(evidence.confidence) ? 'warning-evidence--low' : ''}`}
                  >
                    <div className="warning-evidence-header">
                      <span className="warning-evidence-source">{evidence.source}</span>
                      <span className={`warning-evidence-confidence ${isLowConfidenceEvidence(evidence.confidence) ? 'warning-evidence-confidence--low' : ''}`}>
                        {formatEvidenceConfidence(evidence.confidence)}
                        {isLowConfidenceEvidence(evidence.confidence) ? ' (uncertain)' : ''}
                      </span>
                    </div>
                    <div className="warning-evidence-detail">{evidence.detail}</div>
                    <small className="warning-evidence-meta">
                      {evidence.provenance ? `Provenance: ${evidence.provenance}` : 'Provenance: local'}
                      {evidence.detectedAt ? ` · ${formatWarningDetectedAt(evidence.detectedAt)}` : ''}
                    </small>
                  </li>
                ))
              ) : (
                <li className="warning-evidence warning-evidence--empty">No detailed evidence available.</li>
              )}
            </ul>
            <div className="feedback-button-row">
              <button type="button" onClick={() => onFeedback(warning.text, 'took-it-anyway')}>
                I took it anyway
              </button>
              <button type="button" onClick={() => onFeedback(warning.text, 'skipped')}>
                I skipped
              </button>
              <button type="button" onClick={() => onFeedback(warning.text, 'followed-plan')}>
                I followed the plan
              </button>
              <button type="button" className="ghost" onClick={() => onAddNote(warning.text)}>
                Add note
              </button>
              <button type="button" onClick={() => onFeedback(warning.text, 'false-positive')}>
                Mark false positive
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function isLowConfidenceEvidence(confidence: SourceQualityConfidence): boolean {
  return confidence === 'low';
}

function formatEvidenceConfidence(confidence: SourceQualityConfidence): string {
  return `Confidence: ${confidence}`;
}

function formatWarningDetectedAt(detectedAt: string): string {
  const parsed = new Date(detectedAt);
  if (Number.isNaN(parsed.valueOf())) {
    return detectedAt;
  }

  return parsed.toLocaleString();
}
