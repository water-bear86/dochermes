import { describe, expect, it } from 'vitest';

import {
  ALLOWED_TRADE_DECISION_ACTIONS,
  createTradeCard,
  createTradeDecisionEvent
} from './tradeDecision';
import type { CoachAssessment, TradeSignalInput } from './tradeDecision';

const baseSignal: TradeSignalInput = {
  schemaVersion: 'dochermes.signal.v1',
  signalId: 'sig_123',
  createdAt: '2026-05-23T15:00:00.000Z',
  source: {
    type: 'wallet-alert',
    label: 'tracked-wallet',
    confidence: 'medium'
  },
  asset: {
    symbol: 'ABC',
    tokenAddress: 'So11111111111111111111111111111111111111112',
    chain: 'solana',
    pairAddress: 'pair_123'
  },
  market: {
    tokenAgeMinutes: 42,
    liquidityUsd: 118000,
    holderConcentration: 'elevated',
    recentVolumeTrend: 'expanding',
    poolAddress: 'pool_123',
    dex: 'raydium',
    priceChange: {
      m5Percent: 12.4,
      h1Percent: 41.8,
      h24Percent: 88.2
    },
    volumeUsd: {
      m5: 42000,
      h1: 310000,
      h24: 1800000
    },
    transactions: {
      m5Buys: 43,
      m5Sells: 18,
      h1Buys: 412,
      h1Sells: 190
    }
  },
  analysisContext: {
    technicalIndicators: [
      {
        name: 'rsi',
        timeframe: '5m',
        value: 78.2,
        interpretation: 'overbought'
      }
    ],
    sentiment: {
      score: 0.35,
      label: 'moderately-positive',
      sources: ['rss-news', 'social-summary']
    },
    providerEvidence: [
      {
        provider: 'coingecko',
        kind: 'pool-data',
        observedAt: '2026-05-23T15:00:00.000Z',
        confidence: 'high',
        detail: 'Pool liquidity and volume evidence only.'
      }
    ]
  },
  proposedTrade: {
    side: 'buy',
    size: 0.5,
    unit: 'SOL',
    strategy: 'early-momentum'
  },
  botContext: {
    platform: 'test-bot',
    routePreview: 'readonly route summary',
    executionCapability: true
  }
};

const baseAssessment: CoachAssessment = {
  schemaVersion: 'dochermes.assessment.v1',
  signalId: 'sig_123',
  risk: 'high',
  recommendedAction: 'wait',
  recommendedSize: {
    value: 0.08,
    unit: 'SOL'
  },
  reason: 'This resembles prior early-entry trades where oversized allocation performed poorly.',
  plan: {
    entry: 'Wait for confirmation above current range.',
    invalidation: 'Exit if liquidity drops by 20% or price loses support.',
    takeProfit: 'Reduce 50% at 2x.',
    maxHoldTimeMinutes: 45
  },
  memory: {
    matchedPriorTrades: 14,
    summary: 'Immediate entries under similar conditions averaged -22%; confirmation entries averaged +8%.'
  },
  warnings: [
    {
      level: 'guardrail',
      code: 'oversize',
      message: 'Proposed size exceeds the recommended risk budget for this setup.',
      source: 'Session risk budget',
      detail: 'Candidate size is above the local size limit.',
      confidence: 'high'
    }
  ]
};

describe('trade decision domain model', () => {
  it('creates a deterministic trade card with read-only market evidence and coach guidance', () => {
    const card = createTradeCard({
      mode: 'guardrail',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-23T15:01:00.000Z'
    });

    expect(card).toMatchObject({
      schemaVersion: 'dochermes.trade-card.v1',
      signalId: 'sig_123',
      mode: 'guardrail',
      createdAt: '2026-05-23T15:01:00.000Z',
      asset: {
        symbol: 'ABC',
        chain: 'solana'
      },
      proposedTrade: {
        side: 'buy',
        size: {
          value: 0.5,
          unit: 'SOL'
        },
        strategy: 'early-momentum'
      },
      recommendation: {
        action: 'wait',
        size: {
          value: 0.08,
          unit: 'SOL'
        },
        risk: 'high'
      },
      marketEvidence: {
        liquidityUsd: 118000,
        technicalIndicators: [
          {
            name: 'rsi',
            timeframe: '5m',
            value: 78.2,
            interpretation: 'overbought'
          }
        ],
        providerEvidence: [
          {
            provider: 'coingecko',
            kind: 'pool-data',
            observedAt: '2026-05-23T15:00:00.000Z'
          }
        ]
      },
      execution: {
        docHermesCanExecute: false,
        botOwnsExecution: true
      }
    });
  });

  it('exposes recommended size and the full contract decision action set', () => {
    const card = createTradeCard({
      mode: 'advisory',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-23T15:01:00.000Z'
    });

    expect(card.recommendation.action).toBe('wait');
    expect(card.recommendation.size).toEqual({ value: 0.08, unit: 'SOL' });
    expect(card.allowedActions).toEqual(ALLOWED_TRADE_DECISION_ACTIONS);
  });

  it('requires explicit override metadata when policy warnings are present', () => {
    const card = createTradeCard({
      mode: 'policy',
      signal: baseSignal,
      assessment: {
        ...baseAssessment,
        warnings: [
          {
            level: 'policy',
            code: 'daily-loss-limit',
            message: 'Session max-loss budget exceeded.',
            requiresPolicyOverride: true,
            policyOverrideReason: 'Daily loss policy requires explicit user override.',
            source: 'Session risk budget',
            detail: 'Tracked losses exceed configured cap.',
            confidence: 'high'
          }
        ]
      },
      createdAt: '2026-05-23T15:01:00.000Z'
    });

    expect(card.override.required).toBe(true);
    expect(card.override.reasons).toEqual(['Daily loss policy requires explicit user override.']);

    expect(() =>
      createTradeDecisionEvent({
        card,
        decidedAt: '2026-05-23T15:03:00.000Z',
        action: 'overrode',
        requestedSize: { value: 0.5, unit: 'SOL' },
        finalSize: { value: 0.5, unit: 'SOL' }
      })
    ).toThrow(/explicit override/i);

    expect(
      createTradeDecisionEvent({
        card,
        decidedAt: '2026-05-23T15:03:00.000Z',
        action: 'overrode',
        requestedSize: { value: 0.5, unit: 'SOL' },
        finalSize: { value: 0.5, unit: 'SOL' },
        override: {
          used: true,
          note: 'I understand this violates the daily loss policy.',
          reasonCode: 'daily-loss-limit'
        }
      })
    ).toMatchObject({
      schemaVersion: 'dochermes.decision.v1',
      signalId: 'sig_123',
      action: 'overrode',
      override: {
        used: true,
        note: 'I understand this violates the daily loss policy.',
        reasonCode: 'daily-loss-limit'
      }
    });
  });

  it('rejects actions outside the contract decision action set', () => {
    const card = createTradeCard({
      mode: 'advisory',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-23T15:01:00.000Z'
    });

    expect(() =>
      createTradeDecisionEvent({
        card,
        decidedAt: '2026-05-23T15:03:00.000Z',
        action: 'execute' as never
      })
    ).toThrow(/not allowed/i);
  });

  it('rejects DocHermes execution-capability fields and wallet-control material', () => {
    expect(() =>
      createTradeCard({
        mode: 'advisory',
        signal: {
          ...baseSignal,
          docHermesExecutionCapability: true
        } as never,
        assessment: baseAssessment,
        createdAt: '2026-05-23T15:01:00.000Z'
      })
    ).toThrow(/execution authority/i);

    expect(() =>
      createTradeCard({
        mode: 'advisory',
        signal: {
          ...baseSignal,
          wallet: {
            privateKey: 'must-not-survive'
          }
        } as never,
        assessment: baseAssessment,
        createdAt: '2026-05-23T15:01:00.000Z'
      })
    ).toThrow(/wallet-control/i);
  });
});
