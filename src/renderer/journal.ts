import type {
  JournalEntry,
  JournalMonitoringMetadata,
  JournalSourceProfile,
  SourceCategory,
  SourceQualityOutcome,
  SourceQualityFinding,
  WindowSourceOption
} from '../shared/types';

const JOURNAL_SOURCE_CATEGORIES = [
  'telegram',
  'discord',
  'social',
  'dex-link',
  'token-address',
  'wallet',
  'unknown'
] as const;

const JOURNAL_SOURCE_OUTCOMES = ['good', 'neutral', 'bad', 'unknown'] as const;

function isJournalSourceCategory(value: unknown): value is SourceCategory {
  return typeof value === 'string' && (JOURNAL_SOURCE_CATEGORIES as readonly string[]).includes(value);
}

function isJournalSourceOutcome(value: unknown): value is SourceQualityOutcome {
  return typeof value === 'string' && (JOURNAL_SOURCE_OUTCOMES as readonly string[]).includes(value);
}

export const JOURNAL_KEY = 'hermes.journal.v1';
export const JOURNAL_ENTRY_LIMIT = 100;

interface BuildJournalEntryInput {
  question: string;
  response: string;
  notes: string;
  selectedWindow: WindowSourceOption;
  screenshotCaptured: boolean;
  monitoring?: JournalMonitoringMetadata;
  sourceContext?: JournalSourceProfile;
}

interface BuildJournalEntryOptions {
  now?: () => Date;
  createId?: () => string;
}

export function buildJournalEntry(
  input: BuildJournalEntryInput,
  options: BuildJournalEntryOptions = {}
): JournalEntry {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? createRandomId;
  const base: JournalEntry = {
    id: createId(),
    createdAt: now().toISOString(),
    question: input.question.trim(),
    response: input.response.trim(),
    notes: input.notes.trim(),
    selectedWindow: {
      id: input.selectedWindow.id,
      name: input.selectedWindow.name,
      kind: input.selectedWindow.kind
    },
    screenshot: {
      captured: input.screenshotCaptured,
      imageStored: false
    }
  };

  if (input.monitoring) {
    base.monitoring = cloneMonitoringMetadata(input.monitoring);
  }
  if (input.sourceContext) {
    base.sourceContext = {
      category: input.sourceContext.category,
      outcome: input.sourceContext.outcome,
      ...(input.sourceContext.tokenHint ? { tokenHint: input.sourceContext.tokenHint } : {})
    };
  }

  return base;
}

export function parseJournalEntries(rawValue: string | null): JournalEntry[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isJournalEntry).sort(sortNewestFirst);
  } catch {
    return [];
  }
}

export function serializeJournalEntries(entries: JournalEntry[], limit = JOURNAL_ENTRY_LIMIT): string {
  return JSON.stringify([...entries].sort(sortNewestFirst).slice(0, limit));
}

export function readJournalEntries(storage: Pick<Storage, 'getItem'>): JournalEntry[] {
  return parseJournalEntries(storage.getItem(JOURNAL_KEY));
}

export function appendJournalEntry(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  entry: JournalEntry,
  limit = JOURNAL_ENTRY_LIMIT
): JournalEntry[] {
  const entries = [entry, ...readJournalEntries(storage)].sort(sortNewestFirst).slice(0, limit);
  storage.setItem(JOURNAL_KEY, serializeJournalEntries(entries, limit));
  return entries;
}

export function clearJournalEntries(storage: Pick<Storage, 'removeItem'>): JournalEntry[] {
  storage.removeItem(JOURNAL_KEY);
  return [];
}

function isJournalEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as JournalEntry;

  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.question === 'string' &&
    typeof record.response === 'string' &&
    typeof record.notes === 'string' &&
    Boolean(record.selectedWindow) &&
    typeof record.selectedWindow.id === 'string' &&
    typeof record.selectedWindow.name === 'string' &&
    (record.selectedWindow.kind === 'window' || record.selectedWindow.kind === 'screen') &&
    Boolean(record.screenshot) &&
    typeof record.screenshot.captured === 'boolean' &&
    record.screenshot.imageStored === false &&
    (!record.monitoring ||
      (typeof record.monitoring === 'object' &&
        record.monitoring !== null &&
        Array.isArray(record.monitoring.localWarnings) &&
        Array.isArray(record.monitoring.signals) &&
        record.monitoring.localWarnings.every((item: unknown) => typeof item === 'string') &&
        record.monitoring.signals.every(isMonitoringSignal) &&
        (!record.monitoring.sourceQuality ||
          (Array.isArray(record.monitoring.sourceQuality) && record.monitoring.sourceQuality.every(isSourceQualityFinding))))) &&
    (!record.sourceContext ||
      (record.sourceContext &&
        typeof record.sourceContext === 'object' &&
        record.sourceContext !== null &&
        typeof record.sourceContext.category === 'string' &&
        isJournalSourceCategory(record.sourceContext.category) &&
        typeof record.sourceContext.outcome === 'string' &&
        isJournalSourceOutcome(record.sourceContext.outcome) &&
        (record.sourceContext.tokenHint === undefined || typeof record.sourceContext.tokenHint === 'string'))
    )
  );
}

function isSourceQualityFinding(value: unknown): value is SourceQualityFinding {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as SourceQualityFinding;

  return (
    (record.category === 'telegram' ||
      record.category === 'discord' ||
      record.category === 'social' ||
      record.category === 'dex-link' ||
      record.category === 'token-address' ||
      record.category === 'wallet' ||
      record.category === 'unknown') &&
    (record.confidence === 'low' || record.confidence === 'medium' || record.confidence === 'high') &&
    typeof record.provenance === 'string' &&
    (record.tokenHint === undefined || typeof record.tokenHint === 'string') &&
    typeof record.reason === 'string'
  );
}

function isMonitoringSignal(value: unknown): value is JournalMonitoringMetadata['signals'][number] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as JournalMonitoringMetadata['signals'][number];

  return (
    (record.source === 'clipboard' || record.source === 'ocr-placeholder' || record.source === 'ocr') &&
    typeof record.maskedValue === 'string' &&
    (record.kind === 'evm-address' ||
      record.kind === 'evm-tx-hash' ||
      record.kind === 'sol-address' ||
      record.kind === 'dex-url' ||
      record.kind === 'wallet-address' ||
      record.kind === 'unknown') &&
    (record.confidence === 'high' || record.confidence === 'medium' || record.confidence === 'low') &&
    typeof record.detectedAt === 'string' &&
    (record.message === undefined || typeof record.message === 'string')
  );
}

function cloneMonitoringMetadata(input: JournalMonitoringMetadata): JournalMonitoringMetadata {
  return {
    localWarnings: [...input.localWarnings],
    signals: input.signals.map((signal) => ({
      source: signal.source,
      kind: signal.kind,
      maskedValue: signal.maskedValue,
      confidence: signal.confidence,
      detectedAt: signal.detectedAt,
      ...(signal.message ? { message: signal.message } : {})
    })),
    ...(input.sourceQuality
      ? {
          sourceQuality: input.sourceQuality.map((finding) => ({
            category: finding.category,
            confidence: finding.confidence,
            provenance: finding.provenance,
            reason: finding.reason,
            ...(finding.tokenHint ? { tokenHint: finding.tokenHint } : {})
          }))
        }
      : {})
  };
}

function sortNewestFirst(left: JournalEntry, right: JournalEntry): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
