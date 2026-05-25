import type {
  CoachMode,
  MemoryContext,
  MonitoringSignal,
  SourceQualityConfidence,
  SourceQualityFinding
} from '../shared/types';

export type TradeCardActionKind =
  | 'accepted-recommended'
  | 'set-alert'
  | 'created-plan'
  | 'rejected'
  | 'overrode';

export interface TradeCardActionViewModel {
  kind: TradeCardActionKind;
  label: string;
  journalLabel: string;
  requiresNote: boolean;
}

export interface TradeCardViewModel {
  token: string;
  proposedTrade: string;
  strategy: string;
  source: string;
  tokenAge: string;
  liquidity: string;
  holderConcentration: string;
  recentWalletBehavior: string;
  risk: 'Low' | 'Medium' | 'High' | 'Critical';
  riskTone: 'low' | 'medium' | 'high' | 'critical';
  recommendedSize: string;
  reason: string;
  plan: {
    entry: string;
    invalidation: string;
    takeProfit: string;
    maxHoldTime: string;
  };
  memorySummary?: string;
  warnings: string[];
  sourceConfidence?: SourceQualityConfidence;
  overrideRequired: boolean;
  actions: TradeCardActionViewModel[];
  advisoryNotice: string;
}

interface BuildTradeCardViewModelInput {
  question: string;
  response: string;
  mode: CoachMode;
  monitorSignals: MonitoringSignal[];
  memoryContext: MemoryContext;
  localWarnings: string[];
  sourceFinding?: SourceQualityFinding;
}

const ACTIONS: TradeCardActionViewModel[] = [
  {
    kind: 'accepted-recommended',
    label: 'Buy recommended size',
    journalLabel: 'Trade card: buy recommended size',
    requiresNote: false
  },
  {
    kind: 'set-alert',
    label: 'Set alert',
    journalLabel: 'Trade card: set alert',
    requiresNote: false
  },
  {
    kind: 'created-plan',
    label: 'Create trade plan',
    journalLabel: 'Trade card: create trade plan',
    requiresNote: false
  },
  {
    kind: 'rejected',
    label: 'Reject',
    journalLabel: 'Trade card: reject',
    requiresNote: false
  },
  {
    kind: 'overrode',
    label: 'Override',
    journalLabel: 'Trade card: override',
    requiresNote: true
  }
];

export function buildTradeCardViewModel(input: BuildTradeCardViewModelInput): TradeCardViewModel {
  const response = input.response.trim();
  const question = input.question.trim();
  const risk = inferRisk(input.mode, response, input.localWarnings);
  const token = inferToken(input.monitorSignals, input.sourceFinding);
  const proposedTrade = inferProposedTrade(input.monitorSignals, question);
  const strategy = inferStrategy(question, response, input.monitorSignals);
  const memoryPattern = input.memoryContext.matchedPatterns[0];
  const reason =
    readField(response, 'reason') ??
    memoryPattern?.summary ??
    firstCoachResponseSentence(response) ??
    input.localWarnings[0] ??
    'No structured reason returned yet.';

  return {
    token,
    proposedTrade,
    strategy,
    source: inferSource(input.monitorSignals, input.sourceFinding),
    tokenAge: readField(response, 'token age') ?? 'Unknown',
    liquidity: inferLiquidity(input.monitorSignals, response),
    holderConcentration: readField(response, 'holder concentration') ?? 'Unknown',
    recentWalletBehavior: inferWalletBehavior(input.monitorSignals, input.sourceFinding),
    risk,
    riskTone: risk.toLowerCase() as TradeCardViewModel['riskTone'],
    recommendedSize: readField(response, 'recommended size') ?? inferRecommendedSize(response) ?? 'Not specified',
    reason,
    plan: {
      entry: readField(response, 'entry') ?? memoryPattern?.recommendation ?? 'Wait for a defined confirmation trigger.',
      invalidation: readField(response, 'invalidation') ?? 'Define invalidation before acting.',
      takeProfit: readField(response, 'take profit') ?? readField(response, 'take-profit') ?? 'Not specified',
      maxHoldTime: readField(response, 'max hold time') ?? readField(response, 'max hold') ?? 'Not specified'
    },
    ...(memoryPattern
      ? {
          memorySummary: `${memoryPattern.evidenceCount} prior match${memoryPattern.evidenceCount === 1 ? '' : 'es'}: ${memoryPattern.summary}`
        }
      : {}),
    warnings: input.localWarnings.slice(0, 4),
    sourceConfidence: input.sourceFinding?.confidence,
    overrideRequired: input.mode === 'policy' && input.localWarnings.length > 0,
    actions: ACTIONS.map((action) => ({ ...action })),
    advisoryNotice: 'DocHermes records coaching decisions only. It cannot route, sign, or execute trades.'
  };
}

export function describeTradeCardDecision(action: TradeCardActionViewModel, card: TradeCardViewModel, note?: string): string {
  const parts = [
    `${action.journalLabel}.`,
    `Token: ${card.token}.`,
    `Proposed trade: ${card.proposedTrade}.`,
    `Risk: ${card.risk}.`,
    `Recommended size: ${card.recommendedSize}.`,
    `Plan: entry=${card.plan.entry}; invalidation=${card.plan.invalidation}; take profit=${card.plan.takeProfit}; max hold=${card.plan.maxHoldTime}.`,
    `Execution: advisory record only; DocHermes cannot route, sign, or execute trades.`
  ];

  const trimmedNote = note?.trim();
  if (trimmedNote) {
    parts.push(`Note: ${trimmedNote}`);
  }

  return parts.join(' ');
}

function inferRisk(mode: CoachMode, response: string, localWarnings: string[]): TradeCardViewModel['risk'] {
  const parsed = readField(response, 'risk');
  const normalized = parsed?.toLowerCase();

  if (normalized?.includes('critical')) {
    return 'Critical';
  }
  if (normalized?.includes('high')) {
    return 'High';
  }
  if (normalized?.includes('medium') || normalized?.includes('moderate')) {
    return 'Medium';
  }
  if (normalized?.includes('low')) {
    return 'Low';
  }

  if (mode === 'policy' && localWarnings.length > 0) {
    return 'Critical';
  }
  if (localWarnings.length >= 2) {
    return 'High';
  }
  if (localWarnings.length === 1 || mode === 'guardrail') {
    return 'Medium';
  }

  return 'Low';
}

function inferToken(signals: MonitoringSignal[], sourceFinding?: SourceQualityFinding): string {
  const pair = firstSignalValue(signals, 'pair');
  if (pair) {
    return pair;
  }

  const token = sourceFinding?.tokenHint ?? firstSignalValue(signals, 'token-address') ?? firstSignalValue(signals, 'sol-address') ?? firstSignalValue(signals, 'evm-address');
  if (token) {
    return shortenToken(token);
  }

  return 'Current signal';
}

function inferProposedTrade(signals: MonitoringSignal[], question: string): string {
  const side = firstSignalValue(signals, 'order-side') ?? parseSide(question);
  const size = firstSignalValue(signals, 'order-size') ?? parseSizeFromQuestion(question);

  if (side && size) {
    return `${capitalize(side)} ${size}`;
  }
  if (side) {
    return `${capitalize(side)} size not specified`;
  }
  if (size) {
    return `Trade ${size}`;
  }

  return 'Not specified';
}

function inferStrategy(question: string, response: string, signals: MonitoringSignal[]): string {
  const normalized = `${question} ${response} ${signals.map((signal) => signal.value).join(' ')}`.toLowerCase();

  if (/early|momentum|breakout|pump|moving candle/.test(normalized)) {
    return 'early momentum';
  }
  if (/confirmation|support|range/.test(normalized)) {
    return 'confirmation entry';
  }
  if (/wallet/.test(normalized)) {
    return 'wallet alert';
  }

  return 'manual signal check';
}

function inferSource(signals: MonitoringSignal[], sourceFinding?: SourceQualityFinding): string {
  const sourceSignal = firstSignalValue(signals, 'source');
  if (sourceSignal) {
    return sourceSignal;
  }

  if (sourceFinding) {
    return `${sourceFinding.category} (${sourceFinding.confidence})`;
  }

  return 'Selected trading window';
}

function inferLiquidity(signals: MonitoringSignal[], response: string): string {
  return readField(response, 'liquidity') ?? firstSignalValue(signals, 'liquidity') ?? 'Unknown';
}

function inferWalletBehavior(signals: MonitoringSignal[], sourceFinding?: SourceQualityFinding): string {
  const hasWalletSignal =
    signals.some((signal) => signal.kind === 'wallet-address') || sourceFinding?.category === 'wallet';

  return hasWalletSignal ? 'wallet context detected' : 'Unknown';
}

function inferRecommendedSize(response: string): string | undefined {
  const match = response.match(/\b(?:size|recommended)\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(sol|usdc|usdt|eth|btc|usd)\b/i);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return `${match[1]} ${match[2].toUpperCase()}`;
}

function readField(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${escaped}\\s*:\\s*(.+?)(?=\\n\\s*(?:[-*]\\s*)?[A-Za-z][A-Za-z -]{1,32}\\s*:|$)`, 'i');
  const match = pattern.exec(text);
  return cleanValue(match?.[1]);
}

function firstSignalValue(signals: MonitoringSignal[], kind: MonitoringSignal['kind']): string | undefined {
  return signals.find((signal) => signal.kind === kind)?.value;
}

function parseSide(text: string): string | undefined {
  const match = text.match(/\b(buy|sell|long|short)\b/i);
  return match?.[1]?.toLowerCase();
}

function parseSizeFromQuestion(text: string): string | undefined {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(sol|usdc|usdt|eth|btc|usd)\b/i);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return `${match[1]} ${match[2].toUpperCase()}`;
}

function firstCoachResponseSentence(text: string): string | undefined {
  const sentence = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => !line.toLowerCase().startsWith('local risk guardrail:'))
    .filter(Boolean)[0]
    ?.replace(/\s+/g, ' ');

  return cleanValue(sentence);
}

function cleanValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned : undefined;
}

function shortenToken(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-5)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
