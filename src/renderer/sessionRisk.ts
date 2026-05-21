import type { JournalEntry, SourceQualityConfidence, SessionBudgetSettings } from '../shared/types';

const LOSS_KEYWORDS = /(?:loss|losses|lost|drawdown|dd|ripped|rekt|negative|drop|dump)/i;
const GAIN_KEYWORDS = /(?:gain|gains|won|positive|profit|targeted)/i;
const URGENT_KEYWORDS = /\b(all-in|immediate|immediately|ape|fomo|urgent|right now|now or never)\b/i;
const TILT_LOSS_WINDOW_MS = 120 * 60 * 1000;
const SIZE_PATTERN = /(?:\b(?:size|alloc|allocating|risk|position|amount|qty)?\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*(sol|usdc|usdt|usdc\.e|usdt\.e|eth|weth|btc|wbtc|bnb|arb|usd|usde|sui)\b/gi;

export interface SessionRiskWarningCandidate {
  text: string;
  evidence: {
    source: string;
    detail: string;
    confidence: SourceQualityConfidence;
    provenance?: string;
    detectedAt?: string;
  };
}

export interface SessionRiskAssessment {
  warnings: SessionRiskWarningCandidate[];
  status: {
    enabled: boolean;
    sessionDate: string;
    tradeCount: number;
    maxTradesPerSession: number;
    knownLossPercent: number;
    knownLossSamples: number;
    maxLossPerSessionPercent: number;
    cooldownMinutesLeft?: number;
    candidateSize?: string;
    medianSize?: string;
    sizeUnit?: string;
    hasLossData: boolean;
  };
}

export function buildSessionRiskAssessment(input: {
  question: string;
  journalEntries: JournalEntry[];
  riskBudget: SessionBudgetSettings;
  now?: () => Date;
}): SessionRiskAssessment {
  const riskBudget = input.riskBudget;
  const now = (input.now ?? (() => new Date()))();
  const sessionDate = toSessionDate(now);
  const sessionEntries = input.journalEntries
    .filter((entry) => toSessionDate(new Date(entry.createdAt)) === sessionDate)
    .sort((left, right) => new Date(left.createdAt).valueOf() - new Date(right.createdAt).valueOf());

  const tradeCount = sessionEntries.length;
  const losses = sessionEntries
    .map((entry) => {
      const parsed = parseLossPercent(entry);
      if (!parsed) {
        return undefined;
      }

      return {
        value: parsed,
        occurredAt: entry.createdAt
      };
    })
    .filter(isDefined);

  const knownLossPercent = losses.reduce((total, next) => total + next.value, 0);
  const hasLossData = losses.length > 0;
  const lastLossAt = losses.length > 0 ? losses[losses.length - 1].occurredAt : undefined;
  const cooldownMinutesLeft = computeCooldownMinutesLeft({ lastLossAt, now, cooldownMinutes: riskBudget.cooldownMinutesAfterLoss });
  const candidateSize = parseTradeSize(input.question);
  const candidateSourceSize = candidateSize ? `${candidateSize.value} ${candidateSize.unit}` : undefined;
  const medianSize = candidateSize
    ? median(
        sessionEntries
          .map((entry) => parseTradeSize(`${entry.question} ${entry.response} ${entry.notes}`))
          .filter(isDefined)
          .filter((size) => size.unit === candidateSize.unit)
          .map((size) => size.value)
      )
    : undefined;
  const recentLosses = losses.filter((loss) => now.valueOf() - new Date(loss.occurredAt).valueOf() <= TILT_LOSS_WINDOW_MS).length;
  const nextTradeNumber = tradeCount + 1;
  const isUrgentQuestion = URGENT_KEYWORDS.test(input.question);

  const warnings: SessionRiskWarningCandidate[] = [];

  if (riskBudget.enabled) {
    addTradeBudgetWarning(warnings, riskBudget, tradeCount, nextTradeNumber);
    addLossWarning(warnings, riskBudget, knownLossPercent, hasLossData);
    addCooldownWarning(warnings, riskBudget, cooldownMinutesLeft);
    addSizeMultiplierWarning(warnings, riskBudget, candidateSize, medianSize, nextTradeNumber);
    addTiltWarning(warnings, riskBudget, isUrgentQuestion, recentLosses);
  }

  const status = {
    enabled: riskBudget.enabled,
    sessionDate,
    tradeCount,
    maxTradesPerSession: riskBudget.maxTradesPerSession,
    knownLossPercent,
    knownLossSamples: losses.length,
    maxLossPerSessionPercent: riskBudget.maxLossPerSessionPercent,
    cooldownMinutesLeft,
    candidateSize: candidateSourceSize,
    medianSize: medianSize === undefined ? undefined : `${medianSize}`,
    sizeUnit: candidateSize?.unit,
    hasLossData
  };

  return { warnings, status };
}

function addTradeBudgetWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  tradeCount: number,
  nextTradeNumber: number
): void {
  if (!isPositiveInteger(budget.maxTradesPerSession)) {
    return;
  }

  if (nextTradeNumber > budget.maxTradesPerSession) {
    warnings.push({
      text: `Trade budget exceeded: this would be trade #${nextTradeNumber} but max is ${budget.maxTradesPerSession} today.`,
      evidence: {
        source: 'Session risk budget',
        detail: `Trades already logged today: ${tradeCount}. Missing manual outcome confirmation does not disable this rule.`,
        confidence: 'high'
      }
    });
    return;
  }

  if (nextTradeNumber === budget.maxTradesPerSession) {
    warnings.push({
      text: `You are at the session trade limit for today: this would be trade #${nextTradeNumber} of ${budget.maxTradesPerSession}.`,
      evidence: {
        source: 'Session risk budget',
        detail: 'Trade count budget is exact; use history context before sending the next signal.',
        confidence: 'medium'
      }
    });
    return;
  }

  const ratio = budget.maxTradesPerSession > 0 ? nextTradeNumber / budget.maxTradesPerSession : 0;
  if (ratio >= 0.8) {
    warnings.push({
      text: `Session trades are near limit: next trade would be ${nextTradeNumber}/${budget.maxTradesPerSession}.`,
      evidence: {
        source: 'Session risk budget',
        detail: 'Approaching configured per-session trade cap.',
        confidence: 'low'
      }
    });
  }
}

function addLossWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  knownLossPercent: number,
  hasLossData: boolean
): void {
  if (!isPositiveNumber(budget.maxLossPerSessionPercent)) {
    return;
  }

  if (!hasLossData) {
    warnings.push({
      text: 'Loss budget check is active but no structured loss outcome is available for today.',
      evidence: {
        source: 'Session risk budget',
        detail: `Configured max loss: ${formatPercent(budget.maxLossPerSessionPercent)}. Log journal outcomes to turn this into a concrete gate.`,
        confidence: 'low'
      }
    });
    return;
  }

  const usage = knownLossPercent / budget.maxLossPerSessionPercent;
  if (usage >= 1) {
    warnings.push({
      text: `Session max-loss budget exceeded: ${formatPercent(knownLossPercent)} used of ${formatPercent(
        budget.maxLossPerSessionPercent
      )} target.`,
      evidence: {
        source: 'Session risk budget',
        detail: 'Estimated tracked losses are at or above configured cap.',
        confidence: 'high'
      }
    });
    return;
  }

  if (usage >= 0.8) {
    warnings.push({
      text: `Session loss budget nearing limit: ${formatPercent(knownLossPercent)} of ${formatPercent(
        budget.maxLossPerSessionPercent
      )} used.`,
      evidence: {
        source: 'Session risk budget',
        detail: 'Loss tracking is based on journal entries with numeric loss references.',
        confidence: 'medium'
      }
    });
  }
}

function addCooldownWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  cooldownMinutesLeft: number | undefined
): void {
  if (!isPositiveInteger(budget.cooldownMinutesAfterLoss) || cooldownMinutesLeft === undefined) {
    return;
  }

  if (cooldownMinutesLeft > 0) {
    warnings.push({
      text: `Cooldown active after recent loss: ${Math.ceil(cooldownMinutesLeft)}m remaining (window ${budget.cooldownMinutesAfterLoss}m).`,
      evidence: {
        source: 'Session risk budget',
        detail: 'Recent loss detected from journal outcome text; this is a timing rule only.',
        confidence: 'high'
      }
    });
  }
}

function addSizeMultiplierWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  candidateSize: TradeSize | undefined,
  medianSize: number | undefined,
  nextTradeNumber: number
): void {
  if (!isPositiveNumber(budget.maxSizeMultiplier) || budget.maxSizeMultiplier <= 1) {
    return;
  }

  if (!candidateSize) {
    return;
  }

  if (medianSize === undefined) {
    warnings.push({
      text: `Size-rule is enabled but no baseline for ${candidateSize.unit.toUpperCase()} sizes was found today.`,
      evidence: {
        source: 'Session risk budget',
        detail: `Configured multiplier: max ${budget.maxSizeMultiplier}x baseline.`,
        confidence: 'low'
      }
    });
    return;
  }

  const maxAllowable = medianSize * budget.maxSizeMultiplier;
  if (candidateSize.value > maxAllowable) {
    warnings.push({
      text: `Trade size may be oversized: ${candidateSize.value}${candidateSize.unit} > ${round2(maxAllowable)}${candidateSize.unit} (next trade #${nextTradeNumber}).`,
      evidence: {
        source: 'Session risk budget',
        detail: `Median ${candidateSize.unit} size today is ${round2(medianSize)}; multiplier cap is ${formatMultiplier(budget.maxSizeMultiplier)}.`,
        confidence: 'medium'
      }
    });
  }
}

function addTiltWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  isUrgentQuestion: boolean,
  recentLossCount: number
): void {
  if (!budget.enabled || !isUrgentQuestion) {
    return;
  }

  if (recentLossCount >= 1) {
    warnings.push({
      text: 'Tilt-risk pattern: urgent entry language after recent losses.',
      evidence: {
        source: 'Behavioral check',
        detail: 'Recent loss + urgent language is a higher-propensity overtrading signal.',
        confidence: 'medium'
      }
    });
    return;
  }

  if (recentLossCount === 0 && budget.enabled && budget.maxLossPerSessionPercent > 0) {
    warnings.push({
      text: 'No recent losses detected for this question context, but monitor urgency behavior.',
      evidence: {
        source: 'Behavioral check',
        detail: 'Urgent wording with no recent loss context produces a low-confidence tilt signal.',
        confidence: 'low'
      }
    });
  }
}

function parseLossPercent(entry: JournalEntry): number | undefined {
  const text = `${entry.question} ${entry.response} ${entry.notes}`.toLowerCase();
  const matches = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)];
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
    const context = text.slice(Math.max(0, index - 60), Math.min(text.length, index + 80));
    const likelyLoss = LOSS_KEYWORDS.test(context) || value < 0;
    const likelyGain = GAIN_KEYWORDS.test(context);
    if (likelyLoss && !likelyGain) {
      return Math.abs(value);
    }
  }

  return undefined;
}

interface TradeSize {
  value: number;
  unit: string;
}

function parseTradeSize(value: string): TradeSize | undefined {
  const normalized = value.toLowerCase();
  const matches = [...normalized.matchAll(SIZE_PATTERN)];
  if (matches.length === 0) {
    return undefined;
  }

  const firstMatch = matches[0];
  const rawValue = firstMatch[1];
  const unit = normalizeUnit(firstMatch[2]);
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return { value: parsed, unit };
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

function computeCooldownMinutesLeft(input: {
  lastLossAt: string | undefined;
  now: Date;
  cooldownMinutes: number;
}): number | undefined {
  if (!input.lastLossAt || !isPositiveInteger(input.cooldownMinutes)) {
    return undefined;
  }

  const lastLossDate = new Date(input.lastLossAt);
  const lastLossMs = lastLossDate.valueOf();
  if (Number.isNaN(lastLossMs)) {
    return undefined;
  }

  const elapsedMinutes = (input.now.valueOf() - lastLossMs) / 60000;
  if (elapsedMinutes >= input.cooldownMinutes) {
    return 0;
  }

  return input.cooldownMinutes - elapsedMinutes;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isPositiveNumber(value: number): boolean {
  return value > 0 && Number.isFinite(value);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function toSessionDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function round2(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatPercent(value: number): string {
  return `${round2(value)}%`;
}

function formatMultiplier(value: number): string {
  return `${round2(value)}x`;
}
