import type {
  MonitoringSignal,
  PersonalRule,
  PersonalRuleContext,
  PersonalRuleMatch,
  PersonalRulePolicyLevel,
  SourceQualityConfidence
} from '../shared/types';

export interface PersonalRuleWarningCandidate {
  text: string;
  policyLevel: PersonalRulePolicyLevel;
  evidence: {
    source: string;
    detail: string;
    confidence: SourceQualityConfidence;
    provenance: string;
    detectedAt?: string;
  };
  ruleId: string;
}

interface EvaluatePersonalRulesInput {
  rules: PersonalRule[];
  question: string;
  monitorSignals: MonitoringSignal[];
  knownLossCount: number;
  now?: string;
}

interface TradeSize {
  value: number;
  unit: string;
}

interface PersonalRuleEvaluation {
  activeRules: PersonalRule[];
  warnings: PersonalRuleWarningCandidate[];
}

const RULE_IMMEDIATE_PATTERNS: RegExp[] = [
  /(never|do not|don't|avoid)\b.*\benter\b.*\bwithout\b.*\b(confirmation|invalidation|plan|trigger)\b/i,
  /(never|do not|don't|avoid)\b.*\bconfirmation\b.*\bbefore\b.*\b(order|entry|trade|position)\b/i
];

const RULE_SIZE_PATTERNS = [
  /(?:position|size|sized|risk|amount|allocation|qty|leverage)\b[^\n]*\b(?:above|greater than|over|more than|exceed|limit)\b[^\n$]*\$?([0-9]+(?:\.[0-9]+)?)\s*(sol|usdc|usdt|eth|weth|btc|wbtc|bnb|arb|usde|sui)?/i,
  /(?:never|do not|don't|avoid)\b.*\b(?:size|trade|allocat|risk)\b[^\n]*\b(?:above|greater than|over|exceed)\b[^\n$]*\$?([0-9]+(?:\.[0-9]+)?)\s*(sol|usdc|usdt|eth|weth|btc|wbtc|bnb|arb|usde|sui)?/i
];

const RULE_DISCOVERY_PATTERN = /within\s+(\d+)\s+minutes/i;
const RULE_COOLDOWN_PATTERN = /without\s+confirmation/i;

export function evaluatePersonalRules(input: EvaluatePersonalRulesInput): PersonalRuleEvaluation {
  const now = input.now ? new Date(input.now).getTime() : Date.now();
  const activeRules = input.rules.filter((rule) => rule.enabled && !rule.archived);
  const warnings: PersonalRuleWarningCandidate[] = [];
  const question = input.question.toLowerCase();
  const questionTradeSize = parseQuestionTradeSize(input.question);
  const signalTokenHints = extractSignalTokens(input.monitorSignals);

  for (const rule of activeRules) {
    const policyLevel = determineRulePolicyLevel(rule.text);
    const detection = detectRuleWarning(rule, question, questionTradeSize, input.knownLossCount, now, signalTokenHints);

    if (!detection) {
      continue;
    }

    warnings.push({
      text: detection.text,
      policyLevel,
      ruleId: rule.id,
      evidence: {
        source: 'Personal rule engine',
        detail: detection.detail,
        confidence: detection.confidence,
        provenance: `Rule ${rule.id} · ${rule.text}`,
        detectedAt: detection.detectedAt
      }
    });
  }

  return {
    activeRules,
    warnings
  };
}

export function buildPersonalRuleContext(input: {
  activeRules: PersonalRule[];
  warnings: PersonalRuleWarningCandidate[];
}): PersonalRuleContext {
  return {
    totalRules: input.activeRules.length,
    activeRules: input.activeRules.length,
    matchedRules: input.warnings.map((warning) => {
      const match: PersonalRuleMatch = {
        ruleId: warning.ruleId,
        text: warning.text,
        policyLevel: warning.policyLevel,
        warningText: warning.text,
        source: warning.evidence.source,
        detail: warning.evidence.detail,
        confidence: warning.evidence.confidence,
        provenance: warning.evidence.provenance
      };

      return match;
    })
  };
}

function detectRuleWarning(
  rule: PersonalRule,
  normalizedQuestion: string,
  questionTradeSize: TradeSize | undefined,
  knownLossCount: number,
  now: number,
  signalTokenHints: Map<string, number>
): { text: string; detail: string; confidence: SourceQualityConfidence; detectedAt?: string } | undefined {
  const text = rule.text.toLowerCase();
  const isConfirmationRule = RULE_IMMEDIATE_PATTERNS.some((pattern) => pattern.test(text));

  if (isConfirmationRule) {
    const hasImmediateImpulse = /(immediate|right now|now|ape|all-in|instantly)/.test(normalizedQuestion);
    const hasTradeIntent = /(buy|sell|long|short|enter|trade|take position|position)/.test(normalizedQuestion);
    const hasConfirmation = /(confirm|confirmation|invalidation|condition|plan)/.test(normalizedQuestion);

    if (hasTradeIntent && !hasConfirmation) {
      if (hasImmediateImpulse) {
        return {
          text: 'Enter-without-confirmation rule triggered before entry timing checks are complete.',
          detail: `Rule "${rule.text}" expects confirmation or explicit invalidation before entering.`,
          confidence: 'high',
          detectedAt: new Date(now).toISOString()
        };
      }

      return {
        text: 'Potential confirmation requirement rule match for this entry question.',
        detail: `Question lacks explicit confirmation wording; rule "${rule.text}" was matched.`,
        confidence: 'medium',
        detectedAt: new Date(now).toISOString()
      };
    }

    return undefined;
  }

  const sizeMatch = RULE_SIZE_PATTERNS.map((pattern) => pattern.exec(text)).find((match) => match !== null);
  if (sizeMatch) {
    const maxSize = Number(sizeMatch[1]);
    const unit = (sizeMatch[2] ?? 'sol').toLowerCase();
    const afterLosses = parseLossThreshold(text);

    if (knownLossCount < afterLosses) {
      return {
        text: `Sizing rule not enforced yet: waiting for ${afterLosses} prior losses.`,
        detail: `Rule "${rule.text}" is active; threshold is ${afterLosses} loss events.`,
        confidence: 'low',
        detectedAt: new Date(now).toISOString()
      };
    }

    if (!questionTradeSize) {
      return {
        text: `Sizing guardrail matched rule "${rule.text}" but question has no explicit numeric size.`,
        detail: `Cannot apply exact rule check for "${rule.text}" until size is present in question.`,
        confidence: 'medium',
        detectedAt: new Date(now).toISOString()
      };
    }

    if (questionTradeSize.unit.toLowerCase() !== unit && unit !== 'sol' && questionTradeSize.unit.toLowerCase() !== 'sol') {
      return {
        text: `Sizing rule matched but unit (${questionTradeSize.unit}) does not match rule unit (${unit || 'any'}).`,
        detail: `Rule limit is ${maxSize} ${unit}; detected ${questionTradeSize.value} ${questionTradeSize.unit}.`,
        confidence: 'low',
        detectedAt: new Date(now).toISOString()
      };
    }

    if (questionTradeSize.value > maxSize) {
      return {
        text: 'Sizing exceeds active rule limit.',
        detail: `Rule "${rule.text}" was matched and candidate size ${questionTradeSize.value} ${questionTradeSize.unit} exceeds threshold ${maxSize}.`,
        confidence: 'high',
        detectedAt: new Date(now).toISOString()
      };
    }

    return undefined;
  }

  if (/new contract|new token|discovery/i.test(text)) {
    const minutes = RULE_DISCOVERY_PATTERN.exec(text);
    const cooldownMinutes = minutes ? Number(minutes[1]) : 5;
    const tokenHints = extractQuestionTokens(rule, normalizedQuestion);

    if (tokenHints.length === 0) {
      return {
        text: 'Discovery cooldown rule active without a current token match.',
        detail: `Rule "${rule.text}" may apply after discovery, but no contract token was detected in the question.`,
        confidence: 'low',
        detectedAt: new Date(now).toISOString()
      };
    }

    const matchFound = tokenHints.some((token) => {
      const seen = signalTokenHints.get(token.toLowerCase());
      return typeof seen === 'number' && now - seen <= cooldownMinutes * 60_000;
    });

    if (matchFound && RULE_COOLDOWN_PATTERN.test(text) && !/(confirmation|confirm)/.test(normalizedQuestion)) {
      return {
        text: `Discovery cooldown rule requires waiting after discovery on ${cooldownMinutes} minute window.`,
        detail: `Rule "${rule.text}" matched token recently seen in clipboard/monitoring signals.`,
        confidence: 'high',
        detectedAt: new Date(now).toISOString()
      };
    }

    if (matchFound) {
      return {
        text: `Discovery rule "${rule.text}" sees recent token activity and may require delay.`,
        detail: `No explicit confirmation detected before this discovery-driven trade intent.`,
        confidence: 'medium',
        detectedAt: new Date(now).toISOString()
      };
    }

    return {
      text: `Discovery rule "${rule.text}" not enforceable from current inputs.`,
      detail: `No matching discovery signal was observed in the last ${cooldownMinutes} minutes.`,
      confidence: 'low',
      detectedAt: new Date(now).toISOString()
    };
  }

  if (/wait for confirmation/.test(text) && !/(confirm|confirmation|invalidation)/.test(normalizedQuestion)) {
    return {
      text: `Rule "${rule.text}" suggests confirmation before acting.`,
      detail: 'Consider adding explicit confirmation conditions before entry.',
      confidence: 'low',
      detectedAt: new Date(now).toISOString()
    };
  }

  return undefined;
}

function determineRulePolicyLevel(ruleText: string): PersonalRulePolicyLevel {
  if (/\b(required|must|mandatory|must not|never)\b/i.test(ruleText) && !/\b(advisory|suggest|should)\b/i.test(ruleText)) {
    return 'policy';
  }

  if (/\b(before|until|unless)\b/i.test(ruleText)) {
    return 'guardrail';
  }

  return 'advisory';
}

function parseLossThreshold(ruleText: string): number {
  const match = /after\s+(\d+)\s+loss/i.exec(ruleText);
  if (!match?.[1]) {
    return 0;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseQuestionTradeSize(question: string): TradeSize | undefined {
  const match = /(?:size|amount|position|allocation|risk|qty)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(sol|usdc|usdt|eth|weth|btc|wbtc|bnb|arb|usde|sui)?/i.exec(question);

  if (!match?.[1]) {
    return undefined;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return {
    value,
    unit: (match[2] ?? 'sol').toLowerCase()
  };
}

function extractSignalTokens(signals: MonitoringSignal[]): Map<string, number> {
  const tokenMap = new Map<string, number>();

  for (const signal of signals) {
    if (!signal.value) {
      continue;
    }

    if (isLikelyAddress(signal.value)) {
      tokenMap.set(signal.value.toLowerCase(), new Date(signal.detectedAt).valueOf());
    }
  }

  return tokenMap;
}

function extractQuestionTokens(rule: PersonalRule, question: string): string[] {
  const matches = [...question.matchAll(/[0-9a-fA-F]{8,64}|[1-9A-HJ-NP-Za-km-z]{32,44}/g)];
  const tokenHints = new Set<string>();

  const rawRuleTokens = [...(rule.text.matchAll(/[0-9a-fA-F]{8,64}|[1-9A-HJ-NP-Za-km-z]{32,44}/g))].map((tokenMatch) =>
    tokenMatch[0]?.toLowerCase()
  );

  for (const token of rawRuleTokens) {
    if (token) {
      tokenHints.add(token);
    }
  }

  for (const match of matches) {
    const rawToken = match[0]?.toLowerCase();
    if (rawToken) {
      tokenHints.add(rawToken);
    }
  }

  return Array.from(tokenHints);
}

function isLikelyAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{40,44}$/.test(value);
}
