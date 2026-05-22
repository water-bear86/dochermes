import { createWorker } from 'tesseract.js';

import { extractOCRSignalsFromText } from './monitoringSignals';
import type { MonitoringSignal } from '../shared/types';

type OcrConfidence = MonitoringSignal['confidence'];

export interface OcrRegionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrRegion {
  id: string;
  label: string;
  rectangle?: OcrRegionRect;
}

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;

function deriveOcrConfidence(inputConfidence: number | undefined): OcrConfidence {
  if (inputConfidence === undefined || !Number.isFinite(inputConfidence)) {
    return 'low';
  }

  if (inputConfidence >= 85) {
    return 'high';
  }

  if (inputConfidence >= 55) {
    return 'medium';
  }

  return 'low';
}

function confidenceRank(confidence: OcrConfidence): number {
  if (confidence === 'high') {
    return 3;
  }

  if (confidence === 'medium') {
    return 2;
  }

  return 1;
}

function mergeSignal(
  signals: Map<string, MonitoringSignal>,
  nextSignal: MonitoringSignal,
  regionLabel: string
): void {
  const key = `${nextSignal.kind}:${nextSignal.value.toLowerCase()}`;
  const normalizedMessage = nextSignal.message
    ? `${regionLabel}: ${nextSignal.message}`
    : `${regionLabel}: ${nextSignal.maskedValue}`;
  const withRegionMessage: MonitoringSignal = {
    ...nextSignal,
    message: normalizedMessage
  };
  const current = signals.get(key);

  if (!current) {
    signals.set(key, withRegionMessage);
    return;
  }

  if (confidenceRank(withRegionMessage.confidence) > confidenceRank(current.confidence)) {
    signals.set(key, withRegionMessage);
  }
}

export async function ensureOcrWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 3, {
      logger: () => undefined
    });
  }

  return workerPromise;
}

export async function closeOcrWorker(): Promise<void> {
  if (!workerPromise) {
    return;
  }

  try {
    const worker = await workerPromise;
    await worker.terminate();
  } finally {
    workerPromise = null;
  }
}

export async function runOcrOnImageDataUrl(
  imageDataUrl: string,
  now = Date.now(),
  regions: OcrRegion[] = []
): Promise<{
  signals: MonitoringSignal[];
  confidence: OcrConfidence;
  text: string;
  elapsedMs: number;
}> {
  const start = performance.now();
  const worker = await ensureOcrWorker();
  const selectedRegions = regions.length > 0 ? regions : [{ id: 'full-window', label: 'Full window' }];
  const mergedSignals = new Map<string, MonitoringSignal>();
  const textChunks: string[] = [];
  let bestConfidence: OcrConfidence = 'low';

  for (const region of selectedRegions) {
    const nextRectangle = region.rectangle
      ? {
          rectangle: region.rectangle
        }
      : undefined;

    const result = await worker.recognize(imageDataUrl, nextRectangle);
    const recognizedText = result.data?.text?.trim() ?? '';
    const confidence = deriveOcrConfidence(result.data?.confidence);
    if (confidenceRank(confidence) > confidenceRank(bestConfidence)) {
      bestConfidence = confidence;
    }

    if (!recognizedText) {
      continue;
    }

    textChunks.push(`[${region.label}] ${recognizedText}`);
    const regionSignals = extractOCRSignalsFromText(recognizedText, now, confidence);
    for (const signal of regionSignals) {
      mergeSignal(mergedSignals, signal, region.label);
    }
  }

  return {
    signals: [...mergedSignals.values()],
    confidence: bestConfidence,
    text: textChunks.join('\n'),
    elapsedMs: performance.now() - start
  };
}
