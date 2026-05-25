import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  MemoryContext,
  SourceCategory,
  SourceQualityOutcome,
  WarningFeedbackRecord
} from '../shared/types';
import type {
  PostmortemOutcomeRecord,
  PostmortemOutcomeTag,
  PostmortemSession,
  PostmortemSummaryRecord
} from './postmortem';
import {
  LocalMemoryPanel,
  PostmortemReplayPanel,
  SourceContextJournalPanel,
  WarningFeedbackLogPanel
} from './JournalPostmortemPanels';

const memoryContext: MemoryContext = {
  matchedPatterns: [
    {
      name: 'early-entry',
      evidenceCount: 4,
      summary: 'Early entries under similar conditions performed poorly.',
      recommendation: 'Wait for confirmation before entering.'
    }
  ],
  recentNotes: [],
  tradeHistorySummary: {
    totalTrades: 9,
    importedTrades: 3,
    walletTrades: 2,
    tradesLastHour: 1,
    tradesLastDay: 5,
    recentLossStreak: 2,
    sizeSignals: [
      {
        unit: 'sol',
        medianSize: 0.08,
        maxSize: 0.5,
        sampleCount: 7
      }
    ]
  }
};

const warningFeedback: WarningFeedbackRecord = {
  id: 'feedback-1',
  createdAt: '2026-05-25T10:00:00.000Z',
  warningText: 'Oversized early momentum entry.',
  action: 'followed-plan',
  question: 'Should I buy now?',
  response: 'Wait for confirmation.',
  selectedWindowName: 'Trading Desk',
  selectedWindowId: 'window:1',
  selectedWindowKind: 'window',
  notes: 'Sized down.',
  policyOverride: {
    required: true,
    blockers: ['Daily loss limit reached'],
    overrideNote: 'Paper review only.',
    auditSource: 'policy-card'
  },
  updatedAt: '2026-05-25T10:05:00.000Z'
};

const postmortemSession: PostmortemSession = {
  id: 'session-2026-05-25',
  label: 'May 25, 2026',
  riskSignals: ['warning: early entry'],
  timeline: [
    {
      id: 'event-1',
      timestamp: '2026-05-25T10:00:00.000Z',
      source: 'Journal (Trading Desk)',
      title: 'Journal event: Should I buy now?',
      summary: 'Trade check from journal entry.',
      details: ['Question: Should I buy now?', 'Coach response: Wait for confirmation.'],
      provenance: ['Window capture: Trading Desk'],
      riskSignals: ['warning: early entry'],
      kind: 'journal',
      requestId: 'request-1'
    }
  ]
};

const postmortemOutcome: PostmortemOutcomeRecord = {
  id: 'outcome-1',
  createdAt: '2026-05-25T10:10:00.000Z',
  eventId: 'event-1',
  tag: 'followed-plan',
  notes: 'Waited for confirmation.'
};

const postmortemSummary: PostmortemSummaryRecord = {
  id: 'summary-1',
  generatedAt: '2026-05-25T10:15:00.000Z',
  sessionId: 'session-2026-05-25',
  sessionLabel: 'May 25, 2026',
  compactSummary: 'Waited for confirmation and avoided the first drawdown.',
  eventCount: 1,
  taggedEventCount: 1,
  tagCounts: {
    'good-skip': 0,
    'bad-entry': 0,
    'ignored-warning': 0,
    'followed-plan': 1,
    'note-for-next-time': 0
  },
  notableRisks: ['early entry']
};

const sourceCategoryOptions: Array<{ value: SourceCategory; label: string }> = [
  { value: 'unknown', label: 'Unknown source' },
  { value: 'telegram', label: 'Telegram' }
];
const sourceOutcomeOptions: Array<{ value: SourceQualityOutcome; label: string }> = [
  { value: 'unknown', label: 'Unknown / not scored' },
  { value: 'bad', label: 'Bad outcome' }
];
const sourceOutcomeHelp: Record<SourceQualityOutcome, string> = {
  unknown: 'No outcome logged yet for this source.',
  good: 'Source led to a positive outcome.',
  neutral: 'Source was observed but outcome was not clearly good or bad.',
  bad: 'Source led to a negative outcome.'
};

describe('JournalPostmortemPanels', () => {
  it('renders local memory counts, personal pattern matches, and trade history summary', () => {
    const markup = renderToStaticMarkup(
      <LocalMemoryPanel
        journalEntryCount={3}
        warningFeedbackCount={2}
        memoryContext={memoryContext}
        onClearLocalMemory={vi.fn()}
      />
    );

    expect(markup).toContain('Local memory');
    expect(markup).toContain('3 journal notes');
    expect(markup).toContain('2 warning feedback records');
    expect(markup).toContain('Early entries under similar conditions performed poorly.');
    expect(markup).toContain('Wait for confirmation before entering.');
    expect(markup).toContain('9 recent trades tracked');
    expect(markup).toContain('imported records: 3');
    expect(markup).toContain('wallet records: 2');
    expect(markup).toContain('SOL median: 0.08 / max: 0.50');
  });

  it('renders warning feedback records and the active edit form', () => {
    const markup = renderToStaticMarkup(
      <WarningFeedbackLogPanel
        entries={[warningFeedback]}
        editingFeedbackId="feedback-1"
        editingFeedbackAction="followed-plan"
        editingFeedbackNotes="Sized down."
        onBeginEdit={vi.fn()}
        onDelete={vi.fn()}
        onActionChange={vi.fn()}
        onNotesChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(markup).toContain('Warning feedback');
    expect(markup).toContain('Oversized early momentum entry.');
    expect(markup).toContain('followed plan');
    expect(markup).toContain('Daily loss limit reached');
    expect(markup).toContain('Policy override note');
    expect(markup).toContain('Action');
    expect(markup).toContain('Mark false positive');
  });

  it('renders postmortem replay, outcome edit fields, and saved summaries', () => {
    const markup = renderToStaticMarkup(
      <PostmortemReplayPanel
        sessions={[postmortemSession]}
        session={postmortemSession}
        sessionOutcomes={[postmortemOutcome]}
        sessionSummaries={[postmortemSummary]}
        sessionSummaryLabel="May 25, 2026"
        summaryMessage="Saved summary for May 25, 2026"
        editingState={{
          eventId: 'event-1',
          outcome: 'followed-plan',
          notes: 'Waited.',
          mistakeTags: 'fomo',
          setupQuality: 4,
          sourceQuality: 3,
          sizingQuality: 5,
          entryTimingQuality: 4,
          invalidationQuality: 3,
          maxLossPercent: '2.5',
          lessonLearned: 'Wait for confirmation.'
        }}
        outcomeTagOptions={[
          { value: 'followed-plan' as PostmortemOutcomeTag, label: 'Followed plan' },
          { value: 'bad-entry' as PostmortemOutcomeTag, label: 'Bad entry' }
        ]}
        summaryPreviewLimit={3}
        onSaveSummary={vi.fn()}
        onSessionChange={vi.fn()}
        onBeginEdit={vi.fn()}
        onDeleteOutcome={vi.fn()}
        onSaveOutcome={vi.fn()}
        onCancelEdit={vi.fn()}
        onEditingOutcomeChange={vi.fn()}
        onEditingNotesChange={vi.fn()}
        onEditingMistakeTagsChange={vi.fn()}
        onEditingSetupQualityChange={vi.fn()}
        onEditingSourceQualityChange={vi.fn()}
        onEditingSizingQualityChange={vi.fn()}
        onEditingEntryTimingQualityChange={vi.fn()}
        onEditingInvalidationQualityChange={vi.fn()}
        onEditingMaxLossPercentChange={vi.fn()}
        onEditingLessonLearnedChange={vi.fn()}
      />
    );

    expect(markup).toContain('Postmortem replay');
    expect(markup).toContain('May 25, 2026');
    expect(markup).toContain('1 timeline event(s)');
    expect(markup).toContain('Journal event: Should I buy now?');
    expect(markup).toContain('Outcome tag');
    expect(markup).toContain('Max loss observed (%)');
    expect(markup).toContain('Saved session summaries');
    expect(markup).toContain('Waited for confirmation and avoided the first drawdown.');
  });

  it('renders source context journal controls only when visible', () => {
    const hiddenMarkup = renderToStaticMarkup(
      <SourceContextJournalPanel
        visible={false}
        sourceCategoryOptions={sourceCategoryOptions}
        sourceOutcomeOptions={sourceOutcomeOptions}
        sourceOutcomeHelp={sourceOutcomeHelp}
        sourceCategory="unknown"
        sourceOutcome="unknown"
        sourceTokenHint=""
        journalNotes=""
        journalSavedMessage=""
        journalEntryCount={0}
        onApplyDetectedSource={vi.fn()}
        onSourceCategoryChange={vi.fn()}
        onSourceOutcomeChange={vi.fn()}
        onSourceTokenHintChange={vi.fn()}
        onJournalNotesChange={vi.fn()}
        onSaveJournal={vi.fn()}
      />
    );

    const markup = renderToStaticMarkup(
      <SourceContextJournalPanel
        visible
        topFinding={{
          category: 'telegram',
          confidence: 'high',
          provenance: 'DOM',
          tokenHint: 'ABC',
          reason: 'Detected source channel.'
        }}
        topFindingCategoryLabel="Telegram"
        sourceCategoryOptions={sourceCategoryOptions}
        sourceOutcomeOptions={sourceOutcomeOptions}
        sourceOutcomeHelp={sourceOutcomeHelp}
        sourceCategory="telegram"
        sourceOutcome="bad"
        sourceTokenHint="ABC"
        journalNotes="Bad source."
        journalSavedMessage=""
        journalEntryCount={5}
        onApplyDetectedSource={vi.fn()}
        onSourceCategoryChange={vi.fn()}
        onSourceOutcomeChange={vi.fn()}
        onSourceTokenHintChange={vi.fn()}
        onJournalNotesChange={vi.fn()}
        onSaveJournal={vi.fn()}
      />
    );

    expect(hiddenMarkup).toBe('');
    expect(markup).toContain('Source context');
    expect(markup).toContain('Telegram · confidence high · DOM');
    expect(markup).toContain('Token hint: ABC');
    expect(markup).toContain('Source led to a negative outcome.');
    expect(markup).toContain('5 saved locally');
  });
});
