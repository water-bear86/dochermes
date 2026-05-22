import { describe, expect, it } from 'vitest';

import type { TradeRecord } from './tradeRecord';
import { buildTradeBehaviorStats } from './tradeStats';

const baseTrade = (overrides: Partial<TradeRecord>): TradeRecord => ({
  id: 'trade-1',
  source: 'manual',
  openedAt: '2026-05-20T00:00:00.000Z',
  assetLabel: 'SOL',
  side: 'long',
  rawRef: 'trade-1',
  ...overrides
});

describe('buildTradeBehaviorStats', () => {
  it('derives compact local behavior stats from normalized trades', () => {
    const stats = buildTradeBehaviorStats(
      [
        baseTrade({ id: 'old-win', openedAt: '2026-05-18T12:00:00.000Z', notionalUsd: 25, outcome: 'win', tags: ['chased'] }),
        baseTrade({ id: 'loss-1', openedAt: '2026-05-20T11:00:00.000Z', notionalUsd: 100, outcome: 'loss', tags: ['chased'] }),
        baseTrade({ id: 'loss-2', openedAt: '2026-05-20T11:30:00.000Z', notionalUsd: 300, outcome: 'loss', tags: ['oversized'] }),
        baseTrade({ id: 'loss-3', openedAt: '2026-05-20T11:45:00.000Z', notionalUsd: 200, outcome: 'loss', tags: ['chased'] })
      ],
      new Date('2026-05-20T12:00:00.000Z')
    );

    expect(stats).toEqual({
      tradeCount: 4,
      medianTradeSizeUsd: 150,
      maxRecentTradeSizeUsd: 300,
      recentLossStreak: 3,
      tradesLastHour: 3,
      tradesLastDay: 3,
      commonMistakeTags: [
        { tag: 'chased', count: 3 },
        { tag: 'oversized', count: 1 }
      ]
    });
  });

  it('returns zeroed stats for empty trade history', () => {
    expect(buildTradeBehaviorStats([], new Date('2026-05-20T12:00:00.000Z'))).toEqual({
      tradeCount: 0,
      medianTradeSizeUsd: undefined,
      maxRecentTradeSizeUsd: undefined,
      recentLossStreak: 0,
      tradesLastHour: 0,
      tradesLastDay: 0,
      commonMistakeTags: []
    });
  });
});
