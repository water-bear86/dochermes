import { describe, expect, it } from 'vitest';

import type { MonitoringSignal } from '../shared/types';
import { evaluatePersonalRules, buildPersonalRuleContext } from './personalRules';

describe('evaluatePersonalRules', () => {
  it('returns policy warning when an active confirmation rule matches an immediate trade question', () => {
    const result = evaluatePersonalRules({
      rules: [
        {
          id: 'r-1',
          text: 'Never enter without confirmation',
          enabled: true,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      question: 'Buy immediately now',
      monitorSignals: [],
      knownLossCount: 0,
      now: '2026-01-01T00:00:00.000Z'
    });

    expect(result.activeRules).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      text: 'Enter-without-confirmation rule triggered before entry timing checks are complete.',
      policyLevel: 'policy'
    });
  });

  it('evaluates sizing rules and reports advisory risk signals when trade size is missing', () => {
    const result = evaluatePersonalRules({
      rules: [
        {
          id: 'r-2',
          text: 'Never size above 2.5 SOL',
          enabled: true,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      question: 'Would we enter this new token?',
      monitorSignals: [],
      knownLossCount: 0,
      now: '2026-01-01T00:00:00.000Z'
    });

    expect(result.activeRules).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      policyLevel: 'policy'
      });
    expect(result.warnings[0].text).toContain('Sizing guardrail matched rule');
  });

  it('flags discovery cooldown behavior when a recent token signal is present', () => {
    const tokenSignal: MonitoringSignal = {
      source: 'clipboard',
      kind: 'evm-address',
      value: '0x2222222222222222222222222222222222222222',
      maskedValue: '0x2222…2222',
      confidence: 'high',
      detectedAt: '2026-01-01T00:00:00.000Z',
      message: 'clipboard hit'
    };

    const result = evaluatePersonalRules({
      rules: [
        {
          id: 'r-3',
          text: 'Never trade new contract 0x2222222222222222222222222222222222222222 within 5 minutes of discovery',
          enabled: true,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      question: 'Buy 0x2222222222222222222222222222222222222222 quickly',
      monitorSignals: [tokenSignal],
      knownLossCount: 1,
      now: '2026-01-01T00:00:30.000Z'
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      policyLevel: 'policy',
      text: expect.stringContaining('not enforceable from current inputs')
    });
  });

  it('requires explicit policy override metadata for max size after losses', () => {
    const result = evaluatePersonalRules({
      rules: [
        {
          id: 'r-4',
          text: 'After 2 losses never size above 1 SOL',
          enabled: true,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      question: 'Position size 1.5 SOL',
      monitorSignals: [],
      knownLossCount: 2,
      now: '2026-01-01T00:00:00.000Z'
    });

    expect(result.warnings[0]).toMatchObject({
      policyLevel: 'policy',
      requiresPolicyOverride: true,
      policyOverrideReason: expect.stringContaining('r-4')
    });
  });

  it('treats should-style source and liquidity rules as advisory metadata', () => {
    const result = evaluatePersonalRules({
      rules: [
        {
          id: 'r-5',
          text: 'Should avoid low liquidity telegram calls',
          enabled: true,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      question: 'Buy from telegram, liquidity is thin',
      monitorSignals: [],
      knownLossCount: 0,
      now: '2026-01-01T00:00:00.000Z'
    });

    expect(result.warnings[0]).toMatchObject({
      policyLevel: 'advisory',
      requiresPolicyOverride: false,
      text: expect.stringContaining('Source/liquidity rule')
    });
  });
});

describe('buildPersonalRuleContext', () => {
  it('builds compact rule execution context for memory payloads', () => {
    const rules = [
      {
        id: 'r-1',
        text: 'Never enter without confirmation',
        enabled: true,
        archived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    const { warnings } = evaluatePersonalRules({
      rules,
      question: 'Buy now',
      monitorSignals: [],
      knownLossCount: 0,
      now: '2026-01-01T00:00:00.000Z'
    });
    const context = buildPersonalRuleContext({ activeRules: rules, warnings });

    expect(context.activeRules).toBe(1);
    expect(context.totalRules).toBe(1);
    expect(context.matchedRules[0]).toMatchObject({
      ruleId: 'r-1',
      confidence: expect.stringMatching(/low|medium|high/),
      requiresPolicyOverride: true
    });
  });
});
