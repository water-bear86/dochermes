import { describe, expect, it } from 'vitest';

import type { MonitoringSignal } from '../shared/types';
import { extractClipboardSignalsFromText } from './monitoringSignals';

const NOW = 1_700_000_000_000;

describe('clipboard signal extraction', () => {
  it('extracts token pair and chain context signals', () => {
    const signals = extractClipboardSignalsFromText('Pair: SOL/USDC on chain=solana', NOW);
    const kinds = signals.map((signal: MonitoringSignal) => signal.kind);

    expect(kinds).toContain('pair');
    expect(kinds).toContain('chain');
    expect(signals.find((signal) => signal.kind === 'pair')?.value).toBe('SOL/USDC');
    expect(signals.find((signal) => signal.kind === 'chain')?.value).toBe('solana');
  });

  it('extracts order size and leverage signals with numeric context', () => {
    const signals = extractClipboardSignalsFromText('size: 2.5 SOL leverage: 10x', NOW);
    const orderSize = signals.find((signal) => signal.kind === 'order-size');
    const leverage = signals.find((signal) => signal.kind === 'leverage');

    expect(orderSize).toBeDefined();
    expect(orderSize?.value).toBe('2.5 SOL');
    expect(orderSize?.confidence).toBe('medium');
    expect(leverage).toBeDefined();
    expect(leverage?.value).toBe('10x');
  });

  it('extracts order type and direction from plain text', () => {
    const signals = extractClipboardSignalsFromText('Buy long now, market order', NOW);

    expect(signals.some((signal) => signal.kind === 'order-direction' && signal.value === 'buy')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'order-direction' && signal.value === 'long')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'order-type' && signal.value === 'market')).toBe(true);
  });

  it('deduplicates duplicate matches within a single capture', () => {
    const signals = extractClipboardSignalsFromText('ETH/USDC ETH/USDC  size 10  size 10', NOW);
    const pairSignals = signals.filter((signal) => signal.kind === 'pair' && signal.value === 'ETH/USDC');
    const sizeSignals = signals.filter((signal) => signal.kind === 'order-size' && signal.value === '10');
    expect(pairSignals).toHaveLength(1);
    expect(sizeSignals).toHaveLength(1);
  });
});
