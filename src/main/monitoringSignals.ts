import type { MonitoringSignal } from '../shared/types';

const EVM_HASH_RE = /0x[a-fA-F0-9]{64}\b/g;
const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}\b/g;
const SOL_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{40,88}\b/g;
const URL_RE = /https?:\/\/[^\s]+/g;
const ORDER_PAIR_RE = /\b(?:pair|trading pair)\s*[:=]?\s*([A-Za-z0-9]{2,12})\s*[\/:.-]\s*([A-Za-z0-9]{2,12})\b/i;
const RAW_PAIR_RE = /\b([A-Z]{2,12})\s*\/\s*([A-Z]{2,12})\b/g;
const ORDER_SIZE_RE =
  /\b(?:size|amount|qty|quantity|position size|notional|value|invest(?:ed)?|stake)\s*[:=]?\s*\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:(?!size\b|amount\b|qty\b|quantity\b|position size\b|notional\b|value\b|invest(?:ed)?\b|stake\b|buy\b|sell\b|long\b|short\b|market\b|limit\b|stop\b|tp\b|sl\b|leverage\b)([A-Za-z%]{1,12})\b)?/gi;
const LEVERAGE_RE = /\bleverage\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*[xX]\b/g;
const CHAIN_RE =
  /\b(?:chain|network)\s*[:=]?\s*(ethereum|solana|sol|bsc|base|arbitrum|optimism|polygon|avalanche|avax|fantom|solana|sui|aptos)\b/gi;
const ORDER_DIR_RE = /\b(buy|sell|long|short)\b/gi;
const ORDER_TYPE_RE = /\b(market|limit|stop[- ]?loss|take[- ]?profit|tp|sl|stop)\b/gi;

const KNOWN_CHAINS = new Set<string>([
  'avalanche',
  'avax',
  'arbitrum',
  'aptos',
  'base',
  'bsc',
  'ethereum',
  'fantom',
  'optimism',
  'polygon',
  'sol',
  'solana',
  'sui'
]);

export function extractClipboardSignalsFromText(text: string, now: number): MonitoringSignal[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const signals = new Map<string, Omit<MonitoringSignal, 'detectedAt'>>();

  for (const rawMatch of normalized.matchAll(EVM_HASH_RE)) {
    addSignal(rawMatch[0], 'evm-tx-hash', 'high');
  }

  for (const rawMatch of normalized.matchAll(EVM_ADDRESS_RE)) {
    addSignal(rawMatch[0], 'evm-address', 'medium');
  }

  for (const rawMatch of normalized.matchAll(SOL_ADDRESS_RE)) {
    addSignal(rawMatch[0], 'sol-address', 'medium');
  }

  for (const rawMatch of normalized.matchAll(URL_RE)) {
    const rawUrl = rawMatch[0];
    const sanitizedUrl = sanitizeUrlCandidate(rawUrl);
    if (!sanitizedUrl) {
      continue;
    }

    const kind: MonitoringSignal['kind'] =
      /dextools|dexscreener|birdeye|solscan|etherscan|solana|solana\.fm|raydium|meteora/.test(sanitizedUrl) ? 'dex-url' : 'wallet-address';
    const message = kind === 'dex-url' ? 'Detected trading-context URL' : 'Detected external address-like URL';
    addSignal(sanitizedUrl, kind, kind === 'dex-url' ? 'medium' : 'low', message);
  }

  const orderPairRe = new RegExp(ORDER_PAIR_RE, 'gi');
  for (const rawMatch of normalized.matchAll(orderPairRe)) {
    const pair = normalizePair(rawMatch[1], rawMatch[2]);
    if (pair) {
      addSignal(pair, 'pair', 'high', `Detected ${pair} pair context`);
    }
  }

  const rawPairRe = new RegExp(RAW_PAIR_RE, 'g');
  for (const rawMatch of normalized.matchAll(rawPairRe)) {
    const pair = normalizePair(rawMatch[1], rawMatch[2]);
    if (pair) {
      addSignal(pair, 'pair', 'medium', `Detected uppercase pair context ${pair}`);
    }
  }

  for (const rawMatch of normalized.matchAll(ORDER_SIZE_RE)) {
    const quantity = rawMatch[1];
    const unit = rawMatch[2] ?? '';
    if (!quantity) {
      continue;
    }

    const normalizedQuantity = `${quantity}${unit ? ` ${unit}` : ''}`.trim();
    addSignal(normalizedQuantity, 'order-size', 'medium', `Detected order-size signal: ${normalizedQuantity}`);
  }

  for (const rawMatch of normalized.matchAll(LEVERAGE_RE)) {
    const leverage = rawMatch[1];
    if (leverage) {
      addSignal(`${leverage}x`, 'leverage', 'medium', `Detected leverage: ${leverage}x`);
    }
  }

  for (const rawMatch of normalized.matchAll(CHAIN_RE)) {
    const rawChain = rawMatch[1];
    if (!rawChain) {
      continue;
    }

    const chain = canonicalChain(rawChain);
    if (chain) {
      addSignal(chain, 'chain', 'medium', `Detected chain context: ${chain}`);
    }
  }

  for (const rawMatch of normalized.matchAll(ORDER_TYPE_RE)) {
    const normalizedType = canonicalOrderType(rawMatch[1]);
    if (normalizedType) {
      addSignal(normalizedType, 'order-type', 'low', `Detected order type ${normalizedType}`);
    }
  }

  for (const rawMatch of normalized.matchAll(ORDER_DIR_RE)) {
    const normalizedDirection = rawMatch[1]?.toLowerCase();
    if (normalizedDirection) {
      addSignal(normalizedDirection, 'order-direction', 'low', `Detected order direction ${normalizedDirection}`);
    }
  }

  const detectedAt = new Date(now).toISOString();
  return [...signals.values()].map((signal) => ({
    ...signal,
    detectedAt
  }));

  function addSignal(
    value: string,
    kind: MonitoringSignal['kind'],
    confidence: MonitoringSignal['confidence'],
    message?: string
  ): void {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }

    const key = `${kind}:${trimmedValue.toLowerCase()}`;
    if (signals.has(key)) {
      return;
    }

    signals.set(key, {
      source: 'clipboard',
      kind,
      value: trimmedValue,
      maskedValue: maskValue(trimmedValue),
      confidence,
      message
    });
  }
}

function canonicalOrderType(type: string): string | undefined {
  const normalized = type.toLowerCase();

  if (normalized === 'tp' || normalized === 'take-profit' || normalized === 'take profit') {
    return 'take-profit';
  }

  if (normalized === 'sl' || normalized === 'stop-loss' || normalized === 'stop loss' || normalized === 'stop') {
    return 'stop-loss';
  }

  if (normalized === 'market' || normalized === 'limit' || normalized === 'stop-limit' || normalized === 'stop') {
    return normalized;
  }

  return undefined;
}

function normalizePair(left?: string, right?: string): string | undefined {
  if (!left || !right) {
    return undefined;
  }

  const normalizedLeft = left.trim().toUpperCase();
  const normalizedRight = right.trim().toUpperCase();
  if (!isLikelyTokenSymbol(normalizedLeft) || !isLikelyTokenSymbol(normalizedRight)) {
    return undefined;
  }

  const pair = `${normalizedLeft}/${normalizedRight}`;
  if (pair.length > 40) {
    return undefined;
  }

  return pair;

  function isLikelyTokenSymbol(value: string): boolean {
    if (KNOWN_CHAINS.has(value.toLowerCase()) && value.length > 4) {
      return false;
    }

    if (!/^[A-Z0-9]{2,12}$/.test(value)) {
      return false;
    }

    return value.length >= 2 && value.length <= 10 && value !== 'http';
  }
}

function canonicalChain(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!KNOWN_CHAINS.has(normalized)) {
    return undefined;
  }

  return normalized === 'sol' ? 'solana' : normalized;
}

function sanitizeUrlCandidate(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;
    return `${host}${pathname}`.slice(0, 120);
  } catch {
    return rawUrl.slice(0, 120);
  }
}

function maskValue(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
