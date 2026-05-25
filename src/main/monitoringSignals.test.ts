import { describe, expect, it } from 'vitest';

import type { MonitoringSignal } from '../shared/types';
import { extractClipboardSignalsFromText, extractOCRSignalsFromText, extractMonitoringSignalsFromText } from './monitoringSignals';

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

  it('extracts OCR source signals with explicit source tag', () => {
    const signals = extractOCRSignalsFromText('Buy 0.5 SOL / leverage 15x', NOW);
    expect(signals.some((signal) => signal.source === 'ocr')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'order-direction')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'leverage')).toBe(true);
  });

  it('supports direct source override parsing', () => {
    const clipboardSignals = extractMonitoringSignalsFromText('size: 2 SOL', NOW, 'clipboard');
    const ocrSignals = extractMonitoringSignalsFromText('size: 2 SOL', NOW, 'ocr');

    expect(clipboardSignals.every((signal) => signal.source === 'clipboard')).toBe(true);
    expect(ocrSignals.every((signal) => signal.source === 'ocr')).toBe(true);
  });

  it('adds uncertain wording for low-confidence OCR hints', () => {
    const signals = extractOCRSignalsFromText('size: 1.25 SOL', NOW, 'low');
    expect(signals[0]?.message).toContain('OCR hint (low confidence):');
  });

  it('extracts source and route metadata fields', () => {
    const signals = extractClipboardSignalsFromText('source: wallet alert route: raydium/swap', NOW);

    expect(signals.some((signal) => signal.kind === 'source' && signal.value.includes('wallet alert'))).toBe(true);
    expect(signals.some((signal) => signal.kind === 'route' && signal.value.includes('raydium/swap'))).toBe(true);
  });

  it('extracts labeled Solana token and pair address hints without exposing full values in masks', () => {
    const tokenAddress = 'So11111111111111111111111111111111111111112';
    const pairAddress = '9wFFeK6Z5M9mnUwqgq7vM8tMYzA6EVz6C7D1j4z5p9fK';
    const signals = extractClipboardSignalsFromText(
      `tokenAddress="${tokenAddress}" pairAddress: ${pairAddress} chain solana`,
      NOW
    );

    const tokenSignal = signals.find((signal) => signal.kind === 'token-address');
    const pairSignal = signals.find((signal) => signal.kind === 'pair-address');

    expect(tokenSignal?.value).toBe(tokenAddress);
    expect(tokenSignal?.maskedValue).toBe('So11...1112');
    expect(pairSignal?.value).toBe(pairAddress);
    expect(pairSignal?.maskedValue).toBe('9wFF...p9fK');
    expect(signals.some((signal) => signal.kind === 'chain' && signal.value === 'solana')).toBe(true);
  });

  it('extracts labeled EVM token and pair address hints', () => {
    const tokenAddress = '0x1111111111111111111111111111111111111111';
    const pairAddress = '0x2222222222222222222222222222222222222222';
    const signals = extractClipboardSignalsFromText(
      `Token address: ${tokenAddress} pair=${pairAddress} network: base`,
      NOW
    );

    expect(signals.some((signal) => signal.kind === 'token-address' && signal.value === tokenAddress)).toBe(true);
    expect(signals.some((signal) => signal.kind === 'pair-address' && signal.value === pairAddress)).toBe(true);
    expect(signals.some((signal) => signal.kind === 'chain' && signal.value === 'base')).toBe(true);
  });

  it('extracts order side plus route and source labels from DOM-like snippets', () => {
    const signals = extractClipboardSignalsFromText(
      'data-side="sell" data-size="1,250 USDC" routePreview: Jupiter swap source label: browser DOM extraction',
      NOW
    );

    expect(signals.some((signal) => signal.kind === 'order-side' && signal.value === 'sell')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'order-size' && signal.value === '1,250 USDC')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'route' && signal.value === 'Jupiter swap')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'source' && signal.value === 'browser DOM extraction')).toBe(true);
  });

  it('extracts read-only liquidity and volume hints', () => {
    const signals = extractClipboardSignalsFromText('liquidityUsd: $118,000 volume h24: $1.8M DEX: Raydium', NOW);

    expect(signals.some((signal) => signal.kind === 'liquidity' && signal.value === '$118,000')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'volume' && signal.value === '$1.8M')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'source' && signal.value === 'Raydium')).toBe(true);
  });
});

describe('browser trading tool context extraction', () => {
  it('parses copied browser-extension DOM payloads as clean trading context', () => {
    const signals = extractClipboardSignalsFromText(
      [
        'DOCHERMES_CONTEXT',
        'source: browser-dom',
        'route: app.example.trade/swap',
        'pair: SOL/USDC',
        'chain: solana',
        'order-direction: buy',
        'order-type: limit',
        'size: 0.08 SOL',
        'leverage: 2x',
        'token-address: So11111111111111111111111111111111111111112'
      ].join('\n'),
      NOW
    );

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'clipboard', kind: 'source', value: 'browser-dom' }),
        expect.objectContaining({ source: 'clipboard', kind: 'route', value: 'app.example.trade/swap' }),
        expect.objectContaining({ source: 'clipboard', kind: 'pair', value: 'SOL/USDC', confidence: 'high' }),
        expect.objectContaining({ source: 'clipboard', kind: 'chain', value: 'solana' }),
        expect.objectContaining({ source: 'clipboard', kind: 'order-side', value: 'buy' }),
        expect.objectContaining({ source: 'clipboard', kind: 'order-type', value: 'limit' }),
        expect.objectContaining({ source: 'clipboard', kind: 'order-size', value: '0.08 SOL' }),
        expect.objectContaining({ source: 'clipboard', kind: 'leverage', value: '2x' }),
        expect.objectContaining({ source: 'clipboard', kind: 'token-address', maskedValue: 'So11...1112' })
      ])
    );
  });
});

describe('non-browser trading tool screenshot/OCR fallback extraction', () => {
  it('keeps OCR fallback signals separate and confidence-qualified', () => {
    const signals = extractOCRSignalsFromText(
      ['Buy 0.08 SOL', 'chain solana', 'liquidity $118,000', 'volume $1.8M'].join('\n'),
      NOW,
      'low'
    );

    expect(signals.every((signal) => signal.source === 'ocr')).toBe(true);
    expect(signals.every((signal) => signal.confidence === 'low')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'order-direction' && signal.value === 'buy')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'order-size' && signal.value === '0.08 SOL')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'chain' && signal.value === 'solana')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'liquidity' && signal.value === '$118,000')).toBe(true);
    expect(signals.some((signal) => signal.kind === 'volume' && signal.value === '$1.8M')).toBe(true);
    expect(signals.every((signal) => signal.message?.includes('OCR hint (low confidence):'))).toBe(true);
  });
});
