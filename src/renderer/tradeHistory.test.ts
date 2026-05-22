import { describe, expect, it } from 'vitest';

import type { JournalEntry } from '../shared/types';
import {
  buildTradeHistorySummary,
  parseImportedTradeRecordsCsv,
  parseTradeSize,
  replaceImportedTradeRecordsFromCsv,
  readImportedTradeRecords,
  readWalletTradeRecords,
  syncWalletTradeRecords,
  writeWalletTradeRecords
} from './tradeHistory';

const entries: JournalEntry[] = [
  {
    id: 'entry-1',
    createdAt: '2026-05-21T10:00:00.000Z',
    question: 'Buy 1 sol now',
    response: 'Closed weakly',
    notes: 'Result: -12% loss and exited fast',
    selectedWindow: {
      id: 'w-1',
      name: 'Window',
      kind: 'window'
    },
    screenshot: { captured: true, imageStored: false }
  },
  {
    id: 'entry-2',
    createdAt: '2026-05-21T11:00:00.000Z',
    question: 'Buy 2 sol now',
    response: 'Closed better but under water',
    notes: 'Result: -5% loss',
    selectedWindow: {
      id: 'w-1',
      name: 'Window',
      kind: 'window'
    },
    screenshot: { captured: true, imageStored: false }
  },
  {
    id: 'entry-3',
    createdAt: '2026-05-21T11:40:00.000Z',
    question: 'Buy 3 usdc now',
    response: 'Closed +2%',
    notes: 'profited',
    selectedWindow: {
      id: 'w-1',
      name: 'Window',
      kind: 'window'
    },
    screenshot: { captured: true, imageStored: false }
  }
];

describe('buildTradeHistorySummary', () => {
  it('builds compact normalized trade behavior metrics', () => {
    const summary = buildTradeHistorySummary(entries, new Date('2026-05-21T12:00:00.000Z'));

    expect(summary.totalTrades).toBe(3);
    expect(summary.tradesLastHour).toBe(2);
    expect(summary.tradesLastDay).toBe(3);
    expect(summary.recentLossStreak).toBe(0);

    const solSignal = summary.sizeSignals.find((signal) => signal.unit === 'sol');
    const usdcSignal = summary.sizeSignals.find((signal) => signal.unit === 'usdc');

    expect(solSignal).toEqual({ unit: 'sol', medianSize: 1.5, maxSize: 2, sampleCount: 2 });
    expect(usdcSignal).toEqual({ unit: 'usdc', medianSize: 3, maxSize: 3, sampleCount: 1 });
    expect(summary.importedTrades).toBe(0);
    expect(summary.walletTrades).toBe(0);
  });

  it('counts recent consecutive loss streak from freshest known outcomes', () => {
    const summary = buildTradeHistorySummary(entries, new Date('2026-05-21T12:00:00.000Z'));

    expect(summary.recentLossStreak).toBe(0);

    const entriesWithFreshLosses: JournalEntry[] = [
      entries[2],
      {
        id: 'entry-4',
        createdAt: '2026-05-21T11:50:00.000Z',
        question: 'Buy 2.5 sol now',
        response: 'Result: -3% loss',
        notes: 'closed right away',
        selectedWindow: {
          id: 'w-1',
          name: 'Window',
          kind: 'window'
        },
        screenshot: { captured: true, imageStored: false }
      },
      entries[0],
      entries[1]
    ];

    const stacked = buildTradeHistorySummary(entriesWithFreshLosses, new Date('2026-05-21T12:00:00.000Z'));

    expect(stacked.recentLossStreak).toBe(1);
  });
});

describe('imported trade records', () => {
  it('parses CSV trade rows into normalized records', () => {
    const records = parseImportedTradeRecordsCsv(
      'timestamp,size,unit,pnl_percent,token\n2026-05-21T10:00:00Z,0.5,SOL,-12.2,0xabc\n2026-05-21T11:00:00Z,1.2,USDC,5,USDC'
    );

    expect(records).toHaveLength(2);
    expect(records[0].size).toEqual({ value: 0.5, unit: 'sol' });
    expect(records[0].lossPercent).toBe(12.2);
    expect(records[1].lossPercent).toBeUndefined();
  });

  it('stores imported CSV records for local history summaries', () => {
    const storage = createStorage();
    const imported = replaceImportedTradeRecordsFromCsv(
      storage,
      'timestamp,size,unit,pnl_percent\n2026-05-21T10:00:00Z,0.5,SOL,-12.2'
    );

    expect(imported).toHaveLength(1);
    expect(readImportedTradeRecords(storage)).toHaveLength(1);
  });
});

describe('wallet trade history records', () => {
  it('stores and reads normalized wallet records separately from CSV imports', () => {
    const storage = createStorage();
    const next = writeWalletTradeRecords(storage, [
      {
        id: 'wallet-1',
        createdAt: '2026-05-22T11:00:00Z',
        source: 'wallet',
        size: { value: 0.4, unit: 'sol' }
      }
    ]);

    expect(next).toHaveLength(1);
    expect(readWalletTradeRecords(storage)).toHaveLength(1);
  });

  it('syncs Solana wallet records from RPC and flags unsupported formats', async () => {
    const fetchMock = createSolanaFetchMock();
    const result = await syncWalletTradeRecords({
      addresses: ['3f7YfF7WQfYyR9a4sXg5x7xX2PzB3U8p8r3m7K1Fq11q', '0x1111111111111111111111111111111111111111'],
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: new Date('2026-05-22T12:00:00Z')
    });

    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records[0].source).toBe('wallet');
    expect(result.statuses.some((status) => status.chain === 'solana' && status.status === 'synced')).toBe(true);
    expect(result.statuses.some((status) => status.chain === 'evm' && status.status === 'unsupported')).toBe(true);
  });
});

function createStorage(): Storage {
  const state = new Map<string, string>();
  return {
    length: 0,
    clear: () => state.clear(),
    getItem: (key: string) => state.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => {
      state.delete(key);
    },
    setItem: (key: string, value: string) => {
      state.set(key, value);
    }
  } as Storage;
}

function createSolanaFetchMock(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body ?? '{}')) as { method?: string; params?: unknown[] };
    const method = payload.method;

    if (method === 'getSignaturesForAddress') {
      return new Response(
        JSON.stringify({
          result: [
            {
              signature: 'sig-1',
              blockTime: 1_747_846_400
            }
          ]
        }),
        { status: 200 }
      );
    }

    if (method === 'getTransaction') {
      return new Response(
        JSON.stringify({
          result: {
            blockTime: 1_747_846_400,
            meta: {
              preBalances: [1_000_000_000],
              postBalances: [700_000_000],
              preTokenBalances: [],
              postTokenBalances: []
            },
            transaction: {
              message: {
                accountKeys: ['3f7YfF7WQfYyR9a4sXg5x7xX2PzB3U8p8r3m7K1Fq11q']
              }
            }
          }
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ result: [] }), { status: 200 });
  };
}

describe('parseTradeSize', () => {
  it('parses unit quantities from natural language prompts', () => {
    expect(parseTradeSize('Buy 0.5 SOL now at market')).toEqual({ value: 0.5, unit: 'sol' });
    expect(parseTradeSize('size=1.75 usdc.e please do it')).toEqual({ value: 1.75, unit: 'usdc' });
    expect(parseTradeSize('No size mentioned here')).toBeUndefined();
  });
});
