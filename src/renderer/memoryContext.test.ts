import { describe, expect, it } from 'vitest';

import type { JournalEntry, MemoryPostmortemSummary, WarningFeedbackRecord } from '../shared/types';
import { buildMemoryContext, withoutCompactTradeSummary } from './memoryContext';

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

const waitedWinEntry: JournalEntry = {
  id: 'entry-waited-win',
  createdAt: '2026-05-19T01:00:00.000Z',
  question: 'Should I wait for confirmation?',
  response: 'Waited for confirmation, then entered.',
  notes: 'The confirmation entry worked and closed green.',
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

const skippedDrawdownEntry: JournalEntry = {
  id: 'entry-skipped-drawdown',
  createdAt: '2026-05-19T02:00:00.000Z',
  question: 'Should I skip this early move?',
  response: 'Passed on the trade.',
  notes: 'Skipped the entry and avoided the drawdown.',
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

const oversizedAfterLossEntry: JournalEntry = {
  id: 'entry-oversized-after-loss',
  createdAt: '2026-05-18T23:00:00.000Z',
  question: 'Should I size up after that loss?',
  response: 'Keep size flat after a loss.',
  notes: 'After the losing trade I increased allocation, went too big, and took another drawdown.',
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

const chasingEntry: JournalEntry = {
  id: 'entry-chasing',
  createdAt: '2026-05-19T00:00:00.000Z',
  question: 'Should I buy this pump?',
  response: 'Do not chase a moving candle without a pullback.',
  notes: 'FOMO entry after the move was extended turned into a bad loss.',
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

const postmortemSummary: MemoryPostmortemSummary = {
  id: 'summary-1',
  generatedAt: '2026-05-20T12:00:00.000Z',
  sessionId: '2026-05-18',
  sessionLabel: '2026-05-18',
  compactSummary: 'Session compact summary',
  eventCount: 3,
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

  it('matches oversized allocation questions after prior loss-size mistakes', () => {
    const context = buildMemoryContext(
      [oversizedAfterLossEntry, earlyLossEntry],
      'I just lost. Should I increase allocation to make it back?'
    );

    expect(context.matchedPatterns).toEqual([
      {
        name: 'oversized-after-loss-risk',
        evidenceCount: 2,
        summary: 'Prior notes link losses with oversized allocation or too-big follow-up trades.',
        recommendation: 'Keep size capped after losses; wait for a clean setup instead of increasing allocation.'
      }
    ]);
  });

  it('matches chasing questions against prior FOMO losses', () => {
    const context = buildMemoryContext([chasingEntry], 'This token is pumping. Should I chase the breakout now?');

    expect(context.matchedPatterns).toEqual([
      {
        name: 'chasing-fomo-risk',
        evidenceCount: 1,
        summary: 'Prior notes link chasing fast moves or FOMO entries with poor outcomes.',
        recommendation: 'Do not chase the move. Define a pullback or confirmation condition before considering entry.'
      }
    ]);
  });

  it('does not match size or FOMO patterns when the current question is unrelated', () => {
    const context = buildMemoryContext(
      [oversizedAfterLossEntry, chasingEntry],
      'Review my saved notes from yesterday'
    );

    expect(context.matchedPatterns).toEqual([]);
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
    const context = buildMemoryContext(
      [earlyLossEntry, confirmationEntry, waitedWinEntry, skippedDrawdownEntry],
      'Review this setup'
    );

    expect(context.tradeBehaviorStats).toMatchObject({
      tradeCount: 4,
      recentLossStreak: 0,
      decisionOutcomeStats: {
        immediateEntry: {
          count: 1,
          wins: 0,
          losses: 1,
          breakeven: 0,
          skipped: 0,
          unknown: 0,
          winRate: 0,
          lossRate: 1
        },
        waitedConfirmation: {
          count: 2,
          wins: 1,
          losses: 0,
          breakeven: 0,
          skipped: 0,
          unknown: 1,
          winRate: 1,
          lossRate: 0
        },
        skipped: {
          count: 1,
          wins: 0,
          losses: 0,
          breakeven: 0,
          skipped: 1,
          unknown: 0,
          winRate: undefined,
          lossRate: undefined
        }
      },
      commonMistakeTags: [
        { tag: 'confirmation-plan', count: 3 },
        { tag: 'early-entry', count: 2 },
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

  it('strips compact trade stats and trade history when the Hermes sharing toggle is off', () => {
    const context = buildMemoryContext([earlyLossEntry, waitedWinEntry], 'Review this setup');

    expect(context.tradeBehaviorStats).toBeDefined();
    expect(context.tradeHistorySummary).toBeDefined();
    expect(withoutCompactTradeSummary(context)).toEqual({
      matchedPatterns: [],
      recentNotes: context.recentNotes
    });
  });

  it('includes recent postmortem summaries in memory context', () => {
    const context = buildMemoryContext([earlyLossEntry], 'Should I enter immediately?', [], [postmortemSummary]);

    expect(context.postmortemSummaries).toEqual([postmortemSummary]);
    expect(context.tradeHistorySummary?.totalTrades).toBe(1);
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
