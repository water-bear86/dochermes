import type { RefObject, ReactElement } from 'react';

import type { DataSharingScope, PrivacyPreset } from '../shared/types';
import type { TradeCardActionViewModel, TradeCardViewModel } from './tradeCardViewModel';

export interface RequestPreviewViewModel {
  destinationOrigin: string;
  dataSharingScope: DataSharingScope;
  privacyPreset: PrivacyPreset;
  payloadClasses: string[];
  localOnlyClasses: string[];
}

export interface RequestMetricsViewModel {
  captureMs?: number;
  localRiskMs?: number;
  ocrMs?: number;
  requestBuildMs?: number;
  hermesMs?: number;
  totalMs?: number;
}

interface TopbarPanelProps {
  statusText: string;
}

interface HermesStatusPanelProps {
  statusText: string;
  summary?: string;
  checkedAt?: string;
  isChecking: boolean;
  onCheck: () => void;
}

interface CoachStatePanelProps {
  armed: boolean;
  onToggle: () => void;
}

interface CaptureTargetPanelProps {
  selectedLabel: string;
  canSelect: boolean;
  canUnpair: boolean;
  onSelect: () => void;
  onUnpair: () => void;
}

interface RequestPreviewPanelProps {
  preview?: RequestPreviewViewModel;
}

interface QuestionPanelProps {
  questionRef: RefObject<HTMLTextAreaElement | null>;
  question: string;
  canAsk: boolean;
  voiceEnabled: boolean;
  isVoiceListening: boolean;
  isSpeechSpeaking: boolean;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
  onToggleVoice: () => void;
  onStopSpeech: () => void;
}

interface TradeCardPanelProps {
  tradeCard?: TradeCardViewModel;
  noteText: string;
  response: string;
  requestMetrics?: RequestMetricsViewModel;
  formatTiming: (value?: number) => string;
  onNoteChange: (value: string) => void;
  onAction: (action: TradeCardActionViewModel) => void;
}

export function TopbarPanel({ statusText }: TopbarPanelProps): ReactElement {
  return (
    <header className="topbar">
      <div>
        <h1>Hermes Coach</h1>
        <p>Risk and execution coach</p>
      </div>
      <span className="status" role="status" aria-live="polite" aria-atomic="true">
        {statusText}
      </span>
    </header>
  );
}

export function HermesStatusPanel({
  statusText,
  summary,
  checkedAt,
  isChecking,
  onCheck
}: HermesStatusPanelProps): ReactElement {
  return (
    <section className="control-strip compact-strip" aria-label="Hermes check-in status">
      <div role="status" aria-live="polite" aria-atomic="true">
        <span className="label">Hermes gateway</span>
        <strong>{statusText}</strong>
        <small>{summary ?? 'No check yet.'}</small>
      </div>
      <button type="button" onClick={onCheck} disabled={isChecking}>
        {isChecking ? 'Checking...' : checkedAt ? 'Recheck' : 'Check now'}
      </button>
    </section>
  );
}

export function CoachStatePanel({ armed, onToggle }: CoachStatePanelProps): ReactElement {
  return (
    <section className="control-strip" aria-label="Monitoring state">
      <div>
        <span className="label">Coach state</span>
        <strong>{armed ? 'Armed' : 'Paused'}</strong>
      </div>
      <button type="button" onClick={onToggle}>
        {armed ? 'Disarm' : 'Arm'}
      </button>
    </section>
  );
}

export function CaptureTargetPanel({
  selectedLabel,
  canSelect,
  canUnpair,
  onSelect,
  onUnpair
}: CaptureTargetPanelProps): ReactElement {
  return (
    <section className="control-strip control-strip--multi" aria-label="Trading window selection">
      <div>
        <span className="label">Capture target</span>
        <strong>{selectedLabel}</strong>
      </div>
      <button type="button" onClick={onSelect} disabled={!canSelect}>
        Select
      </button>
      <button type="button" className="ghost" onClick={onUnpair} disabled={!canUnpair}>
        Unpair
      </button>
    </section>
  );
}

export function RequestPreviewPanel({ preview }: RequestPreviewPanelProps): ReactElement | null {
  if (!preview) {
    return null;
  }

  return (
    <section className="message" aria-label="Hermes request preview">
      <span className="label">Sent to Hermes</span>
      <p>
        Destination: <strong>{preview.destinationOrigin}</strong> ({preview.dataSharingScope})
      </p>
      <p>
        Privacy preset: <strong>{preview.privacyPreset}</strong>
      </p>
      <div className="payload-row">
        {preview.payloadClasses.map((entry) => (
          <span key={entry}>{entry}</span>
        ))}
      </div>
      {preview.localOnlyClasses.length > 0 ? (
        <p>
          Withheld from Hermes: {preview.localOnlyClasses.join(' · ')}
        </p>
      ) : null}
    </section>
  );
}

export function QuestionPanel({
  questionRef,
  question,
  canAsk,
  voiceEnabled,
  isVoiceListening,
  isSpeechSpeaking,
  onQuestionChange,
  onAsk,
  onToggleVoice,
  onStopSpeech
}: QuestionPanelProps): ReactElement {
  return (
    <section className="question-panel" aria-label="Ask Hermes">
      <label htmlFor="question">Question</label>
      <textarea
        id="question"
        ref={questionRef}
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="Should I take this trade now?"
      />
      <div className="button-row">
        <button type="button" className="primary" onClick={onAsk} disabled={!canAsk}>
          Capture and ask
        </button>
        <button type="button" className="ghost" onClick={onToggleVoice} disabled={!voiceEnabled}>
          {isVoiceListening ? 'Stop listening' : 'Push-to-talk'}
        </button>
        {isSpeechSpeaking ? (
          <button type="button" className="ghost" onClick={onStopSpeech}>
            Stop reply audio
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function TradeCardPanel({
  tradeCard,
  noteText,
  response,
  requestMetrics,
  formatTiming,
  onNoteChange,
  onAction
}: TradeCardPanelProps): ReactElement | null {
  if (!tradeCard) {
    return null;
  }

  return (
    <section
      className={`message trade-card trade-card--${tradeCard.riskTone}`}
      aria-label="Trade card decision flow"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="trade-card-header">
        <div>
          <span className="label">Trade card</span>
          <h2>{tradeCard.token}</h2>
          <p>
            {tradeCard.proposedTrade} · {tradeCard.strategy}
          </p>
        </div>
        <div className={`trade-card-risk trade-card-risk--${tradeCard.riskTone}`} aria-label={`Risk ${tradeCard.risk}`}>
          <span>Risk</span>
          <strong>{tradeCard.risk}</strong>
        </div>
      </div>

      <dl className="trade-card-facts">
        <div>
          <dt>Source</dt>
          <dd>{tradeCard.source}</dd>
        </div>
        <div>
          <dt>Token age</dt>
          <dd>{tradeCard.tokenAge}</dd>
        </div>
        <div>
          <dt>Liquidity</dt>
          <dd>{tradeCard.liquidity}</dd>
        </div>
        <div>
          <dt>Holder concentration</dt>
          <dd>{tradeCard.holderConcentration}</dd>
        </div>
        <div>
          <dt>Wallet behavior</dt>
          <dd>{tradeCard.recentWalletBehavior}</dd>
        </div>
        <div>
          <dt>Recommended size</dt>
          <dd>{tradeCard.recommendedSize}</dd>
        </div>
      </dl>

      <div className="trade-card-assessment">
        <span className="label">Coach assessment</span>
        <p>{tradeCard.reason}</p>
        {tradeCard.memorySummary ? <small>{tradeCard.memorySummary}</small> : null}
      </div>

      <div className="trade-card-plan">
        <span className="label">Suggested plan</span>
        <dl>
          <div>
            <dt>Entry</dt>
            <dd>{tradeCard.plan.entry}</dd>
          </div>
          <div>
            <dt>Invalidation</dt>
            <dd>{tradeCard.plan.invalidation}</dd>
          </div>
          <div>
            <dt>Take profit</dt>
            <dd>{tradeCard.plan.takeProfit}</dd>
          </div>
          <div>
            <dt>Max hold</dt>
            <dd>{tradeCard.plan.maxHoldTime}</dd>
          </div>
        </dl>
      </div>

      {tradeCard.warnings.length > 0 ? (
        <ul className="trade-card-warnings" aria-label="Trade-card guardrails">
          {tradeCard.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <p className="trade-card-boundary">{tradeCard.advisoryNotice}</p>
      <label htmlFor="trade-card-note">Decision note</label>
      <textarea
        id="trade-card-note"
        className="notes"
        value={noteText}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Add sizing, alert, plan, rejection, or override context."
      />
      <div className="trade-card-actions">
        {tradeCard.actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            className={action.kind === 'accepted-recommended' ? 'primary' : action.kind === 'overrode' ? 'ghost' : undefined}
            onClick={() => onAction(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {requestMetrics ? (
        <small className="timing">
          Local risk checks: {formatTiming(requestMetrics.localRiskMs)} · OCR: {formatTiming(requestMetrics.ocrMs)} · Request build:{' '}
          {formatTiming(requestMetrics.requestBuildMs)} · Capture: {formatTiming(requestMetrics.captureMs)} · Hermes:{' '}
          {formatTiming(requestMetrics.hermesMs)} · Total: {formatTiming(requestMetrics.totalMs)}
        </small>
      ) : null}
      <details className="trade-card-raw-response">
        <summary>Raw Hermes response</summary>
        <p>{response}</p>
      </details>
    </section>
  );
}
