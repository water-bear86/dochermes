import { describe, expect, it } from 'vitest';

import type { MemoryContext, MonitoringSignal, SourceQualityFinding } from '../shared/types';
import { buildTradeCardViewModel, describeTradeCardDecision } from './tradeCardViewModel';

const baseMemory: MemoryContext = {
  matchedPatterns: [],
  recentNotes: []
};

const signal = (overrides: Partial<MonitoringSignal>): MonitoringSignal => ({
  source: 'clipboard',
  kind: 'unknown',
  value: '',
  maskedValue: '',
  confidence: 'medium',
  detectedAt: '2026-05-25T09:00:00.000Z',
  ...overrides
});

describe('buildTradeCardViewModel', () => {
  it('builds a structured trade card from Hermes response and monitoring context', () => {
    const sourceFinding: SourceQualityFinding = {
      category: 'wallet',
      confidence: 'medium',
      provenance: 'Clipboard signal',
      tokenHint: 'So11111111111111111111111111111111111111112',
      reason: 'Wallet alert source'
    };

    const card = buildTradeCardViewModel({
      question: 'Should I buy 0.5 SOL on this early momentum wallet alert?',
      response: [
        'Risk: High',
        'Recommended size: 0.08 SOL',
        'Reason: Prior early entries with oversized allocation performed poorly.',
        'Entry: wait for confirmation above current range',
        'Invalidation: exit if liquidity drops by 20%',
        'Take profit: reduce 50% at 2x',
        'Max hold time: 45 minutes unless volume expands'
      ].join('\n'),
      mode: 'guardrail',
      monitorSignals: [
        signal({ kind: 'pair', value: 'ABC/SOL', maskedValue: 'ABC/SOL' }),
        signal({ kind: 'order-side', value: 'buy', maskedValue: 'buy' }),
        signal({ kind: 'order-size', value: '0.5 SOL', maskedValue: '0.5 SOL' }),
        signal({ kind: 'liquidity', value: '$118,000', maskedValue: '$118,000' }),
        signal({ kind: 'source', value: 'wallet alert', maskedValue: 'wallet alert' })
      ],
      memoryContext: baseMemory,
      localWarnings: ['Proposed size exceeds your recent size envelope.'],
      sourceFinding
    });

    expect(card).toMatchObject({
      token: 'ABC/SOL',
      proposedTrade: 'Buy 0.5 SOL',
      strategy: 'early momentum',
      source: 'wallet alert',
      liquidity: '$118,000',
      risk: 'High',
      recommendedSize: '0.08 SOL',
      reason: 'Prior early entries with oversized allocation performed poorly.',
      plan: {
        entry: 'wait for confirmation above current range',
        invalidation: 'exit if liquidity drops by 20%',
        takeProfit: 'reduce 50% at 2x',
        maxHoldTime: '45 minutes unless volume expands'
      },
      advisoryNotice: 'DocHermes records coaching decisions only. It cannot route, sign, or execute trades.'
    });
    expect(card.actions.map((action) => action.label)).toEqual([
      'Buy recommended size',
      'Set alert',
      'Create trade plan',
      'Reject',
      'Override'
    ]);
  });

  it('falls back to memory and local warnings when Hermes response is unstructured', () => {
    const card = buildTradeCardViewModel({
      question: 'enter now with 2 SOL?',
      response: 'Wait for a cleaner setup.',
      mode: 'policy',
      monitorSignals: [],
      memoryContext: {
        matchedPatterns: [
          {
            name: 'early-entry-risk',
            evidenceCount: 14,
            summary: 'Immediate entries under similar conditions averaged poorly.',
            recommendation: 'Do not enter immediately. Set an alert and reassess after confirmation.'
          }
        ],
        recentNotes: []
      },
      localWarnings: ['Recent loss streak warning.']
    });

    expect(card.risk).toBe('Critical');
    expect(card.token).toBe('Current signal');
    expect(card.proposedTrade).toBe('Trade 2 SOL');
    expect(card.reason).toBe('Immediate entries under similar conditions averaged poorly.');
    expect(card.plan.entry).toBe('Do not enter immediately. Set an alert and reassess after confirmation.');
    expect(card.memorySummary).toContain('14 prior matches');
    expect(card.overrideRequired).toBe(true);
  });

  it('shows the actual Hermes answer when local guardrails prefix an unstructured response', () => {
    const card = buildTradeCardViewModel({
      question: 'Should I enter this trade right now?',
      response: [
        'Local risk guardrail: Immediate-entry question detected.',
        '',
        'E2E Hermes response: placeholder request received.'
      ].join('\n'),
      mode: 'guardrail',
      monitorSignals: [],
      memoryContext: baseMemory,
      localWarnings: ['Immediate-entry question detected.']
    });

    expect(card.reason).toBe('E2E Hermes response: placeholder request received.');
  });
});

describe('describeTradeCardDecision', () => {
  it('keeps decision journal text explicitly advisory-only', () => {
    const card = buildTradeCardViewModel({
      question: 'Should I buy 0.5 SOL?',
      response: 'Risk: Medium\nRecommended size: 0.08 SOL',
      mode: 'advisory',
      monitorSignals: [],
      memoryContext: baseMemory,
      localWarnings: []
    });

    expect(describeTradeCardDecision(card.actions[0], card, 'waited for range break')).toContain(
      'Execution: advisory record only; DocHermes cannot route, sign, or execute trades.'
    );
    expect(describeTradeCardDecision(card.actions[0], card, 'waited for range break')).toContain(
      'Note: waited for range break'
    );
  });
});
