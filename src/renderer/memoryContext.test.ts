import { describe, expect, it } from 'vitest';

import type { JournalEntry, WarningFeedbackRecord } from '../shared/types';
import { buildMemoryContext } from './memoryContext';

const earlyLossEntry: JournalEntry = {
  id: 'entry-early-loss',
  createdAt: '2026-05-18T21:00:00.000Z',
  question: 'Should I enter immediately?',
  response: 'Wait for confirmation before taking this.',
  notes: 'Early entry performed poorly and I oversized before support formed.',
  selectedWindow: {
    id: 'window:1',
    name: 'Trading Window',
    kind: 'window'
  },
  screenshot: {
    captured: true,
    imageStored: false
  }
};

const confirmationEntry: JournalEntry = {
  id: 'entry-confirmation',
  createdAt: '2026-05-18T22:00:00.000Z',
  question: 'Should I wait for confirmation?',
  response: 'Waiting reduced risk.',
  notes: 'Waited for confirmation and avoided the first drawdown.',
  selectedWindow: {
    id: 'window:1',
    name: 'Trading Window',
    kind: 'window'
  },
  screenshot: {
    captured: true,
    imageStored: false
  }
};

describe('buildMemoryContext', () => {
  it('matches early-entry questions against prior journal notes', () => {
    const context = buildMemoryContext([earlyLossEntry, confirmationEntry], 'Should I ape in immediately here?');

    expect(context.matchedPatterns).toEqual([
      {
        name: 'early-entry-risk',
        evidenceCount: 2,
        summary: 'This resembles prior notes where early entries performed poorly and waiting for confirmation reduced risk.',
        recommendation: 'Do not enter immediately. Set an alert and reassess after confirmation.'
      }
    ]);
  });

  it('keeps recent journal context compact and newest first', () => {
    const context = buildMemoryContext([earlyLossEntry, confirmationEntry], 'Review this setup');

    expect(context.recentNotes).toEqual([
      {
        createdAt: '2026-05-18T22:00:00.000Z',
        question: 'Should I wait for confirmation?',
        response: 'Waiting reduced risk.',
        notes: 'Waited for confirmation and avoided the first drawdown.',
        selectedWindowName: 'Trading Window'
      },
      {
        createdAt: '2026-05-18T21:00:00.000Z',
        question: 'Should I enter immediately?',
        response: 'Wait for confirmation before taking this.',
        notes: 'Early entry performed poorly and I oversized before support formed.',
        selectedWindowName: 'Trading Window'
      }
    ]);
  });

  it('adds compact trade behavior stats derived from local journal evidence', () => {
    const context = buildMemoryContext([earlyLossEntry, confirmationEntry], 'Review this setup');

    expect(context.tradeBehaviorStats).toMatchObject({
      tradeCount: 2,
      recentLossStreak: 0,
      commonMistakeTags: [
        { tag: 'confirmation-plan', count: 2 },
        { tag: 'early-entry', count: 1 },
        { tag: 'oversized', count: 1 }
      ]
    });
  });

  it('does not invent patterns when journal evidence is absent', () => {
    const context = buildMemoryContext([], 'Should I enter immediately?');

    expect(context.matchedPatterns).toEqual([]);
    expect(context.tradeBehaviorStats).toBeUndefined();
    expect(context.recentNotes).toEqual([]);
  });

  it('suppresses early-entry pattern matching for false-positive feedback', () => {
    const feedback: WarningFeedbackRecord[] = [
      {
        id: 'feedback-1',
        createdAt: '2026-05-19T20:01:00.000Z',
        warningText: 'This resembles prior early-entry risk patterns; set a confirmation plan before acting.',
        action: 'false-positive',
        question: 'Should I enter immediately? ',
        response: 'Wait for confirmation.',
        selectedWindowName: 'Trading Window',
        selectedWindowId: 'window:1',
        selectedWindowKind: 'window'
      }
    ];

    const context = buildMemoryContext([earlyLossEntry], 'Should I enter immediately?', feedback);

    expect(context.matchedPatterns).toEqual([]);
  });

  it('keeps pattern matching when no false-positive feedback exists', () => {
    const context = buildMemoryContext([earlyLossEntry], 'Should I enter immediately?');

    expect(context.matchedPatterns.length).toBe(1);
    expect(context.matchedPatterns[0].name).toBe('early-entry-risk');
  });
});
