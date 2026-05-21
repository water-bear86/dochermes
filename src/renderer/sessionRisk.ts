import type {
  JournalEntry,
  SourceQualityConfidence,
  SourceQualityFinding,
  SessionBudgetSettings,
  SessionRiskPolicyLevel
} from '../shared/types';

const LOSS_KEYWORDS = /(?:loss|losses|lost|drawdown|dd|ripped|rekt|negative|drop|dump)/i;
const GAIN_KEYWORDS = /(?:gain|gains|won|positive|profit|targeted)/i;
const URGENT_KEYWORDS = /\b(all-in|immediate|immediately|ape|fomo|urgent|right now|now or never)\b/i;
const TILT_LOSS_WINDOW_MS = 120 * 60 * 1000;
const SIZE_PATTERN = /(?:\b(?:size|alloc|allocating|risk|position|amount|qty)?\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*(sol|usdc|usdt|usdc\.e|usdt\.e|eth|weth|btc|wbtc|bnb|arb|usd|usde|sui)\b/gi;
const TOKEN_PATTERNS = [
  /0x[a-fA-F0-9]{40}\b/g,
  /\b[1-9A-HJ-NP-Za-km-z]{40,44}\b/g
];
const TILT_SENSITIVITY_PRESETS = {
  low: {
    rapidTradeWindowMinutes: 45,
    rapidTradeThreshold: 4,
    repeatedContractWindowMinutes: 90,
    repeatedContractMinMatches: 2,
    tiltUrgentAfterLossMultiplier: 1,
    sizeAfterLossMultiplier: 3
  },
  standard: {
    rapidTradeWindowMinutes: 25,
    rapidTradeThreshold: 3,
    repeatedContractWindowMinutes: 45,
    repeatedContractMinMatches: 2,
    tiltUrgentAfterLossMultiplier: 1.4,
    sizeAfterLossMultiplier: 2.2
  },
  high: {
    rapidTradeWindowMinutes: 15,
    rapidTradeThreshold: 2,
    repeatedContractWindowMinutes: 30,
    repeatedContractMinMatches: 2,
    tiltUrgentAfterLossMultiplier: 1.2,
    sizeAfterLossMultiplier: 1.8
  }
} as const;

type TiltSensitivity = SessionBudgetSettings['tiltSensitivity'];

interface TiltSensitivityPreset {
  rapidTradeWindowMinutes: number;
  rapidTradeThreshold: number;
  repeatedContractWindowMinutes: number;
  repeatedContractMinMatches: number;
  tiltUrgentAfterLossMultiplier: number;
  sizeAfterLossMultiplier: number;
}

export interface SessionRiskWarningCandidate {
  text: string;
  policyLevel: SessionRiskPolicyLevel;
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
    tiltSensitivity: TiltSensitivity;
  };
}

export function buildSessionRiskAssessment(input: {
  question: string;
  journalEntries: JournalEntry[];
  riskBudget: SessionBudgetSettings;
  sourceFindings?: SourceQualityFinding[];
  now?: () => Date;
}): SessionRiskAssessment {
  const riskBudget = input.riskBudget;
  const now = (input.now ?? (() => new Date()))();
  const sensitivity = riskBudget.tiltSensitivity ?? 'standard';
  const tiltProfile = TILT_SENSITIVITY_PRESETS[sensitivity];
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
  const rapidTrades = countRecentTrades({
    entries: sessionEntries,
    now,
    windowMinutes: tiltProfile.rapidTradeWindowMinutes
  });
  const repeatedContractWarningEvidence = buildRecentTokenMatches({
    question: input.question,
    entries: sessionEntries,
    now,
    windowMinutes: tiltProfile.repeatedContractWindowMinutes
  });
  const nextTradeNumber = tradeCount + 1;
  const isUrgentQuestion = URGENT_KEYWORDS.test(input.question);
  const sizeLimitPolicy = determineEffectiveSizeMultiplier({
    budget: riskBudget,
    sourceFindings: input.sourceFindings
  });

  const warnings: SessionRiskWarningCandidate[] = [];

  if (riskBudget.enabled) {
    addTradeBudgetWarning(warnings, riskBudget, tradeCount, nextTradeNumber);
    addLossWarning(warnings, riskBudget, knownLossPercent, hasLossData);
    addCooldownWarning(warnings, riskBudget, cooldownMinutesLeft);
    addSizeMultiplierWarning(warnings, riskBudget, candidateSize, medianSize, nextTradeNumber, sizeLimitPolicy);
    addRapidTradeWarning(warnings, riskBudget, rapidTrades, tiltProfile);
    addRepeatedContractWarning(warnings, riskBudget, repeatedContractWarningEvidence, tiltProfile);
    addTiltWarning(warnings, riskBudget, isUrgentQuestion, recentLosses, tiltProfile, candidateSize, medianSize);
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
    hasLossData,
    tiltSensitivity: sensitivity
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
      policyLevel: 'policy',
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
      policyLevel: 'guardrail',
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
      policyLevel: 'advisory',
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
      policyLevel: 'advisory',
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
      policyLevel: 'policy',
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
      policyLevel: 'guardrail',
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
      policyLevel: 'policy',
      text: `Cooldown active after recent loss: ${Math.ceil(cooldownMinutesLeft)}m remaining (window ${budget.cooldownMinutesAfterLoss}m).`,
      evidence: {
        source: 'Session risk budget',
        detail: 'Recent loss detected from journal outcome text; this is a timing rule only.',
        confidence: 'high'
      }
    });
  }
}

function addRapidTradeWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  recentTradeCount: number,
  tiltProfile: TiltSensitivityPreset
): void {
  if (!budget.enabled || !isPositiveInteger(tiltProfile.rapidTradeThreshold)) {
    return;
  }

  if (recentTradeCount >= tiltProfile.rapidTradeThreshold) {
    warnings.push({
      policyLevel: 'advisory',
      text: `High trading pace detected: ${recentTradeCount} logged trades in the last ${tiltProfile.rapidTradeWindowMinutes} minutes.`,
      evidence: {
        source: 'Tilt detector',
        detail: 'Trade cadence is high relative to your configured sensitivity.',
        confidence:
          recentTradeCount >= tiltProfile.rapidTradeThreshold * 1.4 ? 'medium' : 'low'
      }
    });
  }
}

function addRepeatedContractWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  tokenMatches: TokenMatch[],
  tiltProfile: TiltSensitivityPreset
): void {
  if (!budget.enabled) {
    return;
  }

  if (tokenMatches.length === 0) {
    return;
  }

  const filtered = tokenMatches.filter((entry) => entry.matches >= tiltProfile.repeatedContractMinMatches);
  if (filtered.length === 0) {
    return;
  }

  const topMatch = filtered.sort((left, right) => right.matches - left.matches)[0];
  warnings.push({
    policyLevel: 'guardrail',
    text: `Tilt-risk pattern: ${topMatch.token} appeared in ${topMatch.matches} prior entries within ${tiltProfile.repeatedContractWindowMinutes}m.`,
    evidence: {
      source: 'Tilt detector',
      detail: 'Repeated token/contract appears in recent local history. Pace-based overtrading risk is elevated.',
      confidence: topMatch.matches >= 3 ? 'high' : 'medium'
    }
  });
}

function addSizeMultiplierWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  candidateSize: TradeSize | undefined,
  medianSize: number | undefined,
  nextTradeNumber: number,
  sizeLimitPolicy: {
    multiplier: number;
    policyLevel: SessionRiskPolicyLevel;
  }
): void {
  const multiplier = sizeLimitPolicy.multiplier;

  if (!isPositiveNumber(multiplier)) {
    return;
  }

  if (!candidateSize) {
    warnings.push({
      policyLevel: 'guardrail',
      text: 'Sizing rule requested but no exact size was found in this question.',
      evidence: {
        source: 'Session risk budget',
        detail: 'Add explicit size to evaluate policy size constraints (global and per-source).',
        confidence: 'low'
      }
    });
    return;
  }

  if (medianSize === undefined) {
    warnings.push({
      policyLevel: sizeLimitPolicy.policyLevel,
      text: `Size-rule is enabled but no baseline for ${candidateSize.unit.toUpperCase()} sizes was found today.`,
      evidence: {
        source: 'Session risk budget',
        detail: `Configured multiplier cap is ${formatMultiplier(multiplier)}x baseline.`,
        confidence: 'low'
      }
    });
    return;
  }

  const maxAllowable = medianSize * multiplier;
  if (candidateSize.value > maxAllowable) {
    warnings.push({
      policyLevel: sizeLimitPolicy.policyLevel,
      text: `Trade size may be oversized: ${candidateSize.value}${candidateSize.unit} > ${round2(maxAllowable)}${candidateSize.unit} (next trade #${nextTradeNumber}).`,
      evidence: {
        source: 'Session risk budget',
        detail: `Median ${candidateSize.unit} size today is ${round2(medianSize)}; multiplier cap is ${formatMultiplier(multiplier)}.`,
        confidence: 'medium'
      }
    });
  }
}

function addTiltWarning(
  warnings: SessionRiskWarningCandidate[],
  budget: SessionBudgetSettings,
  isUrgentQuestion: boolean,
  recentLossCount: number,
  tiltProfile: TiltSensitivityPreset,
  candidateSize: TradeSize | undefined,
  medianSize: number | undefined
): void {
  if (!budget.enabled || !isUrgentQuestion) {
    return;
  }

  if (recentLossCount >= 1) {
    if (candidateSize && medianSize !== undefined) {
      const urgencyThreshold = medianSize * tiltProfile.tiltUrgentAfterLossMultiplier;
      if (candidateSize.value >= urgencyThreshold) {
        warnings.push({
          policyLevel: 'advisory',
          text: `Urgent size request (${candidateSize.value}${candidateSize.unit}) is above urgency baseline.`
          + ` Median is ${round2(medianSize)}${candidateSize.unit}.`,
          evidence: {
            source: 'Behavioral check',
            detail: `Loss context + urgent wording plus large size request often indicates impulsive risk expansion.`,
            confidence: 'medium'
          }
        });
      }
    }

    warnings.push({
      policyLevel: 'advisory',
      text: `Tilt-risk pattern: urgent language after ${recentLossCount} recent loss${recentLossCount === 1 ? '' : 'es'}.`,
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
      policyLevel: 'advisory',
      text: 'No recent losses detected for this question context, but monitor urgency behavior.',
      evidence: {
        source: 'Behavioral check',
        detail: 'Urgent wording with no recent loss context produces a low-confidence tilt signal.',
        confidence: 'low'
      }
    });
  }

  if (candidateSize && budget.maxSizeMultiplier > 0) {
    const urgencyBaseline = budget.maxSizeMultiplier * tiltProfile.sizeAfterLossMultiplier;
    const threshold = isFinite(urgencyBaseline) ? urgencyBaseline : Number.POSITIVE_INFINITY;
    if (candidateSize.value >= threshold) {
      warnings.push({
        policyLevel: 'advisory',
        text: `Urgent size request (${candidateSize.value}${candidateSize.unit}) exceeds a conservative urgency-size threshold.`,
        evidence: {
          source: 'Behavioral check',
          detail: 'Urgent wording with high size request is a common impulsive-entry pattern.',
          confidence: 'low'
        }
      });
    }
  }
}

function determineEffectiveSizeMultiplier(input: {
  budget: SessionBudgetSettings;
  sourceFindings?: SourceQualityFinding[];
}): { multiplier: number; policyLevel: SessionRiskPolicyLevel } {
  const baseMultiplier = input.budget.maxSizeMultiplier;
  const normalizedBase = isPositiveNumber(baseMultiplier) ? baseMultiplier : 1;

  if (!input.sourceFindings || input.sourceFindings.length === 0 || !isPositiveNumber(normalizedBase)) {
    return {
      multiplier: normalizedBase,
      policyLevel: 'advisory'
    };
  }

  const activeSourceMultipliers = input.sourceFindings
    .map((finding) => {
      const constraint = input.budget.sourceConstraints[finding.category];
      if (!constraint?.enabled) {
        return undefined;
      }

      return sanitizeSourceConstraintMultiplier(constraint.maxSizeMultiplier);
    })
    .filter((value): value is number => typeof value === 'number' && value > 0);

  if (activeSourceMultipliers.length === 0) {
    return {
      multiplier: normalizedBase,
      policyLevel: 'advisory'
    };
  }

  const strictestSourceMultiplier = Math.min(...activeSourceMultipliers);
  const effectiveMultiplier = Math.min(normalizedBase, strictestSourceMultiplier);

  return {
    multiplier: effectiveMultiplier,
    policyLevel: effectiveMultiplier < normalizedBase ? 'policy' : 'advisory'
  };
}

function sanitizeSourceConstraintMultiplier(value: number): number {
  if (!isPositiveNumber(value)) {
    return 1;
  }

  return value;
}

interface TokenMatch {
  token: string;
  matches: number;
}

function buildRecentTokenMatches(input: {
  question: string;
  entries: JournalEntry[];
  now: Date;
  windowMinutes: number;
}): TokenMatch[] {
  const observed = new Map<string, number>();
  const nowAt = input.now.valueOf();
  const historyWindowMs = input.windowMinutes * 60_000;
  const questionTokens = new Set(parseTokenHints(input.question));

  if (questionTokens.size === 0) {
    return [];
  }

  for (const entry of input.entries) {
    const when = new Date(entry.createdAt).valueOf();
    if (!Number.isFinite(when)) {
      continue;
    }

    if (nowAt - when > historyWindowMs) {
      continue;
    }

    const entryTokens = parseTokenHints(`${entry.question} ${entry.response} ${entry.notes}`);
    for (const token of entryTokens) {
      if (!questionTokens.has(token)) {
        continue;
      }

      observed.set(token, (observed.get(token) ?? 0) + 1);
    }
  }

  return [...observed.entries()]
    .map(([token, matches]) => ({
      token,
      matches
    }))
    .sort((left, right) => right.matches - left.matches);
}

function countRecentTrades(input: { entries: JournalEntry[]; now: Date; windowMinutes: number }): number {
  const windowMs = input.windowMinutes * 60_000;
  return input.entries.filter((entry) => {
    const timestamp = new Date(entry.createdAt).valueOf();
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    return input.now.valueOf() - timestamp <= windowMs;
  }).length;
}

function parseTokenHints(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();
  for (const pattern of TOKEN_PATTERNS) {
    for (const match of normalized.matchAll(pattern)) {
      tokens.add(match[0]);
    }
  }

  return [...tokens];
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
