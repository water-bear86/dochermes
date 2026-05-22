import { describe, expect, it } from 'vitest';

import type {
  HermesRequestDiagnostic,
  JournalEntry,
  WarningFeedbackRecord
} from '../shared/types';
import {
  POSTMORTEM_SUMMARY_LIMIT,
  appendPostmortemOutcomeRecord,
  appendPostmortemSummary,
  buildCompactPostmortemSummary,
  buildPostmortemSessions,
  deletePostmortemOutcomeRecord,
  parsePostmortemOutcomeRecords,
  readPostmortemOutcomeRecords,
  readPostmortemSummaries,
  serializePostmortemOutcomeRecords,
  serializePostmortemSummaries,
  updatePostmortemOutcomeRecord,
  type PostmortemOutcomeTag
} from './postmortem';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const createStorage = (): LocalStorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
};

const diagnostics: HermesRequestDiagnostic[] = [
  {
    id: 'diag-1',
    startedAt: '2026-05-20T10:00:00.000Z',
    completedAt: '2026-05-20T10:00:01.000Z',
    status: 'success',
    questionPreview: 'Should I ape this?',
    selectedWindowName: 'Window A',
    selectedWindowKind: 'window',
    selectedWindowId: 'window-a',
    connection: {
      connectionKind: 'local',
      endpointMode: 'auto',
      baseUrl: 'http://localhost:8642',
      modelId: 'hermes'
    },
    timings: {
      totalMs: 100,
      hermesMs: 50
    },
    requestContext: {
      dataSharingScope: 'local-first',
      preset: 'balanced'
    },
    request: {
      redactionEnabled: false,
      usedFallbackImage: false
    }
  }
];

const warningFeedbackEntries: WarningFeedbackRecord[] = [
  {
    id: 'warning-1',
    createdAt: '2026-05-20T11:00:00.000Z',
    warningText: 'Immediate entry',
    action: 'skipped',
    question: 'Should I enter immediately?',
    response: 'Need confirmation.',
    selectedWindowName: 'Window A',
    selectedWindowId: 'window-a',
    selectedWindowKind: 'window'
  }
];

const journalEntries: JournalEntry[] = [
  {
    id: 'entry-1',
    createdAt: '2026-05-20T10:05:00.000Z',
    question: 'Should I enter now?',
    response: 'Coach suggests wait.',
    notes: 'Fell through support first time.',
    selectedWindow: {
      id: 'window-a',
      name: 'Window A',
      kind: 'window'
    },
    screenshot: {
      captured: true,
      imageStored: false
    }
  }
];

describe('buildPostmortemSessions', () => {
  it('builds timeline sessions across journal, feedback, and diagnostics', () => {
    const sessions = buildPostmortemSessions({
      journalEntries,
      warningFeedbackEntries,
      requestDiagnostics: diagnostics
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].timeline).toHaveLength(3);
    expect(sessions[0].timeline[0].kind).toBe('request-diagnostic');
    expect(sessions[0].timeline[1].kind).toBe('journal');
    expect(sessions[0].timeline[2].kind).toBe('warning-feedback');
  });

  it('uses the local date as session key and keeps timeline sorted', () => {
    const sameDayDiagnostics: HermesRequestDiagnostic[] = [
      {
        ...diagnostics[0],
        id: 'diag-2',
        startedAt: '2026-05-20T09:00:00.000Z',
        completedAt: '2026-05-20T09:00:01.000Z'
      }
    ];

    const sessions = buildPostmortemSessions({
      journalEntries,
      warningFeedbackEntries: [],
      requestDiagnostics: sameDayDiagnostics
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].timeline[0].timestamp).toBe('2026-05-20T09:00:00.000Z');
    expect(sessions[0].timeline[1].timestamp).toBe('2026-05-20T10:05:00.000Z');
  });
});

describe('postmortem outcome persistence helpers', () => {
  it('parses and serializes outcomes with stable ordering', () => {
    const records = parsePostmortemOutcomeRecords(
      JSON.stringify([
        {
          id: 'bad',
          createdAt: '2026-05-20T09:00:00.000Z',
          eventId: 'e-1',
          tag: 'bad-entry'
        },
        {
          id: 'good',
          createdAt: '2026-05-20T10:00:00.000Z',
          eventId: 'e-2',
          tag: 'good-skip'
        },
        {
          nope: true
        }
      ])
    );

    expect(records.map((record) => record.id)).toEqual(['good', 'bad']);
    expect(serializePostmortemOutcomeRecords(records, 1)).toBe('[{"id":"good","createdAt":"2026-05-20T10:00:00.000Z","eventId":"e-2","tag":"good-skip"}]');
  });

  it('appends and replaces outcome records by event id', () => {
    const storage = createStorage();
    const next = appendPostmortemOutcomeRecord(storage, {
      eventId: 'event-1',
      tag: 'note-for-next-time',
      notes: 'Need patience.'
    });

    const again = appendPostmortemOutcomeRecord(storage, {
      eventId: 'event-1',
      tag: 'bad-entry'
    });

    expect(next).toHaveLength(1);
    expect(again).toHaveLength(1);
    expect(again[0].tag).toBe('bad-entry');
    expect(again[0].notes).toBeUndefined();
  });

  it('updates and deletes saved outcomes', () => {
    const storage = createStorage();
    appendPostmortemOutcomeRecord(storage, { eventId: 'event-1', tag: 'good-skip', notes: 'ok' });
    const first = readPostmortemOutcomeRecords(storage);

    const updated = updatePostmortemOutcomeRecord(storage, first[0].id, {
      tag: 'followed-plan',
      notes: 'Added note.'
    });
    expect(updated[0].tag).toBe('followed-plan');
    expect(updated[0].notes).toBe('Added note.');

    const deleted = deletePostmortemOutcomeRecord(storage, first[0].id);
    expect(deleted).toEqual([]);
  });
});

describe('postmortem session summary helpers', () => {
  it('builds compact summary from session outcomes', () => {
    const sessions = buildPostmortemSessions({
      journalEntries,
      warningFeedbackEntries,
      requestDiagnostics: diagnostics
    });

    const [firstTimelineEvent, secondTimelineEvent] = sessions[0].timeline;

    const summary = buildCompactPostmortemSummary(sessions[0], [
      {
        id: 'outcome-1',
        createdAt: '2026-05-20T11:00:00.000Z',
        eventId: firstTimelineEvent.id,
        tag: 'good-skip' as PostmortemOutcomeTag
      },
      {
        id: 'outcome-2',
        createdAt: '2026-05-20T11:00:01.000Z',
        eventId: secondTimelineEvent.id,
        tag: 'bad-entry' as PostmortemOutcomeTag
      }
    ]);

    expect(summary.eventCount).toBe(3);
    expect(summary.taggedEventCount).toBe(2);
    expect(summary.tagCounts['bad-entry']).toBe(1);
  });

  it('stores and reads summaries from local storage', () => {
    const storage = createStorage();
    const summary = {
      id: 'summary-1',
      generatedAt: '2026-05-20T12:00:00.000Z',
      sessionId: '2026-05-20',
      sessionLabel: '2026-05-20',
      compactSummary: 'Session compact summary',
      eventCount: 2,
      taggedEventCount: 1,
      tagCounts: {
        'good-skip': 1,
        'bad-entry': 0,
        'ignored-warning': 0,
        'followed-plan': 0,
        'note-for-next-time': 0
      },
      notableRisks: ['action:bad-entry']
    };

    const next = appendPostmortemSummary(storage, summary);

    expect(next).toHaveLength(1);
    expect(readPostmortemSummaries(storage)).toEqual(next);
    expect(serializePostmortemSummaries(next, 1)).toContain('"summary-1"');
  });

  it('keeps summary lists bounded', () => {
    const storage = createStorage();

    const summaries = Array.from({ length: POSTMORTEM_SUMMARY_LIMIT + 2 }).map((_, index) => ({
      id: `summary-${index}`,
      generatedAt: new Date(Date.UTC(2026, 4, 20, 10, 0, index)).toISOString(),
      sessionId: '2026-05-20',
      sessionLabel: '2026-05-20',
      compactSummary: `Summary ${index}`,
      eventCount: 1,
      taggedEventCount: 0,
      tagCounts: {
        'good-skip': 0,
        'bad-entry': 0,
        'ignored-warning': 0,
        'followed-plan': 0,
        'note-for-next-time': 0
      },
      notableRisks: []
    }));

    for (const summary of summaries) {
      appendPostmortemSummary(storage, summary);
    }

    expect(readPostmortemSummaries(storage)).toHaveLength(POSTMORTEM_SUMMARY_LIMIT);
  });
});
