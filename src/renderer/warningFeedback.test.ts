import { describe, expect, it } from 'vitest';

import type { WarningFeedbackAction, WindowSourceOption } from '../shared/types';

import {
  appendWarningFeedback,
  buildWarningFeedback,
  clearWarningFeedbackEntries,
  deleteWarningFeedback,
  parseWarningFeedbackEntries,
  readWarningFeedbackEntries,
  serializeWarningFeedbackEntries,
  updateWarningFeedback,
  WARNING_FEEDBACK_KEY,
  WARNING_FEEDBACK_LIMIT
} from './warningFeedback';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createMemoryStorage = (): LocalStorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    }
  };
};

describe('parseWarningFeedbackEntries', () => {
  it('returns entries ordered newest-first and drops malformed values', () => {
    const parsed = parseWarningFeedbackEntries(
      JSON.stringify([
        {
          id: 'old',
          createdAt: '2026-05-19T20:00:00.000Z',
          warningText: 'Immediate-entry question detected.',
          action: 'skipped',
          question: 'Should I enter now?',
          response: 'Wait first.',
          selectedWindowName: 'Trading Window',
          selectedWindowId: 'window:1',
          selectedWindowKind: 'window'
        },
        {
          nope: true
        },
        {
          id: 'new',
          createdAt: '2026-05-19T22:00:00.000Z',
          warningText: 'Immediate-entry question detected.',
          action: 'took-it-anyway',
          question: 'Enter now?',
          response: 'Maybe go all-in.',
          selectedWindowName: 'Trading Window',
          selectedWindowId: 'window:1',
          selectedWindowKind: 'window'
        }
      ])
    );

    expect(parsed.map((entry) => entry.id)).toEqual(['new', 'old']);
  });
});

describe('buildWarningFeedback', () => {
  it('builds a compact warning feedback record', () => {
    const source: WindowSourceOption = {
      id: 'window:1',
      name: 'Main Terminal',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,noop'
    };

    const record = buildWarningFeedback(
      {
        warningText: 'Immediate-entry risk warning',
        action: 'false-positive' as WarningFeedbackAction,
        question: 'Should I enter now?',
        response: 'Wait for confirmation.',
        selectedWindow: source,
        requestId: 'req-1',
        notes: 'Reviewed manually.'
      },
      {
        now: () => new Date('2026-05-20T00:00:00.000Z'),
        createId: () => 'feedback-1'
      }
    );

    expect(record).toEqual({
      id: 'feedback-1',
      createdAt: '2026-05-20T00:00:00.000Z',
      requestId: 'req-1',
      warningText: 'Immediate-entry risk warning',
      action: 'false-positive',
      question: 'Should I enter now?',
      response: 'Wait for confirmation.',
      selectedWindowName: 'Main Terminal',
      selectedWindowId: 'window:1',
      selectedWindowKind: 'window',
      notes: 'Reviewed manually.'
    });
  });
});

describe('warning feedback persistence helpers', () => {
  it('appends, updates, and deletes warning feedback entries', () => {
    const storage = createMemoryStorage();
    const source: WindowSourceOption = {
      id: 'window:1',
      name: 'Main Terminal',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,noop'
    };

    const first = appendWarningFeedback(storage, {
      warningText: 'Immediate-entry risk warning',
      action: 'skipped',
      question: 'Should I enter now?',
      response: 'Wait for confirmation.',
      selectedWindow: source
    });

    const second = appendWarningFeedback(storage, {
      warningText: 'Immediate-entry risk warning',
      action: 'followed-plan',
      question: 'What about token X now?',
      response: 'Set an alert.',
      selectedWindow: source
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[0].id).not.toBe(second[1].id);

    const updated = updateWarningFeedback(storage, second[0].id, {
      action: 'false-positive',
      notes: 'Context was actually fine.'
    });
    const maybeUpdated = updated.find((entry) => entry.id === second[0].id);

    expect(maybeUpdated?.action).toBe('false-positive');
    expect(maybeUpdated?.notes).toBe('Context was actually fine.');
    expect(maybeUpdated?.updatedAt).toBeDefined();

    const deleted = deleteWarningFeedback(storage, second[0].id);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].action).toBe('skipped');
  });

  it('keeps a bounded list in serialization', () => {
    const first = new Date('2026-05-20T00:00:00.000Z');
    const source: WindowSourceOption = {
      id: 'window:1',
      name: 'Main Terminal',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,noop'
    };
    const entries = Array.from({ length: WARNING_FEEDBACK_LIMIT + 2 }).map((_, index) => {
      const value = index + 1;
      return {
        id: `entry-${value}`,
        createdAt: new Date(first.getTime() + value).toISOString(),
        warningText: 'Immediate-entry risk warning',
        action: 'skipped' as WarningFeedbackAction,
        question: 'Should I enter now?',
        response: 'Wait.',
        selectedWindowName: 'Main Terminal',
        selectedWindowId: 'window:1',
        selectedWindowKind: 'window' as const
      };
    });

    expect(serializeWarningFeedbackEntries(entries, 2).match(/entry-/g)?.length).toBe(2);
  });

  it('reads entries through storage helper', () => {
    const storage = createMemoryStorage();
    const source: WindowSourceOption = {
      id: 'window-1',
      name: 'Main',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,noop'
    };

    appendWarningFeedback(storage, {
      warningText: 'Immediate-entry risk warning',
      action: 'added-note',
      question: 'Should I enter now?',
      response: 'Confirmed.',
      selectedWindow: source,
      notes: 'Observed a clean reclaim.'
    });
    const read = readWarningFeedbackEntries(storage);
    expect(read).toHaveLength(1);
  });

  it('clears all local warning feedback entries', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      WARNING_FEEDBACK_KEY,
      serializeWarningFeedbackEntries([
        {
          id: 'entry-1',
          createdAt: '2026-05-20T00:00:00.000Z',
          warningText: 'Immediate-entry risk warning',
          action: 'skipped',
          question: 'Should I enter now?',
          response: 'Wait.',
          selectedWindowName: 'Main Terminal',
          selectedWindowId: 'window:1',
          selectedWindowKind: 'window'
        }
      ])
    );

    expect(clearWarningFeedbackEntries(storage)).toEqual([]);
    expect(storage.getItem(WARNING_FEEDBACK_KEY)).toBeNull();
  });
});
