import type { JournalEntry, WindowSourceOption } from '../shared/types';

export const JOURNAL_KEY = 'hermes.journal.v1';
export const JOURNAL_ENTRY_LIMIT = 100;

interface BuildJournalEntryInput {
  question: string;
  response: string;
  notes: string;
  selectedWindow: WindowSourceOption;
  screenshotCaptured: boolean;
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

  return {
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
    record.screenshot.imageStored === false
  );
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
