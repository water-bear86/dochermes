import { describe, expect, it } from 'vitest';

import type { MonitoringSignal } from '../shared/types';
import { buildCorrectedMonitoringSignal, maskMonitoringSignalValue } from './monitoringCorrections';

const original: MonitoringSignal = {
  source: 'ocr',
  kind: 'order-size',
  value: '0.8 SOL',
  maskedValue: '0.8 SOL',
  confidence: 'low',
  detectedAt: '2026-05-25T10:00:00.000Z',
  message: 'OCR hint (low confidence): Detected order-size signal: 0.8 SOL'
};

describe('monitoringCorrections', () => {
  it('builds a high-confidence corrected monitoring signal without exposing the old raw value', () => {
    expect(
      buildCorrectedMonitoringSignal(original, {
        kind: 'order-size',
        value: '0.08 SOL',
        correctedAt: '2026-05-25T10:01:00.000Z'
      })
    ).toEqual({
      source: 'ocr',
      kind: 'order-size',
      value: '0.08 SOL',
      maskedValue: '0.08 SOL',
      confidence: 'high',
      detectedAt: '2026-05-25T10:01:00.000Z',
      message: 'User corrected ocr/order-size extraction from 0.8 SOL.'
    });
  });

  it('masks long corrected values', () => {
    expect(maskMonitoringSignalValue('0x1111111111111111111111111111111111111111')).toBe('0x11...1111');
  });

  it('rejects blank corrected values', () => {
    expect(() =>
      buildCorrectedMonitoringSignal(original, {
        kind: 'order-size',
        value: '  ',
        correctedAt: '2026-05-25T10:01:00.000Z'
      })
    ).toThrow('Corrected signal value is required.');
  });
});
