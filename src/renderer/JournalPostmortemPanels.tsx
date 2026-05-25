import type { ReactElement } from 'react';

import type {
  MemoryContext,
  SourceCategory,
  SourceQualityFinding,
  SourceQualityOutcome,
  WarningFeedbackAction,
  WarningFeedbackRecord
} from '../shared/types';
import {
  formatPostmortemOutcomeDetail,
  type PostmortemOutcomeRecord,
  type PostmortemOutcomeTag,
  type PostmortemSession,
  type PostmortemSummaryRecord,
  type PostmortemTimelineEvent
} from './postmortem';
import { formatPolicyOverrideAuditDetail } from './warningFeedback';

interface LocalMemoryPanelProps {
  journalEntryCount: number;
  warningFeedbackCount: number;
  memoryContext: MemoryContext;
  onClearLocalMemory: () => void;
}

interface WarningFeedbackLogPanelProps {
  entries: WarningFeedbackRecord[];
  editingFeedbackId?: string;
  editingFeedbackAction: WarningFeedbackAction;
  editingFeedbackNotes: string;
  onBeginEdit: (entry: WarningFeedbackRecord) => void;
  onDelete: (entryId: string) => void;
  onActionChange: (action: WarningFeedbackAction) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export interface PostmortemEditingState {
  eventId?: string;
  outcome: PostmortemOutcomeTag;
  notes: string;
  mistakeTags: string;
  setupQuality: number;
  sourceQuality: number;
  sizingQuality: number;
  entryTimingQuality: number;
  invalidationQuality: number;
  maxLossPercent: string;
  lessonLearned: string;
}

interface PostmortemReplayPanelProps {
  sessions: PostmortemSession[];
  session?: PostmortemSession;
  sessionOutcomes: PostmortemOutcomeRecord[];
  sessionSummaries: PostmortemSummaryRecord[];
  sessionSummaryLabel: string;
  summaryMessage: string;
  editingState: PostmortemEditingState;
  outcomeTagOptions: Array<{ value: PostmortemOutcomeTag; label: string }>;
  summaryPreviewLimit: number;
  onSaveSummary: () => void;
  onSessionChange: (sessionId: string) => void;
  onBeginEdit: (event: PostmortemTimelineEvent) => void;
  onDeleteOutcome: (outcomeId: string) => void;
  onSaveOutcome: () => void;
  onCancelEdit: () => void;
  onEditingOutcomeChange: (outcome: PostmortemOutcomeTag) => void;
  onEditingNotesChange: (value: string) => void;
  onEditingMistakeTagsChange: (value: string) => void;
  onEditingSetupQualityChange: (value: string) => void;
  onEditingSourceQualityChange: (value: string) => void;
  onEditingSizingQualityChange: (value: string) => void;
  onEditingEntryTimingQualityChange: (value: string) => void;
  onEditingInvalidationQualityChange: (value: string) => void;
  onEditingMaxLossPercentChange: (value: string) => void;
  onEditingLessonLearnedChange: (value: string) => void;
}

interface SourceContextJournalPanelProps {
  visible: boolean;
  topFinding?: SourceQualityFinding;
  topFindingCategoryLabel?: string;
  sourceCategoryOptions: Array<{ value: SourceCategory; label: string }>;
  sourceOutcomeOptions: Array<{ value: SourceQualityOutcome; label: string }>;
  sourceOutcomeHelp: Record<SourceQualityOutcome, string>;
  sourceCategory: SourceCategory;
  sourceOutcome: SourceQualityOutcome;
  sourceTokenHint: string;
  journalNotes: string;
  journalSavedMessage: string;
  journalEntryCount: number;
  onApplyDetectedSource: () => void;
  onSourceCategoryChange: (category: SourceCategory) => void;
  onSourceOutcomeChange: (outcome: SourceQualityOutcome) => void;
  onSourceTokenHintChange: (value: string) => void;
  onJournalNotesChange: (value: string) => void;
  onSaveJournal: () => void;
}

export function LocalMemoryPanel({
  journalEntryCount,
  warningFeedbackCount,
  memoryContext,
  onClearLocalMemory
}: LocalMemoryPanelProps): ReactElement {
  return (
    <>
      <section className="message" aria-label="Local memory controls">
        <div className="section-heading compact">
          <span className="label">Local memory</span>
          <button
            type="button"
            className="ghost"
            onClick={onClearLocalMemory}
            disabled={journalEntryCount === 0 && warningFeedbackCount === 0}
          >
            Clear local memory
          </button>
        </div>
        <p>
          {journalEntryCount} journal notes · {warningFeedbackCount} warning feedback records saved locally on this
          device.
        </p>
      </section>

      {memoryContext.matchedPatterns.length > 0 ? (
        <section className="message memory" aria-label="Personal memory match">
          <span className="label">Personal memory</span>
          {memoryContext.matchedPatterns.map((pattern) => (
            <div key={pattern.name} className="memory-pattern">
              <strong>{pattern.summary}</strong>
              <p>{pattern.recommendation}</p>
              <small>{pattern.evidenceCount} local journal notes matched</small>
            </div>
          ))}
        </section>
      ) : null}

      {memoryContext.tradeHistorySummary ? (
        <section className="message trade-history" aria-label="Trade history summary">
          <span className="label">Trade history summary</span>
          <ul className="trade-history-list">
            <li>
              {memoryContext.tradeHistorySummary.totalTrades} recent trades tracked · {memoryContext.tradeHistorySummary.recentLossStreak} recent loss
              {memoryContext.tradeHistorySummary.recentLossStreak === 1 ? '' : 'es'} (latest hour/day:
              {memoryContext.tradeHistorySummary.tradesLastHour}/{memoryContext.tradeHistorySummary.tradesLastDay})
              {memoryContext.tradeHistorySummary.importedTrades > 0
                ? ` · imported records: ${memoryContext.tradeHistorySummary.importedTrades}`
                : ''}
              {memoryContext.tradeHistorySummary.walletTrades > 0
                ? ` · wallet records: ${memoryContext.tradeHistorySummary.walletTrades}`
                : ''}
            </li>
            {memoryContext.tradeHistorySummary.sizeSignals.length > 0 ? (
              memoryContext.tradeHistorySummary.sizeSignals.map((signal) => (
                <li key={signal.unit}>
                  {signal.unit.toUpperCase()} median: {signal.medianSize.toFixed(2)} / max: {signal.maxSize.toFixed(2)} (n={signal.sampleCount})
                </li>
              ))
            ) : (
              <li>No parseable trade-size signal in recent notes.</li>
            )}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function WarningFeedbackLogPanel({
  entries,
  editingFeedbackId,
  editingFeedbackAction,
  editingFeedbackNotes,
  onBeginEdit,
  onDelete,
  onActionChange,
  onNotesChange,
  onSave,
  onCancel
}: WarningFeedbackLogPanelProps): ReactElement | null {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="message" aria-label="Warning feedback log">
      <span className="label">Warning feedback</span>
      <div className="warning-feedback-list">
        {entries.map((entry) => (
          <div key={entry.id} className="warning-feedback-item">
            <strong>{entry.warningText}</strong>
            <p>{entry.action.replace('-', ' ')}</p>
            <small>
              {new Date(entry.createdAt).toLocaleString()} · {entry.selectedWindowName}
            </small>
            {entry.notes ? <small>Notes: {entry.notes}</small> : null}
            {formatPolicyOverrideAuditDetail(entry).map((detail) => (
              <small key={`${entry.id}-${detail}`} className="policy-override-audit-detail">
                {detail}
              </small>
            ))}
            {entry.updatedAt ? <small>Updated: {new Date(entry.updatedAt).toLocaleString()}</small> : null}
            <div className="button-row">
              <button type="button" className="ghost" onClick={() => onBeginEdit(entry)}>
                Edit
              </button>
              <button type="button" className="ghost" onClick={() => onDelete(entry.id)}>
                Delete
              </button>
            </div>

            {editingFeedbackId === entry.id ? (
              <div className="feedback-edit-row">
                <label htmlFor={`edit-action-${entry.id}`}>Action</label>
                <select
                  id={`edit-action-${entry.id}`}
                  value={editingFeedbackAction}
                  onChange={(event) => onActionChange(event.target.value as WarningFeedbackAction)}
                >
                  <option value="took-it-anyway">Took it anyway</option>
                  <option value="skipped">Skipped</option>
                  <option value="followed-plan">Followed plan</option>
                  <option value="added-note">Added note</option>
                  <option value="false-positive">Mark false positive</option>
                </select>
                <label htmlFor={`edit-notes-${entry.id}`}>Notes</label>
                <textarea
                  id={`edit-notes-${entry.id}`}
                  value={editingFeedbackNotes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  className="notes"
                />
                <div className="button-row">
                  <button type="button" onClick={onSave}>
                    Save
                  </button>
                  <button type="button" className="ghost" onClick={onCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PostmortemReplayPanel({
  sessions,
  session,
  sessionOutcomes,
  sessionSummaries,
  sessionSummaryLabel,
  summaryMessage,
  editingState,
  outcomeTagOptions,
  summaryPreviewLimit,
  onSaveSummary,
  onSessionChange,
  onBeginEdit,
  onDeleteOutcome,
  onSaveOutcome,
  onCancelEdit,
  onEditingOutcomeChange,
  onEditingNotesChange,
  onEditingMistakeTagsChange,
  onEditingSetupQualityChange,
  onEditingSourceQualityChange,
  onEditingSizingQualityChange,
  onEditingEntryTimingQualityChange,
  onEditingInvalidationQualityChange,
  onEditingMaxLossPercentChange,
  onEditingLessonLearnedChange
}: PostmortemReplayPanelProps): ReactElement | null {
  if (sessions.length === 0 || !session) {
    return null;
  }

  return (
    <section className="message postmortem" aria-label="Postmortem replay">
      <span className="label">Postmortem replay</span>
      <div className="section-heading compact">
        <h2>{sessionSummaryLabel}</h2>
        <button type="button" className="ghost" onClick={onSaveSummary}>
          Save session compact summary
        </button>
      </div>

      <label htmlFor="postmortem-session">Replay session</label>
      <select
        id="postmortem-session"
        value={session.id}
        onChange={(event) => onSessionChange(event.target.value)}
      >
        {sessions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>

      {summaryMessage ? <small className="subtle-note">{summaryMessage}</small> : null}

      <div className="subtle-note">
        {session.timeline.length} timeline event(s) · {sessionOutcomes.length} tagged outcome(s)
        {session.riskSignals.length > 0 ? ` · top risks: ${session.riskSignals.slice(0, 3).join(', ')}` : ''}
      </div>

      <div className="postmortem-timeline">
        {session.timeline.map((event) => {
          const eventOutcome = sessionOutcomes.find((record) => record.eventId === event.id);
          const isEditing = editingState.eventId === event.id;

          return (
            <article key={event.id} className="postmortem-event">
              <div className="postmortem-event-heading">
                <strong>{event.source}</strong>
                <small>{new Date(event.timestamp).toLocaleString()}</small>
              </div>
              <h3>{event.title}</h3>
              <p className="postmortem-event-summary">{event.summary}</p>
              <small className="postmortem-event-subtitle">{event.riskSignals.length > 0 ? 'Risk signals present' : 'No explicit risk signal'}</small>

              <ul className="postmortem-event-list">
                {event.details.map((detail, index) => (
                  <li key={`${event.id}-detail-${index}`}>{detail}</li>
                ))}
              </ul>
              {event.provenance.length > 0 ? (
                <ul className="postmortem-event-list postmortem-event-provenance">
                  {event.provenance.map((entry, index) => (
                    <li key={`${event.id}-prov-${index}`}>{entry}</li>
                  ))}
                </ul>
              ) : null}

              {eventOutcome ? (
                <small className="postmortem-outcome-chip">
                  {formatPostmortemOutcomeDetail(eventOutcome)}
                </small>
              ) : null}

              {isEditing ? (
                <PostmortemEditForm
                  eventId={event.id}
                  editingState={editingState}
                  outcomeTagOptions={outcomeTagOptions}
                  onSaveOutcome={onSaveOutcome}
                  onCancelEdit={onCancelEdit}
                  onEditingOutcomeChange={onEditingOutcomeChange}
                  onEditingNotesChange={onEditingNotesChange}
                  onEditingMistakeTagsChange={onEditingMistakeTagsChange}
                  onEditingSetupQualityChange={onEditingSetupQualityChange}
                  onEditingSourceQualityChange={onEditingSourceQualityChange}
                  onEditingSizingQualityChange={onEditingSizingQualityChange}
                  onEditingEntryTimingQualityChange={onEditingEntryTimingQualityChange}
                  onEditingInvalidationQualityChange={onEditingInvalidationQualityChange}
                  onEditingMaxLossPercentChange={onEditingMaxLossPercentChange}
                  onEditingLessonLearnedChange={onEditingLessonLearnedChange}
                />
              ) : (
                <div className="button-row">
                  <button type="button" onClick={() => onBeginEdit(event)}>
                    {eventOutcome ? 'Edit outcome' : 'Add outcome'}
                  </button>
                  {eventOutcome ? (
                    <button type="button" className="ghost" onClick={() => onDeleteOutcome(eventOutcome.id)}>
                      Clear outcome
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {sessionSummaries.length > 0 ? (
        <div className="postmortem-summary-listing">
          <div className="section-heading compact">
            <h2>Saved session summaries</h2>
            <small>{sessionSummaries.length}</small>
          </div>
          <ol className="postmortem-summary-list">
            {sessionSummaries.slice(0, summaryPreviewLimit).map((summary) => (
              <li key={summary.id} className="postmortem-summary-item">
                <strong>{summary.compactSummary}</strong>
                <small>
                  Generated {new Date(summary.generatedAt).toLocaleString()} · {summary.eventCount} events · {summary.taggedEventCount}{' '}
                  tagged
                </small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export function SourceContextJournalPanel({
  visible,
  topFinding,
  topFindingCategoryLabel,
  sourceCategoryOptions,
  sourceOutcomeOptions,
  sourceOutcomeHelp,
  sourceCategory,
  sourceOutcome,
  sourceTokenHint,
  journalNotes,
  journalSavedMessage,
  journalEntryCount,
  onApplyDetectedSource,
  onSourceCategoryChange,
  onSourceOutcomeChange,
  onSourceTokenHintChange,
  onJournalNotesChange,
  onSaveJournal
}: SourceContextJournalPanelProps): ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <section className="message" aria-label="Source context">
      <div className="section-heading compact source-outcome-heading">
        <h2>Source context</h2>
        <button type="button" className="ghost" onClick={onApplyDetectedSource} disabled={!topFinding}>
          Apply detected source
        </button>
      </div>
      <small className="source-outcome-hint">Track source context so future source-quality checks learn from your outcomes.</small>
      {topFinding ? (
        <div className="source-quality-chip-list">
          <span className="source-quality-chip">
            {topFindingCategoryLabel ?? topFinding.category} · confidence {topFinding.confidence} · {topFinding.provenance}
          </span>
          {topFinding.tokenHint ? (
            <span className="source-quality-chip">Token hint: {topFinding.tokenHint}</span>
          ) : null}
        </div>
      ) : (
        <small className="source-outcome-hint">No source detected in this request. Fill category/outcome manually if needed.</small>
      )}
      <label htmlFor="source-category">Source category</label>
      <select
        id="source-category"
        value={sourceCategory}
        onChange={(event) => onSourceCategoryChange(event.target.value as SourceCategory)}
      >
        {sourceCategoryOptions.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label htmlFor="source-outcome">Outcome</label>
      <select
        id="source-outcome"
        value={sourceOutcome}
        onChange={(event) => onSourceOutcomeChange(event.target.value as SourceQualityOutcome)}
      >
        {sourceOutcomeOptions.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <small className="source-outcome-hint">{sourceOutcomeHelp[sourceOutcome]}</small>
      <label htmlFor="source-token-hint">Token/address hint (optional)</label>
      <input
        id="source-token-hint"
        value={sourceTokenHint}
        onChange={(event) => onSourceTokenHintChange(event.target.value)}
        placeholder="Optional token hint (e.g. contract/address)"
      />
      <label htmlFor="journal-notes">Session notes</label>
      <textarea
        id="journal-notes"
        className="notes"
        value={journalNotes}
        onChange={(event) => onJournalNotesChange(event.target.value)}
        placeholder="What happened next?"
      />
      <div className="journal-actions">
        <button type="button" onClick={onSaveJournal}>
          Save journal
        </button>
        <span>{journalSavedMessage || `${journalEntryCount} saved locally`}</span>
      </div>
    </section>
  );
}

interface PostmortemEditFormProps extends Omit<PostmortemReplayPanelProps, 'sessions' | 'session' | 'sessionOutcomes' | 'sessionSummaries' | 'sessionSummaryLabel' | 'summaryMessage' | 'summaryPreviewLimit' | 'onSaveSummary' | 'onSessionChange' | 'onBeginEdit' | 'onDeleteOutcome'> {
  eventId: string;
}

function PostmortemEditForm({
  eventId,
  editingState,
  outcomeTagOptions,
  onSaveOutcome,
  onCancelEdit,
  onEditingOutcomeChange,
  onEditingNotesChange,
  onEditingMistakeTagsChange,
  onEditingSetupQualityChange,
  onEditingSourceQualityChange,
  onEditingSizingQualityChange,
  onEditingEntryTimingQualityChange,
  onEditingInvalidationQualityChange,
  onEditingMaxLossPercentChange,
  onEditingLessonLearnedChange
}: PostmortemEditFormProps): ReactElement {
  return (
    <div className="postmortem-edit-row">
      <label htmlFor={`postmortem-tag-${eventId}`}>Outcome tag</label>
      <select
        id={`postmortem-tag-${eventId}`}
        value={editingState.outcome}
        onChange={(event) => onEditingOutcomeChange(event.target.value as PostmortemOutcomeTag)}
      >
        {outcomeTagOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label htmlFor={`postmortem-notes-${eventId}`}>Notes</label>
      <textarea
        id={`postmortem-notes-${eventId}`}
        value={editingState.notes}
        className="notes"
        onChange={(event) => onEditingNotesChange(event.target.value)}
      />
      <label htmlFor={`postmortem-mistake-tags-${eventId}`}>Mistake tags (comma separated)</label>
      <input
        id={`postmortem-mistake-tags-${eventId}`}
        value={editingState.mistakeTags}
        onChange={(event) => onEditingMistakeTagsChange(event.target.value)}
        placeholder="fomo, late-entry, oversize"
      />
      <label htmlFor={`postmortem-setup-quality-${eventId}`}>Setup quality (1-5)</label>
      <input
        id={`postmortem-setup-quality-${eventId}`}
        type="number"
        min="1"
        max="5"
        step="1"
        value={editingState.setupQuality}
        onChange={(event) => onEditingSetupQualityChange(event.target.value)}
      />
      <label htmlFor={`postmortem-source-quality-${eventId}`}>Source quality (1-5)</label>
      <input
        id={`postmortem-source-quality-${eventId}`}
        type="number"
        min="1"
        max="5"
        step="1"
        value={editingState.sourceQuality}
        onChange={(event) => onEditingSourceQualityChange(event.target.value)}
      />
      <label htmlFor={`postmortem-sizing-quality-${eventId}`}>Sizing quality (1-5)</label>
      <input
        id={`postmortem-sizing-quality-${eventId}`}
        type="number"
        min="1"
        max="5"
        step="1"
        value={editingState.sizingQuality}
        onChange={(event) => onEditingSizingQualityChange(event.target.value)}
      />
      <label htmlFor={`postmortem-entry-timing-quality-${eventId}`}>Entry timing quality (1-5)</label>
      <input
        id={`postmortem-entry-timing-quality-${eventId}`}
        type="number"
        min="1"
        max="5"
        step="1"
        value={editingState.entryTimingQuality}
        onChange={(event) => onEditingEntryTimingQualityChange(event.target.value)}
      />
      <label htmlFor={`postmortem-invalidation-quality-${eventId}`}>Invalidation quality (1-5)</label>
      <input
        id={`postmortem-invalidation-quality-${eventId}`}
        type="number"
        min="1"
        max="5"
        step="1"
        value={editingState.invalidationQuality}
        onChange={(event) => onEditingInvalidationQualityChange(event.target.value)}
      />
      <label htmlFor={`postmortem-max-loss-${eventId}`}>Max loss observed (%)</label>
      <input
        id={`postmortem-max-loss-${eventId}`}
        type="number"
        min="0"
        step="0.1"
        value={editingState.maxLossPercent}
        onChange={(event) => onEditingMaxLossPercentChange(event.target.value)}
        placeholder="12.5"
      />
      <label htmlFor={`postmortem-lesson-${eventId}`}>Lesson learned</label>
      <textarea
        id={`postmortem-lesson-${eventId}`}
        value={editingState.lessonLearned}
        className="notes"
        onChange={(event) => onEditingLessonLearnedChange(event.target.value)}
      />
      <div className="button-row">
        <button type="button" onClick={onSaveOutcome}>
          Save outcome
        </button>
        <button type="button" className="ghost" onClick={onCancelEdit}>
          Cancel
        </button>
      </div>
    </div>
  );
}
