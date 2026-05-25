import { describe, expect, it } from 'vitest';

import type { TradeDecisionEvent, TradeOutcomeEvent } from '../shared/tradeDecision';
import { buildTradeCardViewModel } from './tradeCardViewModel';
import {
  TRADE_DECISION_EVENTS_KEY,
  TRADE_OUTCOME_EVENTS_KEY,
  appendTradeDecisionEvent,
  appendTradeOutcomeEvent,
  buildTradeDecisionEventFromTradeCardAction,
  buildTradeOutcomeEventFromPostmortemOutcome,
  parseTradeDecisionEvents,
  parseTradeOutcomeEvents,
  serializeTradeDecisionEvents
} from './tradeDecisionPersistence';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const createStorage = (): LocalStorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
};

const baseDecision: TradeDecisionEvent = {
  schemaVersion: 'dochermes.decision.v1',
  signalId: 'request-1',
  decidedAt: '2026-05-25T09:00:00.000Z',
  action: 'accepted-recommended',
  requestedSize: { value: 0.5, unit: 'SOL' },
  finalSize: { value: 0.08, unit: 'SOL' },
  override: { used: false, note: '' },
  outcomeLink: {
    schemaVersion: 'dochermes.outcome.v1',
    signalId: 'request-1'
  }
};

const baseOutcome: TradeOutcomeEvent = {
  schemaVersion: 'dochermes.outcome.v1',
  signalId: 'request-1',
  closedAt: '2026-05-25T09:30:00.000Z',
  outcome: {
    status: 'closed',
    pnlPercent: -12,
    maxDrawdownPercent: 18,
    holdTimeMinutes: 30
  },
  review: {
    mistakeTags: ['early-entry'],
    notes: 'Entered too early.'
  }
};

describe('trade decision persistence', () => {
  it('parses valid decision and outcome events while dropping malformed records', () => {
    expect(parseTradeDecisionEvents('not json')).toEqual([]);
    expect(
      parseTradeDecisionEvents(
        JSON.stringify([
          baseDecision,
          { ...baseDecision, schemaVersion: 'wrong' },
          { ...baseDecision, action: 'execute' }
        ])
      )
    ).toEqual([baseDecision]);

    expect(
      parseTradeOutcomeEvents(
        JSON.stringify([
          baseOutcome,
          { ...baseOutcome, schemaVersion: 'wrong' },
          { ...baseOutcome, outcome: { status: 'filled' } }
        ])
      )
    ).toEqual([baseOutcome]);
  });

  it('serializes newest decisions first, caps records, and strips raw execution material', () => {
    const unsafeDecision = {
      ...baseDecision,
      screenshotDataUrl: 'data:image/png;base64,secret',
      orderPayload: { route: 'must-not-survive' },
      wallet: { privateKey: 'must-not-survive' }
    } as TradeDecisionEvent & Record<string, unknown>;
    const newerDecision: TradeDecisionEvent = {
      ...baseDecision,
      signalId: 'request-2',
      decidedAt: '2026-05-25T10:00:00.000Z',
      outcomeLink: { schemaVersion: 'dochermes.outcome.v1', signalId: 'request-2' }
    };

    const serialized = serializeTradeDecisionEvents([unsafeDecision, newerDecision], 1);

    expect(serialized).toBe(JSON.stringify([newerDecision]));
    expect(serialized).not.toContain('screenshotDataUrl');
    expect(serialized).not.toContain('orderPayload');
    expect(serialized).not.toContain('privateKey');
  });

  it('appends and replaces decisions and outcomes by signal id', () => {
    const storage = createStorage();
    const first = appendTradeDecisionEvent(storage, baseDecision);
    const replacement = appendTradeDecisionEvent(storage, {
      ...baseDecision,
      decidedAt: '2026-05-25T09:05:00.000Z',
      action: 'set-alert'
    });

    expect(first).toHaveLength(1);
    expect(replacement).toHaveLength(1);
    expect(replacement[0].action).toBe('set-alert');
    expect(storage.getItem(TRADE_DECISION_EVENTS_KEY)).toContain('set-alert');

    const outcomes = appendTradeOutcomeEvent(storage, baseOutcome);
    const replacedOutcomes = appendTradeOutcomeEvent(storage, {
      ...baseOutcome,
      outcome: { status: 'skipped' }
    });

    expect(outcomes).toHaveLength(1);
    expect(replacedOutcomes).toHaveLength(1);
    expect(replacedOutcomes[0].outcome.status).toBe('skipped');
    expect(storage.getItem(TRADE_OUTCOME_EVENTS_KEY)).toContain('skipped');
  });

  it('builds structured decision events from trade-card actions without execution capability', () => {
    const card = buildTradeCardViewModel({
      question: 'Should I buy 0.5 SOL?',
      response: 'Risk: High\nRecommended size: 0.08 SOL',
      mode: 'policy',
      monitorSignals: [],
      memoryContext: { matchedPatterns: [], recentNotes: [] },
      localWarnings: ['Policy warning']
    });

    const decision = buildTradeDecisionEventFromTradeCardAction({
      signalId: 'request-1',
      decidedAt: '2026-05-25T09:00:00.000Z',
      card,
      action: card.actions.find((candidate) => candidate.kind === 'overrode')!,
      note: 'I understand this violates policy.'
    });

    expect(decision).toMatchObject({
      schemaVersion: 'dochermes.decision.v1',
      signalId: 'request-1',
      action: 'overrode',
      requestedSize: { value: 0.5, unit: 'sol' },
      finalSize: { value: 0.08, unit: 'sol' },
      override: {
        used: true,
        note: 'I understand this violates policy.'
      },
      outcomeLink: {
        schemaVersion: 'dochermes.outcome.v1',
        signalId: 'request-1'
      }
    });
    expect(JSON.stringify(decision)).not.toContain('execute');
    expect(JSON.stringify(decision)).not.toContain('orderPayload');
  });

  it('builds structured outcome events from postmortem outcomes', () => {
    expect(
      buildTradeOutcomeEventFromPostmortemOutcome({
        signalId: 'request-1',
        closedAt: '2026-05-25T10:00:00.000Z',
        postmortem: {
          tag: 'bad-entry',
          notes: 'Entered before confirmation.',
          mistakeTags: ['early-entry'],
          maxLossPercent: 22
        }
      })
    ).toMatchObject({
      schemaVersion: 'dochermes.outcome.v1',
      signalId: 'request-1',
      outcome: {
        status: 'stopped',
        pnlPercent: -22,
        maxDrawdownPercent: 22
      },
      review: {
        followedPlan: false,
        mistakeTags: ['early-entry'],
        notes: 'Entered before confirmation.'
      }
    });
  });
});
