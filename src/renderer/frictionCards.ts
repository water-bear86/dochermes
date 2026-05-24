import type { FrictionStrictness } from '../shared/types';

export interface FrictionCard {
  id: string;
  question: string;
  warnings: string[];
  prompts: string[];
}

interface BuildFrictionCardInput {
  question: string;
  localWarnings: string[];
  matchedPatternCount: number;
  frictionEnabled: boolean;
  frictionStrictness: FrictionStrictness;
}

interface BuildFrictionCardOptions {
  createId?: () => string;
}

const FRICTION_PROMPTS = [
  'Why now? What changed in the last 30 seconds that would invalidate this setup?',
  'What confirms you are wrong before entering? What is your invalidation plan?',
  'What is the max loss and first action if that threshold is hit?'
];

export function buildFrictionCard(
  input: BuildFrictionCardInput,
  options: BuildFrictionCardOptions = {}
): FrictionCard | undefined {
  if (!input.frictionEnabled) {
    return undefined;
  }

  const normalized = input.question.toLowerCase();
  const hasUrgentSignal = /(immediate|right now|all-in|ape|momentum)/.test(normalized);
  const hasHistoricalRiskSignal = input.matchedPatternCount > 0 || input.localWarnings.length > 0;
  const hasTradeIntentSignal = /(buy|sell|long|short|entry|take position|enter)/.test(normalized);

  const shouldShow =
    (input.frictionStrictness === 'low' && hasUrgentSignal) ||
    (input.frictionStrictness === 'standard' && (hasUrgentSignal || hasHistoricalRiskSignal)) ||
    (input.frictionStrictness === 'high' && (hasUrgentSignal || hasHistoricalRiskSignal || hasTradeIntentSignal));

  if (!shouldShow) {
    return undefined;
  }

  const prompts =
    input.matchedPatternCount > 0
      ? [...FRICTION_PROMPTS, 'Do you still have session risk budget for this entry?']
      : [...FRICTION_PROMPTS];

  return {
    id: options.createId?.() ?? createRandomFrictionCardId(),
    question: input.question.trim(),
    warnings: [...input.localWarnings],
    prompts
  };
}

function createRandomFrictionCardId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `friction-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
