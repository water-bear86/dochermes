import { describe, expect, it } from 'vitest';

import type { MemoryContext } from './types';
import { createEmptyMemoryContext, hasMemoryContextContent } from './memoryModel';

describe('shared memory model helpers', () => {
  it('treats the empty memory context as no content', () => {
    expect(createEmptyMemoryContext()).toEqual({
      matchedPatterns: [],
      recentNotes: []
    });

    expect(hasMemoryContextContent(createEmptyMemoryContext())).toBe(false);
  });

  it('detects content across every compact memory category', () => {
    const base = createEmptyMemoryContext();

    const cases: MemoryContext[] = [
      {
        ...base,
        matchedPatterns: [
          {
            name: 'early-entry',
            evidenceCount: 2,
            summary: 'Immediate entries performed poorly.',
            recommendation: 'Wait for confirmation.'
          }
        ]
      },
      {
        ...base,
        recentNotes: [
          {
            createdAt: '2026-05-25T10:00:00.000Z',
            question: 'Should I enter?',
            response: 'Wait.',
            notes: 'Skipped.',
            selectedWindowName: 'Trading Desk'
          }
        ]
      },
      {
        ...base,
        tradeHistorySummary: {
          totalTrades: 1,
          importedTrades: 0,
          walletTrades: 0,
          tradesLastHour: 0,
          tradesLastDay: 1,
          recentLossStreak: 0,
          sizeSignals: []
        }
      },
      {
        ...base,
        postmortemSummaries: [
          {
            id: 'summary-1',
            generatedAt: '2026-05-25T10:00:00.000Z',
            sessionId: 'session-1',
            sessionLabel: 'May 25',
            compactSummary: 'Waited for confirmation.',
            eventCount: 1,
            taggedEventCount: 1,
            tagCounts: {
              'good-skip': 0,
              'bad-entry': 0,
              'ignored-warning': 0,
              'followed-plan': 1,
              'note-for-next-time': 0
            },
            notableRisks: []
          }
        ]
      },
      {
        ...base,
        personalRules: {
          totalRules: 1,
          activeRules: 1,
          matchedRules: [
            {
              ruleId: 'rule-1',
              text: 'No oversized early entries',
              policyLevel: 'guardrail',
              warningText: 'Personal rule matched.',
              source: 'Personal rules',
              detail: 'Rule text matched the question.',
              confidence: 'high',
              provenance: 'local'
            }
          ]
        }
      }
    ];

    expect(cases.every((memoryContext) => hasMemoryContextContent(memoryContext))).toBe(true);
  });
});
