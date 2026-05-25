import type { CoachMode } from './types';
import type { TradeDecisionAction, TradeDecisionEvent, TradeDecisionOverride, TradeSize, TradeCard } from './tradeDecision';

export const BOT_EXECUTION_GATE_SCHEMA_VERSION = 'dochermes.execution-gate.v1' as const;

export type BotExecutionGateStatus = 'allowed' | 'warn' | 'requires-override' | 'override-accepted' | 'not-requested';

export interface BuildBotExecutionGateDecisionInput {
  card: TradeCard;
  decision?: TradeDecisionEvent;
  evaluatedAt: string;
}

export interface BotExecutionGateDecision {
  schemaVersion: typeof BOT_EXECUTION_GATE_SCHEMA_VERSION;
  signalId: string;
  evaluatedAt: string;
  mode: CoachMode;
  status: BotExecutionGateStatus;
  canContinueToBotConfirmation: boolean;
  requiresExplicitOverride: boolean;
  overrideAccepted: boolean;
  reasons: string[];
  userDecision?: {
    action: TradeDecisionAction;
    requestedSize?: TradeSize;
    finalSize?: TradeSize;
  };
  override?: {
    reasonCode?: string;
  };
  executionBoundary: {
    docHermesCanExecute: false;
    botOwnsExecution: true;
    advisoryOnly: true;
    prohibitedActions: BotExecutionBoundaryProhibitedAction[];
    note: string;
  };
}

export type BotExecutionBoundaryProhibitedAction =
  | 'hold-private-keys'
  | 'request-seed-phrase'
  | 'request-wallet-approval'
  | 'sign-transaction'
  | 'route-order'
  | 'place-trade'
  | 'submit-transaction'
  | 'withdraw-funds';

const CONTINUING_ACTIONS = new Set<TradeDecisionAction>(['accepted-recommended', 'resized', 'overrode']);

const PROHIBITED_ACTIONS: BotExecutionBoundaryProhibitedAction[] = [
  'hold-private-keys',
  'request-seed-phrase',
  'request-wallet-approval',
  'sign-transaction',
  'route-order',
  'place-trade',
  'submit-transaction',
  'withdraw-funds'
];

export function buildBotExecutionGateDecision(input: BuildBotExecutionGateDecisionInput): BotExecutionGateDecision {
  if (input.decision && input.decision.signalId !== input.card.signalId) {
    throw new Error('Trade card and decision must reference the same signal id before building an execution gate.');
  }

  const reasons = collectGateReasons(input.card);
  const requiresExplicitOverride = input.card.mode === 'policy' && input.card.override.required;
  const overrideAccepted = requiresExplicitOverride && hasExplicitOverride(input.decision?.override);
  const userRequestedContinuation = input.decision ? CONTINUING_ACTIONS.has(input.decision.action) : false;
  const canContinueToBotConfirmation = userRequestedContinuation && (!requiresExplicitOverride || overrideAccepted);
  const status = resolveGateStatus({
    mode: input.card.mode,
    hasWarnings: reasons.length > 0,
    hasDecision: Boolean(input.decision),
    userRequestedContinuation,
    requiresExplicitOverride,
    overrideAccepted,
    canContinueToBotConfirmation
  });

  return {
    schemaVersion: BOT_EXECUTION_GATE_SCHEMA_VERSION,
    signalId: input.card.signalId,
    evaluatedAt: input.evaluatedAt,
    mode: input.card.mode,
    status,
    canContinueToBotConfirmation,
    requiresExplicitOverride,
    overrideAccepted,
    reasons,
    ...(input.decision
      ? {
          userDecision: buildUserDecision(input.decision)
        }
      : {}),
    ...(overrideAccepted && input.decision?.override
      ? {
          override: buildOverride(input.decision.override)
        }
      : {}),
    executionBoundary: {
      docHermesCanExecute: false,
      botOwnsExecution: true,
      advisoryOnly: true,
      prohibitedActions: [...PROHIBITED_ACTIONS],
      note: 'DocHermes provides local coaching metadata only. The trading bot owns confirmation, routing, signing, and execution.'
    }
  };
}

function collectGateReasons(card: TradeCard): string[] {
  if (card.mode === 'policy' && card.override.reasons.length > 0) {
    return [...card.override.reasons];
  }

  return card.warnings
    .filter((warning) => warning.level === 'guardrail' || warning.level === 'policy' || warning.requiresPolicyOverride)
    .map((warning) => warning.policyOverrideReason ?? warning.message)
    .filter((reason) => reason.trim().length > 0);
}

function resolveGateStatus(input: {
  mode: CoachMode;
  hasWarnings: boolean;
  hasDecision: boolean;
  userRequestedContinuation: boolean;
  requiresExplicitOverride: boolean;
  overrideAccepted: boolean;
  canContinueToBotConfirmation: boolean;
}): BotExecutionGateStatus {
  if (input.hasDecision && !input.userRequestedContinuation) {
    return 'not-requested';
  }

  if (input.overrideAccepted) {
    return 'override-accepted';
  }

  if (input.requiresExplicitOverride) {
    return 'requires-override';
  }

  if (input.mode === 'guardrail' && input.hasWarnings) {
    return 'warn';
  }

  return input.canContinueToBotConfirmation ? 'allowed' : 'not-requested';
}

function buildUserDecision(decision: TradeDecisionEvent): BotExecutionGateDecision['userDecision'] {
  return {
    action: decision.action,
    ...(decision.requestedSize ? { requestedSize: { ...decision.requestedSize } } : {}),
    ...(decision.finalSize ? { finalSize: { ...decision.finalSize } } : {})
  };
}

function buildOverride(override: TradeDecisionOverride): NonNullable<BotExecutionGateDecision['override']> {
  return {
    ...(override.reasonCode ? { reasonCode: override.reasonCode } : {})
  };
}

function hasExplicitOverride(override: TradeDecisionOverride | undefined): boolean {
  return Boolean(override?.used && override.note.trim().length > 0 && override.reasonCode?.trim());
}
