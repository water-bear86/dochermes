import { describe, expect, it } from 'vitest';

import { buildBotExecutionGateDecision } from './executionGate';
import { createTradeCard, createTradeDecisionEvent } from './tradeDecision';
import type { CoachAssessment, TradeDecisionAction, TradeDecisionEvent, TradeSignalInput } from './tradeDecision';

const baseSignal: TradeSignalInput = {
  schemaVersion: 'dochermes.signal.v1',
  signalId: 'sig_gate_1',
  createdAt: '2026-05-25T17:00:00.000Z',
  source: {
    type: 'wallet-alert',
    label: 'tracked-wallet',
    confidence: 'medium'
  },
  asset: {
    symbol: 'ABC',
    tokenAddress: 'So11111111111111111111111111111111111111112',
    chain: 'solana',
    pairAddress: 'pair_gate_1'
  },
  market: {
    tokenAgeMinutes: 42,
    liquidityUsd: 118000
  },
  proposedTrade: {
    side: 'buy',
    size: 0.5,
    unit: 'SOL',
    strategy: 'early-momentum'
  },
  botContext: {
    platform: 'test-bot',
    routePreview: 'read-only quote preview',
    executionCapability: true
  }
};

const baseAssessment: CoachAssessment = {
  schemaVersion: 'dochermes.assessment.v1',
  signalId: 'sig_gate_1',
  risk: 'high',
  recommendedAction: 'wait',
  recommendedSize: {
    value: 0.08,
    unit: 'SOL'
  },
  reason: 'Similar immediate entries performed poorly.',
  warnings: []
};

describe('bot execution gate contract', () => {
  it('keeps policy-mode violations blocked until the user records an explicit override', () => {
    const card = createTradeCard({
      mode: 'policy',
      signal: baseSignal,
      assessment: withPolicyWarning('daily-loss-limit', 'Daily loss policy requires explicit user override.'),
      createdAt: '2026-05-25T17:01:00.000Z'
    });

    const gate = buildBotExecutionGateDecision({
      card,
      evaluatedAt: '2026-05-25T17:02:00.000Z'
    });

    expect(gate).toMatchObject({
      schemaVersion: 'dochermes.execution-gate.v1',
      signalId: 'sig_gate_1',
      mode: 'policy',
      status: 'requires-override',
      canContinueToBotConfirmation: false,
      requiresExplicitOverride: true,
      overrideAccepted: false,
      reasons: ['Daily loss policy requires explicit user override.'],
      executionBoundary: {
        docHermesCanExecute: false,
        botOwnsExecution: true,
        advisoryOnly: true
      }
    });
  });

  it('allows advisory decisions to continue to the bot without claiming DocHermes can execute', () => {
    const card = createTradeCard({
      mode: 'advisory',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-25T17:01:00.000Z'
    });
    const decision = createTradeDecisionEvent({
      card,
      decidedAt: '2026-05-25T17:03:00.000Z',
      action: 'accepted-recommended',
      requestedSize: { value: 0.5, unit: 'SOL' },
      finalSize: { value: 0.08, unit: 'SOL' }
    });

    const gate = buildBotExecutionGateDecision({
      card,
      decision,
      evaluatedAt: '2026-05-25T17:04:00.000Z'
    });

    expect(gate.status).toBe('allowed');
    expect(gate.canContinueToBotConfirmation).toBe(true);
    expect(gate.requiresExplicitOverride).toBe(false);
    expect(gate.userDecision).toEqual({
      action: 'accepted-recommended',
      requestedSize: { value: 0.5, unit: 'SOL' },
      finalSize: { value: 0.08, unit: 'SOL' }
    });
    expect(gate.executionBoundary.docHermesCanExecute).toBe(false);
    expect(gate.executionBoundary.prohibitedActions).toContain('place-trade');
  });

  it('keeps guardrail decisions non-blocking but exposes warning reasons to the bot UI', () => {
    const card = createTradeCard({
      mode: 'guardrail',
      signal: baseSignal,
      assessment: {
        ...baseAssessment,
        warnings: [
          {
            level: 'guardrail',
            code: 'oversize',
            message: 'Proposed size exceeds the local risk budget.',
            detail: '0.5 SOL is above the recommended 0.08 SOL sizing.',
            confidence: 'high'
          }
        ]
      },
      createdAt: '2026-05-25T17:01:00.000Z'
    });
    const decision = createTradeDecisionEvent({
      card,
      decidedAt: '2026-05-25T17:03:00.000Z',
      action: 'resized',
      requestedSize: { value: 0.5, unit: 'SOL' },
      finalSize: { value: 0.08, unit: 'SOL' }
    });

    const gate = buildBotExecutionGateDecision({
      card,
      decision,
      evaluatedAt: '2026-05-25T17:04:00.000Z'
    });

    expect(gate.status).toBe('warn');
    expect(gate.canContinueToBotConfirmation).toBe(true);
    expect(gate.reasons).toEqual(['Proposed size exceeds the local risk budget.']);
  });

  it('allows policy-mode continuation only after explicit override metadata is present', () => {
    const card = createTradeCard({
      mode: 'policy',
      signal: baseSignal,
      assessment: withPolicyWarning('low-liquidity-source', 'Low-liquidity source policy needs override.'),
      createdAt: '2026-05-25T17:01:00.000Z'
    });
    const decision = createTradeDecisionEvent({
      card,
      decidedAt: '2026-05-25T17:03:00.000Z',
      action: 'overrode',
      requestedSize: { value: 0.5, unit: 'SOL' },
      finalSize: { value: 0.5, unit: 'SOL' },
      override: {
        used: true,
        note: 'I understand liquidity is thin and want the bot to continue.',
        reasonCode: 'low-liquidity-source'
      }
    });

    const gate = buildBotExecutionGateDecision({
      card,
      decision,
      evaluatedAt: '2026-05-25T17:04:00.000Z'
    });

    expect(gate).toMatchObject({
      status: 'override-accepted',
      canContinueToBotConfirmation: true,
      requiresExplicitOverride: true,
      overrideAccepted: true,
      override: {
        reasonCode: 'low-liquidity-source'
      }
    });
    expect(JSON.stringify(gate)).not.toContain('I understand liquidity is thin');
  });

  it('does not request bot execution for wait, alert, plan, or reject decisions', () => {
    const card = createTradeCard({
      mode: 'guardrail',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-25T17:01:00.000Z'
    });

    const gate = buildBotExecutionGateDecision({
      card,
      decision: createTradeDecisionEvent({
        card,
        decidedAt: '2026-05-25T17:03:00.000Z',
        action: 'set-alert'
      }),
      evaluatedAt: '2026-05-25T17:04:00.000Z'
    });

    expect(gate.status).toBe('not-requested');
    expect(gate.canContinueToBotConfirmation).toBe(false);
  });

  it.each<TradeDecisionAction>(['waited', 'set-alert', 'created-plan', 'rejected'])(
    'treats %s as not requested even when policy warnings exist',
    (action) => {
      const card = createTradeCard({
        mode: 'policy',
        signal: baseSignal,
        assessment: withPolicyWarning('daily-loss-limit', 'Daily loss policy requires explicit user override.'),
        createdAt: '2026-05-25T17:01:00.000Z'
      });

      const gate = buildBotExecutionGateDecision({
        card,
        decision: createTradeDecisionEvent({
          card,
          decidedAt: '2026-05-25T17:03:00.000Z',
          action
        }),
        evaluatedAt: '2026-05-25T17:04:00.000Z'
      });

      expect(gate.status).toBe('not-requested');
      expect(gate.canContinueToBotConfirmation).toBe(false);
      expect(gate.requiresExplicitOverride).toBe(true);
      expect(gate.overrideAccepted).toBe(false);
    }
  );

  it('omits unsafe execution material from successful gate payloads', () => {
    const card = createTradeCard({
      mode: 'advisory',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-25T17:01:00.000Z'
    });
    const decision = {
      ...createTradeDecisionEvent({
        card,
        decidedAt: '2026-05-25T17:03:00.000Z',
        action: 'accepted-recommended'
      }),
      orderPayload: {
        side: 'buy',
        size: '0.5 SOL'
      },
      walletApproval: 'approve-this',
      privateKey: 'must-not-survive',
      signTransaction: true
    } satisfies TradeDecisionEvent & Record<string, unknown>;

    const gate = buildBotExecutionGateDecision({
      card,
      decision,
      evaluatedAt: '2026-05-25T17:04:00.000Z'
    });
    const serializedGate = JSON.stringify(gate);

    expect(gate.status).toBe('allowed');
    expect(serializedGate).not.toContain('orderPayload');
    expect(serializedGate).not.toContain('walletApproval');
    expect(serializedGate).not.toContain('privateKey');
    expect(serializedGate).not.toContain('signTransaction');
  });

  it('rejects mismatched card and decision signal ids and never copies unsafe execution material', () => {
    const card = createTradeCard({
      mode: 'advisory',
      signal: baseSignal,
      assessment: baseAssessment,
      createdAt: '2026-05-25T17:01:00.000Z'
    });
    const decision = {
      ...createTradeDecisionEvent({
        card,
        decidedAt: '2026-05-25T17:03:00.000Z',
        action: 'accepted-recommended'
      }),
      signalId: 'other_signal',
      orderPayload: {
        side: 'buy',
        size: '0.5 SOL'
      }
    };

    expect(() =>
      buildBotExecutionGateDecision({
        card,
        decision,
        evaluatedAt: '2026-05-25T17:04:00.000Z'
      })
    ).toThrow(/same signal/i);
  });
});

function withPolicyWarning(code: string, message: string): CoachAssessment {
  return {
    ...baseAssessment,
    warnings: [
      {
        level: 'policy',
        code,
        message,
        requiresPolicyOverride: true,
        policyOverrideReason: message,
        confidence: 'high'
      }
    ]
  };
}
