import { describe, expect, it } from 'vitest';

import type { JournalEntry } from '../shared/types';
import {
  buildTradeHistorySummary,
  parseImportedTradeRecordsCsv,
  parseTradeSize,
  replaceImportedTradeRecordsFromCsv,
  readImportedTradeRecords
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

describe('parseTradeSize', () => {
  it('parses unit quantities from natural language prompts', () => {
    expect(parseTradeSize('Buy 0.5 SOL now at market')).toEqual({ value: 0.5, unit: 'sol' });
    expect(parseTradeSize('size=1.75 usdc.e please do it')).toEqual({ value: 1.75, unit: 'usdc' });
    expect(parseTradeSize('No size mentioned here')).toBeUndefined();
  });
});
