import type { JournalEntry, TradeHistorySummary } from '../shared/types';

const TRADE_SIZE_PATTERN =
  /(?:\b(?:size|alloc|allocating|risk|position|amount|qty)?\s*[:=]?\s*)(\d+(?:\.\d+)?)\s*(sol|usdc|usdt|usdc\.e|usdt\.e|eth|weth|btc|wbtc|bnb|arb|usd|usde|sui)\b/gi;
const LOSS_KEYWORDS = /(?:loss|losses|lost|oversized|drawdown|bad|negative|drop|dump)/i;
const GAIN_KEYWORDS = /(?:gain|gains|won|positive|profit|targeted)/i;
const LAST_HOUR_MS = 60 * 60 * 1000;
const LAST_DAY_MS = 24 * LAST_HOUR_MS;

interface ParsedTradeEntry {
  createdAt: string;
  size?: {
    value: number;
    unit: string;
  };
  lossPercent?: number;
}

export function buildTradeHistorySummary(entries: JournalEntry[], now = new Date()): TradeHistorySummary {
  const parsedEntries = entries
    .map((entry) => parseJournalTradeEntry(entry))
    .filter((entry): entry is ParsedTradeEntry => Boolean(entry.createdAt))
    .sort((left, right) => new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf());

  const nowMs = now.valueOf();
  const byUnit: Map<string, number[]> = new Map();
  let recentLossStreak = 0;

  for (const entry of parsedEntries) {
    const parsedSize = entry.size;
    if (parsedSize) {
      const list = byUnit.get(parsedSize.unit) ?? [];
      list.push(parsedSize.value);
      byUnit.set(parsedSize.unit, list);
    }
  }

  for (const entry of parsedEntries) {
    if (entry.lossPercent === undefined) {
      break;
    }

    if (entry.lossPercent > 0) {
      recentLossStreak += 1;
      continue;
    }

    break;
  }

  const sizeSignals = [...byUnit.entries()]
    .map(([unit, values]) => ({
      unit,
      medianSize: median(values) ?? 0,
      maxSize: Math.max(...values),
      sampleCount: values.length
    }))
    .filter((signal) => signal.sampleCount > 0)
    .sort((left, right) => right.sampleCount - left.sampleCount || right.maxSize - left.maxSize);

  const tradesLastHour = parsedEntries.filter((entry) => {
    const startedAt = new Date(entry.createdAt).valueOf();
    return Number.isFinite(startedAt) && nowMs - startedAt <= LAST_HOUR_MS;
  }).length;

  const tradesLastDay = parsedEntries.filter((entry) => {
    const startedAt = new Date(entry.createdAt).valueOf();
    return Number.isFinite(startedAt) && nowMs - startedAt <= LAST_DAY_MS;
  }).length;

  return {
    totalTrades: parsedEntries.length,
    tradesLastHour,
    tradesLastDay,
    recentLossStreak,
    sizeSignals
  };
}

function parseJournalTradeEntry(entry: JournalEntry): ParsedTradeEntry {
  return {
    createdAt: entry.createdAt,
    size: parseTradeSize(`${entry.question} ${entry.response} ${entry.notes}`),
    lossPercent: parseLossPercent(`${entry.question} ${entry.response} ${entry.notes}`)
  };
}

function parseLossPercent(text: string): number | undefined {
  const lower = text.toLowerCase();
  const matches = [...lower.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)];
  if (matches.length === 0) {
    return undefined;
  }

  for (const match of matches) {
    const raw = match[1];
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      continue;
    }

    const index = match.index ?? 0;
    const context = lower.slice(Math.max(0, index - 60), Math.min(lower.length, index + 80));
    const looksLikeLoss = LOSS_KEYWORDS.test(context) || value < 0;
    const looksLikeGain = GAIN_KEYWORDS.test(context);

    if (looksLikeLoss && !looksLikeGain) {
      return Math.abs(value);
    }
  }

  return undefined;
}

function parseTradeSize(text: string): { value: number; unit: string } | undefined {
  const normalized = text.toLowerCase();
  const matches = [...normalized.matchAll(TRADE_SIZE_PATTERN)];
  if (matches.length === 0) {
    return undefined;
  }

  const firstMatch = matches[0];
  const rawValue = firstMatch[1];
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return {
    value: parsed,
    unit: normalizeUnit(firstMatch[2])
  };
}

function normalizeUnit(rawUnit: string): string {
  const unit = rawUnit.toLowerCase();
  if (unit === 'usdc.e' || unit === 'usdt.e') {
    return unit.replace('.', '');
  }

  return unit;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
