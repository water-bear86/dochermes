import type { JournalEntry, TradeHistorySummary, TradeRecord } from '../shared/types';

export const IMPORTED_TRADE_RECORDS_KEY = 'hermes.imported.trade.records.v1';
export const IMPORTED_TRADE_RECORD_LIMIT = 500;

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

export function buildTradeHistorySummary(
  entries: JournalEntry[],
  now = new Date(),
  importedRecords: TradeRecord[] = []
): TradeHistorySummary {
  const parsedEntries = [
    ...entries.map((entry) => parseJournalTradeEntry(entry)),
    ...importedRecords.map((entry) => parseImportedTradeEntry(entry))
  ]
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
    importedTrades: importedRecords.length,
    tradesLastHour,
    tradesLastDay,
    recentLossStreak,
    sizeSignals
  };
}

export function parseImportedTradeRecordsCsv(csvText: string, source: TradeRecord['source'] = 'csv'): TradeRecord[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const createdAtIndex = findHeaderIndex(headers, ['timestamp', 'created_at', 'createdat', 'time', 'date']);
  if (createdAtIndex === -1) {
    return [];
  }

  const sizeIndex = findHeaderIndex(headers, ['size', 'amount', 'qty', 'quantity', 'position_size', 'position size']);
  const unitIndex = findHeaderIndex(headers, ['unit', 'symbol', 'currency']);
  const pnlIndex = findHeaderIndex(headers, ['pnl_percent', 'pnl %', 'result_percent', 'loss_percent', 'pnl']);
  const tokenIndex = findHeaderIndex(headers, ['token', 'address', 'contract', 'pair']);

  const records: TradeRecord[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const rawCreatedAt = cells[createdAtIndex]?.trim();
    if (!rawCreatedAt) {
      continue;
    }

    const createdAt = normalizeTimestamp(rawCreatedAt);
    if (!createdAt) {
      continue;
    }

    const rawSizeValue = sizeIndex >= 0 ? cells[sizeIndex]?.trim() : undefined;
    const rawUnitValue = unitIndex >= 0 ? cells[unitIndex]?.trim() : undefined;
    const parsedSize = parseCsvSize(rawSizeValue, rawUnitValue);
    const lossPercent = parseCsvLossPercent(pnlIndex >= 0 ? cells[pnlIndex] : undefined);
    const tokenHint = tokenIndex >= 0 ? sanitizeTokenHint(cells[tokenIndex]) : undefined;

    records.push({
      id: `${source}-${createdAt}-${records.length}`,
      createdAt,
      source,
      ...(parsedSize ? { size: parsedSize } : {}),
      ...(lossPercent !== undefined ? { lossPercent } : {}),
      ...(tokenHint ? { tokenHint } : {})
    });
  }

  return records.slice(0, IMPORTED_TRADE_RECORD_LIMIT);
}

export function readImportedTradeRecords(storage: Pick<Storage, 'getItem'>): TradeRecord[] {
  const raw = storage.getItem(IMPORTED_TRADE_RECORDS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isTradeRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, IMPORTED_TRADE_RECORD_LIMIT);
  } catch {
    return [];
  }
}

export function writeImportedTradeRecords(storage: Pick<Storage, 'setItem'>, records: TradeRecord[]): TradeRecord[] {
  const normalized = records
    .filter(isTradeRecord)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, IMPORTED_TRADE_RECORD_LIMIT);

  storage.setItem(IMPORTED_TRADE_RECORDS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function replaceImportedTradeRecordsFromCsv(
  storage: Pick<Storage, 'setItem'>,
  csvText: string,
  source: TradeRecord['source'] = 'csv'
): TradeRecord[] {
  const parsed = parseImportedTradeRecordsCsv(csvText, source);
  return writeImportedTradeRecords(storage, parsed);
}

function parseJournalTradeEntry(entry: JournalEntry): ParsedTradeEntry {
  return {
    createdAt: entry.createdAt,
    size: parseTradeSize(`${entry.question} ${entry.response} ${entry.notes}`),
    lossPercent: parseLossPercent(`${entry.question} ${entry.response} ${entry.notes}`)
  };
}

function parseImportedTradeEntry(entry: TradeRecord): ParsedTradeEntry {
  return {
    createdAt: entry.createdAt,
    size: entry.size,
    lossPercent: entry.lossPercent
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

export interface ParsedTradeSize {
  value: number;
  unit: string;
}

export function parseTradeSize(text: string): ParsedTradeSize | undefined {
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

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.findIndex((entry) => entry === candidate);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function normalizeTimestamp(input: string): string | undefined {
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.valueOf())) {
    return undefined;
  }

  return parsed.toISOString();
}

function parseCsvSize(sizeValue: string | undefined, unitValue: string | undefined): TradeRecord['size'] | undefined {
  if (!sizeValue) {
    return undefined;
  }

  const compact = sizeValue.replace(/,/g, ' ').trim();
  const parsed = Number(compact);
  if (Number.isFinite(parsed) && parsed > 0) {
    const unit = unitValue ? normalizeUnit(unitValue) : 'unknown';
    return {
      value: parsed,
      unit
    };
  }

  const embedded = parseTradeSize(compact);
  if (!embedded) {
    return undefined;
  }

  return embedded;
}

function parseCsvLossPercent(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace('%', '').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (parsed >= 0) {
    return undefined;
  }

  return Math.abs(parsed);
}

function sanitizeTokenHint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : undefined;
}

function isTradeRecord(value: unknown): value is TradeRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as TradeRecord;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    (candidate.source !== 'journal' && candidate.source !== 'csv' && candidate.source !== 'wallet')
  ) {
    return false;
  }

  if (candidate.size) {
    if (
      typeof candidate.size.value !== 'number' ||
      !Number.isFinite(candidate.size.value) ||
      typeof candidate.size.unit !== 'string'
    ) {
      return false;
    }
  }

  if (candidate.lossPercent !== undefined) {
    if (typeof candidate.lossPercent !== 'number' || !Number.isFinite(candidate.lossPercent)) {
      return false;
    }
  }

  if (candidate.tokenHint !== undefined && typeof candidate.tokenHint !== 'string') {
    return false;
  }

  return true;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
