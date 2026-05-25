import type { CoachMode, SourceQualityConfidence } from './types';

export const TRADE_SIGNAL_SCHEMA_VERSION = 'dochermes.signal.v1' as const;
export const COACH_ASSESSMENT_SCHEMA_VERSION = 'dochermes.assessment.v1' as const;
export const TRADE_CARD_SCHEMA_VERSION = 'dochermes.trade-card.v1' as const;
export const TRADE_DECISION_SCHEMA_VERSION = 'dochermes.decision.v1' as const;
export const TRADE_OUTCOME_SCHEMA_VERSION = 'dochermes.outcome.v1' as const;

export const ALLOWED_TRADE_DECISION_ACTIONS = [
  'accepted-recommended',
  'resized',
  'waited',
  'set-alert',
  'created-plan',
  'rejected',
  'overrode'
] as const;

export const ALLOWED_OUTCOME_STATUSES = ['open', 'closed', 'stopped', 'expired', 'skipped', 'unknown'] as const;

export type TradeDecisionAction = (typeof ALLOWED_TRADE_DECISION_ACTIONS)[number];

export type TradeSignalSourceConfidence = 'low' | 'medium' | 'high';
export type TradeSignalSide = 'buy' | 'sell' | 'long' | 'short';
export type CoachRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type CoachRecommendedAction = 'enter' | 'wait' | 'avoid' | 'reduce-size' | 'create-plan';
export type TradeWarningLevel = CoachMode;
export type OutcomeStatus = 'open' | 'closed' | 'stopped' | 'expired' | 'skipped' | 'unknown';

export interface TradeSize {
  value: number;
  unit: string;
}

export interface TradeSignalInput {
  schemaVersion: typeof TRADE_SIGNAL_SCHEMA_VERSION;
  signalId: string;
  createdAt: string;
  source: {
    type: string;
    label: string;
    confidence: TradeSignalSourceConfidence;
  };
  asset: {
    symbol: string;
    tokenAddress?: string;
    chain: string;
    pairAddress?: string;
  };
  market?: MarketEvidenceInput;
  analysisContext?: AnalysisContextInput;
  proposedTrade: {
    side: TradeSignalSide;
    size: number;
    unit: string;
    strategy?: string;
  };
  botContext?: ReadonlyBotContext;
}

export interface ReadonlyBotContext {
  platform?: string;
  routePreview?: string;
  executionCapability?: boolean;
}

export interface MarketEvidenceInput {
  tokenAgeMinutes?: number;
  liquidityUsd?: number;
  holderConcentration?: string;
  recentVolumeTrend?: string;
  poolAddress?: string;
  dex?: string;
  priceChange?: PriceChangeEvidence;
  volumeUsd?: VolumeWindowEvidence;
  transactions?: TransactionWindowEvidence;
  liquidity?: LiquidityEvidence;
  ohlcv?: OhlcvWindowEvidence[];
}

export interface PriceChangeEvidence {
  m5Percent?: number;
  h1Percent?: number;
  h24Percent?: number;
}

export interface VolumeWindowEvidence {
  m5?: number;
  h1?: number;
  h24?: number;
}

export interface TransactionWindowEvidence {
  m5Buys?: number;
  m5Sells?: number;
  h1Buys?: number;
  h1Sells?: number;
}

export interface LiquidityEvidence {
  reserveBase?: number;
  reserveQuote?: number;
  liquidityUsd?: number;
  poolAddress?: string;
  dex?: string;
}

export interface OhlcvWindowEvidence {
  timeframe: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  observedAt?: string;
}

export interface AnalysisContextInput {
  technicalIndicators?: TechnicalIndicatorEvidence[];
  sentiment?: SentimentEvidence;
  providerEvidence?: ProviderEvidence[];
}

export interface TechnicalIndicatorEvidence {
  name: string;
  timeframe: string;
  value: number | string;
  interpretation?: string;
}

export interface SentimentEvidence {
  score: number;
  label: string;
  sources: string[];
  summary?: string;
}

export interface ProviderEvidence {
  provider: string;
  kind: 'pool-data' | 'ohlcv' | 'trades' | 'sentiment' | 'technical-analysis' | 'browser-context' | 'bot-market-data';
  observedAt: string;
  confidence?: SourceQualityConfidence;
  detail?: string;
}

export interface CoachAssessment {
  schemaVersion: typeof COACH_ASSESSMENT_SCHEMA_VERSION;
  signalId: string;
  risk: CoachRiskLevel;
  recommendedAction: CoachRecommendedAction;
  recommendedSize?: TradeSize;
  reason: string;
  plan?: TradePlan;
  memory?: {
    matchedPriorTrades: number;
    summary: string;
  };
  warnings: TradeDecisionWarning[];
}

export interface TradePlan {
  entry?: string;
  invalidation?: string;
  takeProfit?: string;
  maxHoldTimeMinutes?: number;
}

export interface TradeDecisionWarning {
  level: TradeWarningLevel;
  code: string;
  message: string;
  requiresPolicyOverride?: boolean;
  policyOverrideReason?: string;
  source?: string;
  detail?: string;
  confidence?: SourceQualityConfidence;
  provenance?: string;
  detectedAt?: string;
}

export interface TradeCard {
  schemaVersion: typeof TRADE_CARD_SCHEMA_VERSION;
  signalId: string;
  createdAt: string;
  mode: CoachMode;
  asset: TradeSignalInput['asset'];
  source: TradeSignalInput['source'];
  proposedTrade: {
    side: TradeSignalSide;
    size: TradeSize;
    strategy?: string;
  };
  recommendation: {
    action: CoachRecommendedAction;
    size?: TradeSize;
    risk: CoachRiskLevel;
    reason: string;
    plan?: TradePlan;
    memory?: CoachAssessment['memory'];
  };
  warnings: TradeDecisionWarning[];
  override: {
    required: boolean;
    reasons: string[];
  };
  allowedActions: TradeDecisionAction[];
  marketEvidence: MarketEvidence;
  outcomeLink: {
    schemaVersion: typeof TRADE_OUTCOME_SCHEMA_VERSION;
    signalId: string;
  };
  execution: {
    docHermesCanExecute: false;
    botOwnsExecution: true;
    note: string;
  };
}

export interface MarketEvidence extends MarketEvidenceInput {
  technicalIndicators: TechnicalIndicatorEvidence[];
  sentiment?: SentimentEvidence;
  providerEvidence: ProviderEvidence[];
}

export interface CreateTradeCardInput {
  mode: CoachMode;
  signal: TradeSignalInput;
  assessment: CoachAssessment;
  createdAt: string;
}

export interface TradeDecisionOverride {
  used: boolean;
  note: string;
  reasonCode?: string;
}

export interface TradeDecisionEvent {
  schemaVersion: typeof TRADE_DECISION_SCHEMA_VERSION;
  signalId: string;
  decidedAt: string;
  action: TradeDecisionAction;
  requestedSize?: TradeSize;
  finalSize?: TradeSize;
  override: TradeDecisionOverride;
  outcomeLink: {
    schemaVersion: typeof TRADE_OUTCOME_SCHEMA_VERSION;
    signalId: string;
  };
}

export interface CreateTradeDecisionEventInput {
  card: TradeCard;
  decidedAt: string;
  action: TradeDecisionAction;
  requestedSize?: TradeSize;
  finalSize?: TradeSize;
  override?: TradeDecisionOverride;
}

export interface TradeOutcomeEvent {
  schemaVersion: typeof TRADE_OUTCOME_SCHEMA_VERSION;
  signalId: string;
  positionId?: string;
  closedAt: string;
  outcome: {
    status: OutcomeStatus;
    pnlPercent?: number;
    maxDrawdownPercent?: number;
    maxRunupPercent?: number;
    holdTimeMinutes?: number;
  };
  review?: {
    followedPlan?: boolean;
    mistakeTags?: string[];
    notes?: string;
  };
}

const FORBIDDEN_EXECUTION_FIELDS = new Set([
  'docHermesExecutionCapability',
  'dochermesExecutionCapability',
  'executionAuthority',
  'executionHandler',
  'orderRouter',
  'orderRouting',
  'orderRoute',
  'orderPayload',
  'placeTrade',
  'placeOrder',
  'signTransaction',
  'signedTransaction',
  'transactionSigner',
  'walletControl'
]);

const FORBIDDEN_WALLET_FIELDS = new Set(['wallet', 'privateKey', 'seedPhrase', 'mnemonic', 'walletApproval']);

const NON_CONTINUING_ACTIONS = new Set<TradeDecisionAction>(['waited', 'set-alert', 'created-plan', 'rejected']);

export function createTradeCard(input: CreateTradeCardInput): TradeCard {
  rejectExecutionAuthority(input.signal);

  if (input.signal.schemaVersion !== TRADE_SIGNAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported trade signal schema: ${input.signal.schemaVersion}`);
  }

  if (input.assessment.schemaVersion !== COACH_ASSESSMENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported coach assessment schema: ${input.assessment.schemaVersion}`);
  }

  if (input.signal.signalId !== input.assessment.signalId) {
    throw new Error('Trade signal and coach assessment must share the same signalId.');
  }

  const policyWarnings = input.assessment.warnings.filter(
    (warning) => warning.level === 'policy' || warning.requiresPolicyOverride
  );
  const overrideReasons = policyWarnings.map((warning) => {
    return warning.policyOverrideReason ?? warning.message;
  });

  return {
    schemaVersion: TRADE_CARD_SCHEMA_VERSION,
    signalId: input.signal.signalId,
    createdAt: input.createdAt,
    mode: input.mode,
    asset: { ...input.signal.asset },
    source: { ...input.signal.source },
    proposedTrade: {
      side: input.signal.proposedTrade.side,
      size: {
        value: input.signal.proposedTrade.size,
        unit: input.signal.proposedTrade.unit
      },
      ...(input.signal.proposedTrade.strategy ? { strategy: input.signal.proposedTrade.strategy } : {})
    },
    recommendation: {
      action: input.assessment.recommendedAction,
      ...(input.assessment.recommendedSize ? { size: { ...input.assessment.recommendedSize } } : {}),
      risk: input.assessment.risk,
      reason: input.assessment.reason,
      ...(input.assessment.plan ? { plan: { ...input.assessment.plan } } : {}),
      ...(input.assessment.memory ? { memory: { ...input.assessment.memory } } : {})
    },
    warnings: input.assessment.warnings.map((warning) => ({ ...warning })),
    override: {
      required: policyWarnings.length > 0,
      reasons: overrideReasons
    },
    allowedActions: [...ALLOWED_TRADE_DECISION_ACTIONS],
    marketEvidence: buildMarketEvidence(input.signal),
    outcomeLink: {
      schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
      signalId: input.signal.signalId
    },
    execution: {
      docHermesCanExecute: false,
      botOwnsExecution: true,
      note: 'DocHermes records coaching decisions only; the bot owns confirmation, routing, signing, and execution.'
    }
  };
}

export function createTradeDecisionEvent(input: CreateTradeDecisionEventInput): TradeDecisionEvent {
  if (!isTradeDecisionAction(input.action)) {
    throw new Error(`Trade decision action "${String(input.action)}" is not allowed by the contract.`);
  }

  const override = input.override ?? { used: false, note: '' };
  const continuingDespitePolicy = input.card.override.required && !NON_CONTINUING_ACTIONS.has(input.action);

  if (continuingDespitePolicy && !hasExplicitOverrideMetadata(override)) {
    throw new Error('Policy warnings require explicit override metadata before continuing.');
  }

  return {
    schemaVersion: TRADE_DECISION_SCHEMA_VERSION,
    signalId: input.card.signalId,
    decidedAt: input.decidedAt,
    action: input.action,
    ...(input.requestedSize ? { requestedSize: { ...input.requestedSize } } : {}),
    ...(input.finalSize ? { finalSize: { ...input.finalSize } } : {}),
    override,
    outcomeLink: {
      schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
      signalId: input.card.signalId
    }
  };
}

export function sanitizeTradeDecisionEvent(value: unknown): TradeDecisionEvent | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as TradeDecisionEvent;
  if (
    record.schemaVersion !== TRADE_DECISION_SCHEMA_VERSION ||
    typeof record.signalId !== 'string' ||
    typeof record.decidedAt !== 'string' ||
    !isTradeDecisionAction(record.action) ||
    !record.override ||
    typeof record.override.used !== 'boolean' ||
    typeof record.override.note !== 'string' ||
    !record.outcomeLink ||
    record.outcomeLink.schemaVersion !== TRADE_OUTCOME_SCHEMA_VERSION ||
    record.outcomeLink.signalId !== record.signalId
  ) {
    return undefined;
  }

  const requestedSize = sanitizeTradeSize(record.requestedSize);
  const finalSize = sanitizeTradeSize(record.finalSize);
  const reasonCode =
    typeof record.override.reasonCode === 'string' ? record.override.reasonCode.trim() : '';

  return {
    schemaVersion: TRADE_DECISION_SCHEMA_VERSION,
    signalId: record.signalId,
    decidedAt: record.decidedAt,
    action: record.action,
    ...(requestedSize ? { requestedSize } : {}),
    ...(finalSize ? { finalSize } : {}),
    override: {
      used: record.override.used,
      note: record.override.note.trim(),
      ...(reasonCode ? { reasonCode } : {})
    },
    outcomeLink: {
      schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
      signalId: record.signalId
    }
  };
}

export function sanitizeTradeOutcomeEvent(value: unknown): TradeOutcomeEvent | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as TradeOutcomeEvent;
  if (
    record.schemaVersion !== TRADE_OUTCOME_SCHEMA_VERSION ||
    typeof record.signalId !== 'string' ||
    typeof record.closedAt !== 'string' ||
    !record.outcome ||
    !isOutcomeStatus(record.outcome.status)
  ) {
    return undefined;
  }

  const review = record.review;
  const positionId = typeof record.positionId === 'string' ? record.positionId.trim() : '';
  const reviewNotes = typeof review?.notes === 'string' ? review.notes.trim() : '';

  return {
    schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
    signalId: record.signalId,
    ...(positionId ? { positionId } : {}),
    closedAt: record.closedAt,
    outcome: {
      status: record.outcome.status,
      ...(toFiniteNumber(record.outcome.pnlPercent) !== undefined ? { pnlPercent: toFiniteNumber(record.outcome.pnlPercent) } : {}),
      ...(toFiniteNumber(record.outcome.maxDrawdownPercent) !== undefined
        ? { maxDrawdownPercent: toFiniteNumber(record.outcome.maxDrawdownPercent) }
        : {}),
      ...(toFiniteNumber(record.outcome.maxRunupPercent) !== undefined
        ? { maxRunupPercent: toFiniteNumber(record.outcome.maxRunupPercent) }
        : {}),
      ...(toFiniteNumber(record.outcome.holdTimeMinutes) !== undefined
        ? { holdTimeMinutes: toFiniteNumber(record.outcome.holdTimeMinutes) }
        : {})
    },
    ...(review
      ? {
          review: {
            ...(typeof review.followedPlan === 'boolean' ? { followedPlan: review.followedPlan } : {}),
            ...(review.mistakeTags ? { mistakeTags: sanitizeTradeOutcomeTags(review.mistakeTags) } : {}),
            ...(reviewNotes ? { notes: reviewNotes } : {})
          }
        }
      : {})
  };
}

export function sanitizeTradeSize(size: unknown): TradeSize | undefined {
  const candidate = size as TradeSize | undefined;
  if (
    !candidate ||
    typeof candidate.value !== 'number' ||
    !Number.isFinite(candidate.value) ||
    candidate.value <= 0 ||
    typeof candidate.unit !== 'string'
  ) {
    return undefined;
  }

  const unit = candidate.unit.trim();
  if (!unit) {
    return undefined;
  }

  return {
    value: candidate.value,
    unit
  };
}

export function isTradeDecisionAction(value: unknown): value is TradeDecisionAction {
  return typeof value === 'string' && ALLOWED_TRADE_DECISION_ACTIONS.some((allowedAction) => allowedAction === value);
}

export function isOutcomeStatus(value: unknown): value is OutcomeStatus {
  return typeof value === 'string' && ALLOWED_OUTCOME_STATUSES.some((status) => status === value);
}

function buildMarketEvidence(signal: TradeSignalInput): MarketEvidence {
  const market = signal.market ?? {};
  const analysis = signal.analysisContext ?? {};

  return {
    ...market,
    technicalIndicators: [...(analysis.technicalIndicators ?? [])],
    ...(analysis.sentiment
      ? {
          sentiment: {
            ...analysis.sentiment,
            sources: [...analysis.sentiment.sources]
          }
        }
      : {}),
    providerEvidence: [...(analysis.providerEvidence ?? [])]
  };
}

function hasExplicitOverrideMetadata(override: TradeDecisionOverride): boolean {
  return override.used && override.note.trim().length > 0 && Boolean(override.reasonCode?.trim());
}

function rejectExecutionAuthority(value: unknown): void {
  scanForForbiddenFields(value, []);
}

function scanForForbiddenFields(value: unknown, path: string[]): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForForbiddenFields(item, [...path, `${index}`]));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];

    if (isAllowedReadonlyBotField(nextPath)) {
      continue;
    }

    if (FORBIDDEN_WALLET_FIELDS.has(key)) {
      throw new Error(`Trade signal contains wallet-control material at ${nextPath.join('.')}.`);
    }

    if (FORBIDDEN_EXECUTION_FIELDS.has(key)) {
      throw new Error(`Trade signal contains execution authority at ${nextPath.join('.')}.`);
    }

    scanForForbiddenFields(child, nextPath);
  }
}

function isAllowedReadonlyBotField(path: string[]): boolean {
  return path.length === 2 && path[0] === 'botContext' && (path[1] === 'executionCapability' || path[1] === 'routePreview');
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeTradeOutcomeTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  const cleaned = Array.from(
    new Set(tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().toLowerCase()).filter(Boolean))
  ).slice(0, 8);
  return cleaned.length > 0 ? cleaned : undefined;
}
