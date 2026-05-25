import {
  ALLOWED_TRADE_DECISION_ACTIONS,
  TRADE_DECISION_SCHEMA_VERSION,
  TRADE_OUTCOME_SCHEMA_VERSION,
  type OutcomeStatus,
  type TradeDecisionAction,
  type TradeDecisionEvent,
  type TradeOutcomeEvent,
  type TradeSize
} from '../shared/tradeDecision';
import type { TradeCardActionViewModel, TradeCardViewModel } from './tradeCardViewModel';
import { parseTradeSize } from './tradeHistory';
import type { PostmortemOutcomeRecord } from './postmortem';

export const TRADE_DECISION_EVENTS_KEY = 'hermes.trade.decisions.v1';
export const TRADE_OUTCOME_EVENTS_KEY = 'hermes.trade.outcomes.v1';
export const TRADE_DECISION_EVENT_LIMIT = 300;
export const TRADE_OUTCOME_EVENT_LIMIT = 300;

const OUTCOME_STATUSES = ['open', 'closed', 'stopped', 'expired', 'skipped', 'unknown'] as const;

export function parseTradeDecisionEvents(rawValue: string | null): TradeDecisionEvent[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(sanitizeTradeDecisionEvent)
      .filter((event): event is TradeDecisionEvent => event !== undefined)
      .sort(sortDecisionsNewestFirst);
  } catch {
    return [];
  }
}

export function serializeTradeDecisionEvents(
  entries: TradeDecisionEvent[],
  limit = TRADE_DECISION_EVENT_LIMIT
): string {
  return JSON.stringify(
    entries
      .map(sanitizeTradeDecisionEvent)
      .filter((event): event is TradeDecisionEvent => event !== undefined)
      .sort(sortDecisionsNewestFirst)
      .slice(0, limit)
  );
}

export function readTradeDecisionEvents(storage: Pick<Storage, 'getItem'>): TradeDecisionEvent[] {
  return parseTradeDecisionEvents(storage.getItem(TRADE_DECISION_EVENTS_KEY));
}

export function appendTradeDecisionEvent(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  event: TradeDecisionEvent,
  limit = TRADE_DECISION_EVENT_LIMIT
): TradeDecisionEvent[] {
  const sanitized = sanitizeTradeDecisionEvent(event);
  if (!sanitized) {
    return readTradeDecisionEvents(storage);
  }

  const entries = [
    sanitized,
    ...readTradeDecisionEvents(storage).filter((entry) => entry.signalId !== sanitized.signalId)
  ].sort(sortDecisionsNewestFirst);
  storage.setItem(TRADE_DECISION_EVENTS_KEY, serializeTradeDecisionEvents(entries, limit));
  return entries.slice(0, limit);
}

export function parseTradeOutcomeEvents(rawValue: string | null): TradeOutcomeEvent[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(sanitizeTradeOutcomeEvent)
      .filter((event): event is TradeOutcomeEvent => event !== undefined)
      .sort(sortOutcomesNewestFirst);
  } catch {
    return [];
  }
}

export function serializeTradeOutcomeEvents(entries: TradeOutcomeEvent[], limit = TRADE_OUTCOME_EVENT_LIMIT): string {
  return JSON.stringify(
    entries
      .map(sanitizeTradeOutcomeEvent)
      .filter((event): event is TradeOutcomeEvent => event !== undefined)
      .sort(sortOutcomesNewestFirst)
      .slice(0, limit)
  );
}

export function readTradeOutcomeEvents(storage: Pick<Storage, 'getItem'>): TradeOutcomeEvent[] {
  return parseTradeOutcomeEvents(storage.getItem(TRADE_OUTCOME_EVENTS_KEY));
}

export function appendTradeOutcomeEvent(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  event: TradeOutcomeEvent,
  limit = TRADE_OUTCOME_EVENT_LIMIT
): TradeOutcomeEvent[] {
  const sanitized = sanitizeTradeOutcomeEvent(event);
  if (!sanitized) {
    return readTradeOutcomeEvents(storage);
  }

  const entries = [
    sanitized,
    ...readTradeOutcomeEvents(storage).filter((entry) => entry.signalId !== sanitized.signalId)
  ].sort(sortOutcomesNewestFirst);
  storage.setItem(TRADE_OUTCOME_EVENTS_KEY, serializeTradeOutcomeEvents(entries, limit));
  return entries.slice(0, limit);
}

export function buildTradeDecisionEventFromTradeCardAction(input: {
  signalId: string;
  decidedAt: string;
  card: TradeCardViewModel;
  action: TradeCardActionViewModel;
  note?: string;
}): TradeDecisionEvent {
  const action = input.action.kind as TradeDecisionAction;
  const note = input.note?.trim() ?? '';
  const requestedSize = toTradeSize(parseTradeSize(input.card.proposedTrade));
  const finalSize =
    input.action.kind === 'accepted-recommended' || input.action.kind === 'overrode'
      ? toTradeSize(parseTradeSize(input.card.recommendedSize)) ?? requestedSize
      : undefined;

  return {
    schemaVersion: TRADE_DECISION_SCHEMA_VERSION,
    signalId: input.signalId,
    decidedAt: input.decidedAt,
    action,
    ...(requestedSize ? { requestedSize } : {}),
    ...(finalSize ? { finalSize } : {}),
    override: {
      used: input.action.kind === 'overrode',
      note,
      ...(input.action.kind === 'overrode' ? { reasonCode: 'manual-override' } : {})
    },
    outcomeLink: {
      schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
      signalId: input.signalId
    }
  };
}

export function buildTradeOutcomeEventFromPostmortemOutcome(input: {
  signalId: string;
  closedAt: string;
  postmortem: Pick<PostmortemOutcomeRecord, 'tag' | 'notes' | 'mistakeTags' | 'maxLossPercent'>;
}): TradeOutcomeEvent {
  const maxLossPercent = input.postmortem.maxLossPercent;
  const status = outcomeStatusFromPostmortemTag(input.postmortem.tag);
  const followedPlan = input.postmortem.tag === 'followed-plan' || input.postmortem.tag === 'good-skip';
  const pnlPercent =
    (input.postmortem.tag === 'bad-entry' || input.postmortem.tag === 'ignored-warning') &&
    typeof maxLossPercent === 'number' &&
    Number.isFinite(maxLossPercent)
      ? -Math.abs(maxLossPercent)
      : undefined;

  return {
    schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
    signalId: input.signalId,
    closedAt: input.closedAt,
    outcome: {
      status,
      ...(pnlPercent !== undefined ? { pnlPercent } : {}),
      ...(typeof maxLossPercent === 'number' && Number.isFinite(maxLossPercent)
        ? { maxDrawdownPercent: Math.abs(maxLossPercent) }
        : {})
    },
    review: {
      followedPlan,
      ...(input.postmortem.mistakeTags && input.postmortem.mistakeTags.length > 0
        ? { mistakeTags: sanitizeTags(input.postmortem.mistakeTags) }
        : {}),
      ...(input.postmortem.notes?.trim() ? { notes: input.postmortem.notes.trim() } : {})
    }
  };
}

function sanitizeTradeDecisionEvent(value: unknown): TradeDecisionEvent | undefined {
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
      ...(record.override.reasonCode?.trim() ? { reasonCode: record.override.reasonCode.trim() } : {})
    },
    outcomeLink: {
      schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
      signalId: record.signalId
    }
  };
}

function sanitizeTradeOutcomeEvent(value: unknown): TradeOutcomeEvent | undefined {
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

  return {
    schemaVersion: TRADE_OUTCOME_SCHEMA_VERSION,
    signalId: record.signalId,
    ...(record.positionId?.trim() ? { positionId: record.positionId.trim() } : {}),
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
            ...(review.mistakeTags ? { mistakeTags: sanitizeTags(review.mistakeTags) } : {}),
            ...(review.notes?.trim() ? { notes: review.notes.trim() } : {})
          }
        }
      : {})
  };
}

function isTradeDecisionAction(value: string): value is TradeDecisionAction {
  return ALLOWED_TRADE_DECISION_ACTIONS.some((action) => action === value);
}

function isOutcomeStatus(value: string): value is OutcomeStatus {
  return OUTCOME_STATUSES.some((status) => status === value);
}

function sanitizeTradeSize(size: TradeSize | undefined): TradeSize | undefined {
  if (!size || typeof size.value !== 'number' || !Number.isFinite(size.value) || size.value <= 0 || typeof size.unit !== 'string') {
    return undefined;
  }

  return {
    value: size.value,
    unit: size.unit.trim()
  };
}

function toTradeSize(size: { value: number; unit: string } | undefined): TradeSize | undefined {
  return size ? { value: size.value, unit: size.unit } : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeTags(tags: string[]): string[] | undefined {
  const cleaned = Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 8);
  return cleaned.length > 0 ? cleaned : undefined;
}

function outcomeStatusFromPostmortemTag(tag: PostmortemOutcomeRecord['tag']): OutcomeStatus {
  if (tag === 'good-skip') {
    return 'skipped';
  }
  if (tag === 'bad-entry' || tag === 'ignored-warning') {
    return 'stopped';
  }
  if (tag === 'followed-plan') {
    return 'closed';
  }
  return 'unknown';
}

function sortDecisionsNewestFirst(left: TradeDecisionEvent, right: TradeDecisionEvent): number {
  return right.decidedAt.localeCompare(left.decidedAt);
}

function sortOutcomesNewestFirst(left: TradeOutcomeEvent, right: TradeOutcomeEvent): number {
  return right.closedAt.localeCompare(left.closedAt);
}
