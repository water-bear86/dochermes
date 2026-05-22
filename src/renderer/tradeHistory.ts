import type { JournalEntry, TradeHistorySummary, TradeRecord } from '../shared/types';

export const IMPORTED_TRADE_RECORDS_KEY = 'hermes.imported.trade.records.v1';
export const WALLET_TRADE_RECORDS_KEY = 'hermes.wallet.trade.records.v1';
export const IMPORTED_TRADE_RECORD_LIMIT = 500;
export const WALLET_SYNC_RECORD_LIMIT = 500;
export const SOLANA_LAMPORTS_PER_SOL = 1_000_000_000;
export const DEFAULT_WALLET_RPC_URL = 'https://api.mainnet-beta.solana.com';

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

export interface WalletSyncProviderStatus {
  address: string;
  chain: 'solana' | 'evm' | 'unknown';
  status: 'synced' | 'unsupported' | 'error';
  records: number;
  detail?: string;
}

export interface WalletSyncResult {
  fetchedAt: string;
  records: TradeRecord[];
  statuses: WalletSyncProviderStatus[];
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

  const importedTrades = importedRecords.filter((entry) => entry.source === 'csv').length;
  const walletTrades = importedRecords.filter((entry) => entry.source === 'wallet').length;

  return {
    totalTrades: parsedEntries.length,
    importedTrades,
    walletTrades,
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

export function readWalletTradeRecords(storage: Pick<Storage, 'getItem'>): TradeRecord[] {
  const raw = storage.getItem(WALLET_TRADE_RECORDS_KEY);
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
      .filter((entry) => entry.source === 'wallet')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, WALLET_SYNC_RECORD_LIMIT);
  } catch {
    return [];
  }
}

export function writeWalletTradeRecords(storage: Pick<Storage, 'setItem'>, records: TradeRecord[]): TradeRecord[] {
  const normalized = records
    .filter(isTradeRecord)
    .filter((entry) => entry.source === 'wallet')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, WALLET_SYNC_RECORD_LIMIT);

  storage.setItem(WALLET_TRADE_RECORDS_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function syncWalletTradeRecords(options: {
  addresses: string[];
  fetchImpl?: typeof fetch;
  rpcUrl?: string;
  limitPerAddress?: number;
  now?: Date;
}): Promise<WalletSyncResult> {
  const {
    addresses,
    fetchImpl = fetch,
    rpcUrl = DEFAULT_WALLET_RPC_URL,
    limitPerAddress = 8,
    now = new Date()
  } = options;
  const normalizedAddresses = [...new Set(addresses.map((entry) => entry.trim()).filter(Boolean))].slice(0, 12);
  const statuses: WalletSyncProviderStatus[] = [];
  const records: TradeRecord[] = [];

  for (const address of normalizedAddresses) {
    if (isLikelySolanaAddress(address)) {
      try {
        const nextRecords = await fetchSolanaWalletTradeRecords({
          address,
          fetchImpl,
          rpcUrl,
          limit: limitPerAddress
        });
        records.push(...nextRecords);
        statuses.push({
          address,
          chain: 'solana',
          status: 'synced',
          records: nextRecords.length
        });
      } catch (error) {
        statuses.push({
          address,
          chain: 'solana',
          status: 'error',
          records: 0,
          detail: error instanceof Error ? error.message : 'Unknown Solana sync error.'
        });
      }
      continue;
    }

    if (isLikelyEvmAddress(address)) {
      statuses.push({
        address,
        chain: 'evm',
        status: 'unsupported',
        records: 0,
        detail: 'EVM wallet history provider is not configured in this MVP.'
      });
      continue;
    }

    statuses.push({
      address,
      chain: 'unknown',
      status: 'unsupported',
      records: 0,
      detail: 'Address format is not recognized as Solana or EVM.'
    });
  }

  const uniqueById = new Map<string, TradeRecord>();
  for (const record of records) {
    uniqueById.set(record.id, record);
  }

  const normalizedRecords = [...uniqueById.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, WALLET_SYNC_RECORD_LIMIT);

  return {
    fetchedAt: now.toISOString(),
    records: normalizedRecords,
    statuses
  };
}

async function fetchSolanaWalletTradeRecords(options: {
  address: string;
  fetchImpl: typeof fetch;
  rpcUrl: string;
  limit: number;
}): Promise<TradeRecord[]> {
  const { address, fetchImpl, rpcUrl, limit } = options;
  const signaturesResponse = await requestSolanaRpc<{
    signature: string;
    blockTime?: number;
  }[]>({
    fetchImpl,
    rpcUrl,
    method: 'getSignaturesForAddress',
    params: [address, { limit: clampInteger(limit, 1, 20) }]
  });

  const signatures = Array.isArray(signaturesResponse) ? signaturesResponse.slice(0, limit) : [];
  if (signatures.length === 0) {
    return [];
  }

  const records: TradeRecord[] = [];
  for (const signatureEntry of signatures) {
    const signature = signatureEntry.signature?.trim();
    if (!signature) {
      continue;
    }

    const transaction = await requestSolanaRpc<SolanaTransactionPayload | null>({
      fetchImpl,
      rpcUrl,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
    });
    const record = buildSolanaWalletTradeRecord(address, signature, signatureEntry.blockTime, transaction);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

interface SolanaTransactionPayload {
  blockTime?: number | null;
  meta?: {
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: SolanaTokenBalance[];
    postTokenBalances?: SolanaTokenBalance[];
  } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string | null }>;
    } | null;
  } | null;
}

interface SolanaTokenBalance {
  owner?: string;
  mint?: string;
  uiTokenAmount?: {
    amount?: string;
    decimals?: number;
  };
}

function buildSolanaWalletTradeRecord(
  address: string,
  signature: string,
  signatureBlockTime: number | undefined,
  payload: SolanaTransactionPayload | null
): TradeRecord | undefined {
  if (!payload || !payload.meta || !payload.transaction?.message?.accountKeys) {
    return undefined;
  }

  const accountKeys = payload.transaction.message.accountKeys
    .map((entry) => (typeof entry === 'string' ? entry : entry?.pubkey ?? ''))
    .filter(Boolean);
  const accountIndex = accountKeys.findIndex((entry) => entry === address);
  if (accountIndex === -1) {
    return undefined;
  }

  const preBalances = payload.meta.preBalances ?? [];
  const postBalances = payload.meta.postBalances ?? [];
  const preLamports = preBalances[accountIndex];
  const postLamports = postBalances[accountIndex];
  if (!Number.isFinite(preLamports) || !Number.isFinite(postLamports)) {
    return undefined;
  }

  const deltaLamports = (postLamports as number) - (preLamports as number);
  const absSol = Math.abs(deltaLamports / SOLANA_LAMPORTS_PER_SOL);
  if (absSol < 0.0001) {
    return undefined;
  }

  const createdAt = normalizeTimestamp(
    Number.isFinite(payload.blockTime) && payload.blockTime
      ? new Date((payload.blockTime as number) * 1000).toISOString()
      : Number.isFinite(signatureBlockTime)
        ? new Date((signatureBlockTime as number) * 1000).toISOString()
        : new Date().toISOString()
  );
  if (!createdAt) {
    return undefined;
  }

  const tokenHint = deriveWalletTokenHint(address, payload.meta.preTokenBalances, payload.meta.postTokenBalances);

  return {
    id: `wallet-solana-${address}-${signature}`,
    createdAt,
    source: 'wallet',
    size: {
      value: Number(absSol.toFixed(6)),
      unit: 'sol'
    },
    ...(tokenHint ? { tokenHint } : {})
  };
}

function deriveWalletTokenHint(
  owner: string,
  preTokenBalances: SolanaTokenBalance[] = [],
  postTokenBalances: SolanaTokenBalance[] = []
): string | undefined {
  const changeByMint = new Map<string, number>();
  const accumulate = (balances: SolanaTokenBalance[], multiplier: -1 | 1): void => {
    for (const balance of balances) {
      if (balance.owner !== owner) {
        continue;
      }

      const mint = balance.mint?.trim();
      if (!mint) {
        continue;
      }

      const rawAmount = balance.uiTokenAmount?.amount ?? '0';
      const decimals = Number(balance.uiTokenAmount?.decimals ?? 0);
      const numericAmount = Number(rawAmount);
      if (!Number.isFinite(numericAmount)) {
        continue;
      }

      const normalizedAmount = numericAmount / Math.pow(10, Number.isFinite(decimals) ? decimals : 0);
      const current = changeByMint.get(mint) ?? 0;
      changeByMint.set(mint, current + normalizedAmount * multiplier);
    }
  };

  accumulate(preTokenBalances, -1);
  accumulate(postTokenBalances, 1);

  let selectedMint: string | undefined;
  let selectedMagnitude = 0;
  for (const [mint, change] of changeByMint.entries()) {
    const magnitude = Math.abs(change);
    if (magnitude > selectedMagnitude) {
      selectedMagnitude = magnitude;
      selectedMint = mint;
    }
  }

  return selectedMint;
}

async function requestSolanaRpc<T>(options: {
  fetchImpl: typeof fetch;
  rpcUrl: string;
  method: string;
  params: unknown[];
}): Promise<T> {
  const { fetchImpl, rpcUrl, method, params } = options;
  const response = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `dochermes-${method}`,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`Solana RPC ${method} request failed with status ${response.status}.`);
  }

  const body = await response.json() as {
    result?: T;
    error?: {
      message?: string;
    };
  };

  if (body.error) {
    throw new Error(body.error.message ?? `Solana RPC ${method} returned an error.`);
  }

  if (typeof body.result === 'undefined') {
    throw new Error(`Solana RPC ${method} did not return a result.`);
  }

  return body.result;
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

function isLikelyEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
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
