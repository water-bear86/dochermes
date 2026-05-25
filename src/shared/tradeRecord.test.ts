import { describe, expect, it } from 'vitest';

import { normalizeTradeRecord } from './tradeRecord';

describe('normalizeTradeRecord', () => {
  it('normalizes manual trade notes into a common TradeRecord shape', () => {
    expect(
      normalizeTradeRecord({
        source: 'manual',
        id: 'manual-1',
        openedAt: '2026-05-20T00:00:00.000Z',
        symbol: 'SOL',
        side: 'buy',
        notionalUsd: '125.50',
        quantity: '2.5',
        outcome: 'win',
        decisionTiming: 'Immediate Entry',
        tags: ['breakout', 'good-size']
      })
    ).toEqual({
      id: 'manual:manual-1',
      source: 'manual',
      openedAt: '2026-05-20T00:00:00.000Z',
      assetLabel: 'SOL',
      side: 'long',
      notionalUsd: 125.5,
      quantity: 2.5,
      outcome: 'win',
      decisionTiming: 'immediate-entry',
      tags: ['breakout', 'good-size'],
      rawRef: 'manual-1'
    });
  });

  it('normalizes exchange CSV rows into the same TradeRecord shape', () => {
    expect(
      normalizeTradeRecord({
        source: 'exchange-csv',
        exchange: 'coinbase',
        rowId: 'row-42',
        timestamp: '2026-05-20T01:00:00.000Z',
        pair: 'BTC-USD',
        action: 'SELL',
        valueUsd: '1000',
        amount: '0.01',
        feeUsd: '1.50'
      })
    ).toMatchObject({
      id: 'exchange-csv:coinbase:row-42',
      source: 'exchange-csv',
      openedAt: '2026-05-20T01:00:00.000Z',
      assetLabel: 'BTC-USD',
      side: 'short',
      notionalUsd: 1000,
      quantity: 0.01,
      feesUsd: 1.5,
      rawRef: 'row-42'
    });
  });

  it('normalizes public wallet transfers without storing private-key material', () => {
    expect(
      normalizeTradeRecord({
        source: 'public-wallet',
        chain: 'solana',
        signature: 'abc123',
        timestamp: '2026-05-20T02:00:00.000Z',
        token: 'BONK',
        direction: 'out',
        valueUsd: 50,
        tokenAmount: 100000,
        walletAddress: 'So11111111111111111111111111111111111111112',
        privateKey: 'must-not-survive'
      })
    ).toEqual({
      id: 'public-wallet:solana:abc123',
      source: 'public-wallet',
      openedAt: '2026-05-20T02:00:00.000Z',
      assetLabel: 'BONK',
      side: 'short',
      notionalUsd: 50,
      quantity: 100000,
      chain: 'solana',
      publicAddress: 'So11111111111111111111111111111111111111112',
      rawRef: 'abc123'
    });
  });

  it('normalizes journal decisions as local-only TradeRecords', () => {
    expect(
      normalizeTradeRecord({
        source: 'journal',
        entryId: 'entry-1',
        createdAt: '2026-05-20T03:00:00.000Z',
        question: 'Should I enter 3 SOL?',
        selectedWindowName: 'Trading Terminal',
        outcome: 'skipped',
        decisionTiming: 'passed',
        mistakeTags: ['early-entry']
      })
    ).toMatchObject({
      id: 'journal:entry-1',
      source: 'journal',
      openedAt: '2026-05-20T03:00:00.000Z',
      assetLabel: 'Trading Terminal',
      side: 'unknown',
      outcome: 'skipped',
      decisionTiming: 'skipped',
      tags: ['early-entry'],
      rawRef: 'entry-1'
    });
  });

  it('normalizes structured decision and outcome events without raw UI metadata', () => {
    expect(
      normalizeTradeRecord({
        source: 'decision',
        assetSymbol: 'ABC',
        side: 'buy',
        decision: {
          schemaVersion: 'dochermes.decision.v1',
          signalId: 'request-1',
          decidedAt: '2026-05-25T09:00:00.000Z',
          action: 'overrode',
          requestedSize: { value: 0.5, unit: 'SOL' },
          finalSize: { value: 0.08, unit: 'SOL' },
          override: {
            used: true,
            note: 'Window title and raw notes stay out of the normalized stats record.'
          },
          outcomeLink: {
            schemaVersion: 'dochermes.outcome.v1',
            signalId: 'request-1'
          }
        },
        outcome: {
          schemaVersion: 'dochermes.outcome.v1',
          signalId: 'request-1',
          closedAt: '2026-05-25T09:45:00.000Z',
          outcome: {
            status: 'closed',
            pnlPercent: -18
          },
          review: {
            mistakeTags: ['early-entry'],
            notes: 'Do not ship raw notes in TradeRecord.'
          }
        }
      })
    ).toEqual({
      id: 'decision:request-1',
      source: 'decision',
      openedAt: '2026-05-25T09:00:00.000Z',
      assetLabel: 'ABC',
      side: 'long',
      quantity: 0.08,
      outcome: 'loss',
      decisionTiming: 'immediate-entry',
      tags: ['early-entry'],
      rawRef: 'request-1'
    });
  });
});
