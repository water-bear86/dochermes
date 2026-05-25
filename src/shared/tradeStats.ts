import type { TradeRecord } from './tradeRecord';

export type TradeDecisionOutcomeStats = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  skipped: number;
  unknown: number;
  winRate?: number;
  lossRate?: number;
};

export type TradeDecisionOutcomeSummary = {
  immediateEntry: TradeDecisionOutcomeStats;
  waitedConfirmation: TradeDecisionOutcomeStats;
  skipped: TradeDecisionOutcomeStats;
};

export type TradeBehaviorStats = {
  tradeCount: number;
  medianTradeSizeUsd?: number;
  maxRecentTradeSizeUsd?: number;
  recentLossStreak: number;
  tradesLastHour: number;
  tradesLastDay: number;
  decisionOutcomeStats: TradeDecisionOutcomeSummary;
  commonMistakeTags: Array<{ tag: string; count: number }>;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export function buildTradeBehaviorStats(trades: TradeRecord[], now = new Date()): TradeBehaviorStats {
  const sortedNewestFirst = [...trades].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const sizes = trades
    .map((trade) => trade.notionalUsd)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  const recentTrades = trades.filter((trade) => isWithin(trade.openedAt, now, ONE_DAY_MS));
  const recentSizes = recentTrades
    .map((trade) => trade.notionalUsd)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    tradeCount: trades.length,
    medianTradeSizeUsd: median(sizes),
    maxRecentTradeSizeUsd: recentSizes.length > 0 ? Math.max(...recentSizes) : undefined,
    recentLossStreak: countRecentLossStreak(sortedNewestFirst),
    tradesLastHour: trades.filter((trade) => isWithin(trade.openedAt, now, ONE_HOUR_MS)).length,
    tradesLastDay: recentTrades.length,
    decisionOutcomeStats: buildDecisionOutcomeStats(trades),
    commonMistakeTags: countCommonTags(trades)
  };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const midpoint = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[midpoint];
  }
  return (values[midpoint - 1] + values[midpoint]) / 2;
}

function isWithin(isoTimestamp: string, now: Date, windowMs: number): boolean {
  const timestamp = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  const age = now.getTime() - timestamp;
  return age >= 0 && age <= windowMs;
}

function countRecentLossStreak(sortedNewestFirst: TradeRecord[]): number {
  let streak = 0;
  for (const trade of sortedNewestFirst) {
    if (trade.outcome !== 'loss') {
      break;
    }
    streak += 1;
  }
  return streak;
}

function countCommonTags(trades: TradeRecord[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    for (const tag of trade.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function buildDecisionOutcomeStats(trades: TradeRecord[]): TradeDecisionOutcomeSummary {
  const summary: TradeDecisionOutcomeSummary = {
    immediateEntry: emptyDecisionOutcomeStats(),
    waitedConfirmation: emptyDecisionOutcomeStats(),
    skipped: emptyDecisionOutcomeStats()
  };

  for (const trade of trades) {
    const bucket =
      trade.decisionTiming === 'immediate-entry'
        ? summary.immediateEntry
        : trade.decisionTiming === 'waited-confirmation'
          ? summary.waitedConfirmation
          : trade.decisionTiming === 'skipped'
            ? summary.skipped
            : undefined;

    if (!bucket) {
      continue;
    }

    bucket.count += 1;
    switch (trade.outcome) {
      case 'win':
        bucket.wins += 1;
        break;
      case 'loss':
        bucket.losses += 1;
        break;
      case 'breakeven':
        bucket.breakeven += 1;
        break;
      case 'skipped':
        bucket.skipped += 1;
        break;
      default:
        bucket.unknown += 1;
        break;
    }
  }

  return {
    immediateEntry: withResolvedRates(summary.immediateEntry),
    waitedConfirmation: withResolvedRates(summary.waitedConfirmation),
    skipped: withResolvedRates(summary.skipped)
  };
}

function emptyDecisionOutcomeStats(): TradeDecisionOutcomeStats {
  return {
    count: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    skipped: 0,
    unknown: 0,
    winRate: undefined,
    lossRate: undefined
  };
}

function withResolvedRates(stats: TradeDecisionOutcomeStats): TradeDecisionOutcomeStats {
  const resolvedCount = stats.wins + stats.losses + stats.breakeven;
  if (resolvedCount === 0) {
    return stats;
  }

  return {
    ...stats,
    winRate: stats.wins / resolvedCount,
    lossRate: stats.losses / resolvedCount
  };
}
