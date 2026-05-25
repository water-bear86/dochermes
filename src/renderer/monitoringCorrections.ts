import type { ClipboardCandidateKind, MonitoringSignal } from '../shared/types';

export const CORRECTABLE_MONITORING_SIGNAL_KINDS: ClipboardCandidateKind[] = [
  'token-address',
  'pair-address',
  'pair',
  'chain',
  'order-side',
  'order-direction',
  'order-size',
  'leverage',
  'order-type',
  'route',
  'source',
  'liquidity',
  'volume',
  'wallet-address',
  'dex-url',
  'unknown'
];

export interface MonitoringSignalCorrectionInput {
  kind: ClipboardCandidateKind;
  value: string;
  correctedAt: string;
}

export function buildCorrectedMonitoringSignal(
  original: MonitoringSignal,
  correction: MonitoringSignalCorrectionInput
): MonitoringSignal {
  const value = correction.value.trim();
  if (!value) {
    throw new Error('Corrected signal value is required.');
  }

  return {
    source: original.source,
    kind: correction.kind,
    value,
    maskedValue: maskMonitoringSignalValue(value),
    confidence: 'high',
    detectedAt: correction.correctedAt,
    message: `User corrected ${original.source}/${original.kind} extraction from ${original.maskedValue}.`
  };
}

export function maskMonitoringSignalValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
