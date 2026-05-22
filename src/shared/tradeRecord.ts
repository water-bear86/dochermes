export type TradeRecordSource = 'manual' | 'exchange-csv' | 'public-wallet' | 'journal';
export type TradeRecordSide = 'long' | 'short' | 'unknown';
export type TradeRecordOutcome = 'win' | 'loss' | 'breakeven' | 'skipped' | 'unknown';

export type TradeRecord = {
  id: string;
  source: TradeRecordSource;
  openedAt: string;
  assetLabel: string;
  side: TradeRecordSide;
  notionalUsd?: number;
  quantity?: number;
  feesUsd?: number;
  outcome?: TradeRecordOutcome;
  tags?: string[];
  chain?: string;
  publicAddress?: string;
  rawRef: string;
};

type ManualTradeInput = {
  source: 'manual';
  id: string;
  openedAt: string;
  symbol: string;
  side?: string;
  notionalUsd?: string | number;
  quantity?: string | number;
  outcome?: string;
  tags?: string[];
};

type ExchangeCsvTradeInput = {
  source: 'exchange-csv';
  exchange: string;
  rowId: string;
  timestamp: string;
  pair: string;
  action?: string;
  valueUsd?: string | number;
  amount?: string | number;
  feeUsd?: string | number;
};

type PublicWalletTradeInput = {
  source: 'public-wallet';
  chain: string;
  signature: string;
  timestamp: string;
  token: string;
  direction?: string;
  valueUsd?: string | number;
  tokenAmount?: string | number;
  walletAddress?: string;
  privateKey?: unknown;
  seedPhrase?: unknown;
};

type JournalTradeInput = {
  source: 'journal';
  entryId: string;
  createdAt: string;
  question?: string;
  selectedWindowName?: string;
  outcome?: string;
  mistakeTags?: string[];
};

export type TradeRecordInput =
  | ManualTradeInput
  | ExchangeCsvTradeInput
  | PublicWalletTradeInput
  | JournalTradeInput;

export function normalizeTradeRecord(input: TradeRecordInput): TradeRecord {
  switch (input.source) {
    case 'manual':
      return compact({
        id: `manual:${input.id}`,
        source: 'manual',
        openedAt: input.openedAt,
        assetLabel: input.symbol,
        side: normalizeSide(input.side),
        notionalUsd: toFiniteNumber(input.notionalUsd),
        quantity: toFiniteNumber(input.quantity),
        outcome: normalizeOutcome(input.outcome),
        tags: normalizeTags(input.tags),
        rawRef: input.id
      });
    case 'exchange-csv':
      return compact({
        id: `exchange-csv:${input.exchange}:${input.rowId}`,
        source: 'exchange-csv',
        openedAt: input.timestamp,
        assetLabel: input.pair,
        side: normalizeSide(input.action),
        notionalUsd: toFiniteNumber(input.valueUsd),
        quantity: toFiniteNumber(input.amount),
        feesUsd: toFiniteNumber(input.feeUsd),
        rawRef: input.rowId
      });
    case 'public-wallet':
      return compact({
        id: `public-wallet:${input.chain}:${input.signature}`,
        source: 'public-wallet',
        openedAt: input.timestamp,
        assetLabel: input.token,
        side: normalizeSide(input.direction),
        notionalUsd: toFiniteNumber(input.valueUsd),
        quantity: toFiniteNumber(input.tokenAmount),
        chain: input.chain,
        publicAddress: input.walletAddress,
        rawRef: input.signature
      });
    case 'journal':
      return compact({
        id: `journal:${input.entryId}`,
        source: 'journal',
        openedAt: input.createdAt,
        assetLabel: input.selectedWindowName ?? 'Journal entry',
        side: 'unknown',
        outcome: normalizeOutcome(input.outcome),
        tags: normalizeTags(input.mistakeTags),
        rawRef: input.entryId
      });
  }
}

function normalizeSide(value: string | undefined): TradeRecordSide {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'buy' || normalized === 'long' || normalized === 'in') {
    return 'long';
  }
  if (normalized === 'sell' || normalized === 'short' || normalized === 'out') {
    return 'short';
  }
  return 'unknown';
}

function normalizeOutcome(value: string | undefined): TradeRecordOutcome | undefined {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'win' ||
    normalized === 'loss' ||
    normalized === 'breakeven' ||
    normalized === 'skipped' ||
    normalized === 'unknown'
  ) {
    return normalized;
  }
  return undefined;
}

function toFiniteNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTags(tags: string[] | undefined): string[] | undefined {
  const cleaned = tags?.map((tag) => tag.trim()).filter(Boolean);
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function compact(record: TradeRecord): TradeRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as TradeRecord;
}
