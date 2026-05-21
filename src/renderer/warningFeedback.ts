import type {
  WarningFeedbackAction,
  WarningFeedbackRecord,
  WindowSourceKind,
  WindowSourceOption
} from '../shared/types';

export const WARNING_FEEDBACK_KEY = 'hermes.warning.feedback.v1';
export const WARNING_FEEDBACK_LIMIT = 200;

interface BuildWarningFeedbackInput {
  warningText: string;
  action: WarningFeedbackAction;
  question: string;
  response: string;
  selectedWindow: WindowSourceOption;
  requestId?: string;
  notes?: string;
}

export type { WarningFeedbackAction, WarningFeedbackRecord };

interface BuildWarningFeedbackOptions {
  now?: () => Date;
  createId?: () => string;
}

export function buildWarningFeedback(
  input: BuildWarningFeedbackInput,
  options: BuildWarningFeedbackOptions = {}
): WarningFeedbackRecord {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? createRandomId;

  return {
    id: createId(),
    createdAt: now().toISOString(),
    requestId: input.requestId,
    warningText: input.warningText.trim(),
    action: input.action,
    question: input.question.trim(),
    response: input.response.trim(),
    selectedWindowName: input.selectedWindow.name.trim(),
    selectedWindowId: input.selectedWindow.id,
    selectedWindowKind: input.selectedWindow.kind,
    notes: input.notes?.trim() || undefined
  };
}

export function parseWarningFeedbackEntries(rawValue: string | null): WarningFeedbackRecord[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isWarningFeedbackRecord).sort(sortNewestFirst);
  } catch {
    return [];
  }
}

export function serializeWarningFeedbackEntries(entries: WarningFeedbackRecord[], limit = WARNING_FEEDBACK_LIMIT): string {
  return JSON.stringify([...entries].sort(sortNewestFirst).slice(0, limit));
}

export function readWarningFeedbackEntries(storage: Pick<Storage, 'getItem'>): WarningFeedbackRecord[] {
  return parseWarningFeedbackEntries(storage.getItem(WARNING_FEEDBACK_KEY));
}

export function appendWarningFeedback(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  input: BuildWarningFeedbackInput
): WarningFeedbackRecord[] {
  const nextEntry = buildWarningFeedback(input);
  const nextEntries = [nextEntry, ...readWarningFeedbackEntries(storage)].sort(sortNewestFirst).slice(0, WARNING_FEEDBACK_LIMIT);
  storage.setItem(WARNING_FEEDBACK_KEY, serializeWarningFeedbackEntries(nextEntries, WARNING_FEEDBACK_LIMIT));
  return nextEntries;
}

export function updateWarningFeedback(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  entryId: string,
  updates: Partial<Pick<WarningFeedbackRecord, 'action' | 'notes'>>
): WarningFeedbackRecord[] {
  const entries = readWarningFeedbackEntries(storage);

  const nextEntries = entries.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }

    return {
      ...entry,
      ...updates,
      updatedAt: new Date().toISOString(),
      notes: updates.notes === undefined ? entry.notes : updates.notes.trim() || undefined
    };
  });

  storage.setItem(WARNING_FEEDBACK_KEY, serializeWarningFeedbackEntries(nextEntries, WARNING_FEEDBACK_LIMIT));
  return nextEntries;
}

export function deleteWarningFeedback(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  entryId: string
): WarningFeedbackRecord[] {
  const nextEntries = readWarningFeedbackEntries(storage).filter((entry) => entry.id !== entryId);
  storage.setItem(WARNING_FEEDBACK_KEY, serializeWarningFeedbackEntries(nextEntries, WARNING_FEEDBACK_LIMIT));
  return nextEntries;
}

function isWarningFeedbackRecord(value: unknown): value is WarningFeedbackRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as WarningFeedbackRecord;

  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.warningText === 'string' &&
    typeof record.action === 'string' &&
    isWarningFeedbackAction(record.action) &&
    typeof record.question === 'string' &&
    typeof record.response === 'string' &&
    typeof record.selectedWindowName === 'string' &&
    typeof record.selectedWindowId === 'string' &&
    (record.selectedWindowKind === 'window' || record.selectedWindowKind === 'screen') &&
    (typeof record.notes === 'undefined' || typeof record.notes === 'string')
  );
}

function isWarningFeedbackAction(value: string): value is WarningFeedbackAction {
  return (
    value === 'took-it-anyway' ||
    value === 'skipped' ||
    value === 'followed-plan' ||
    value === 'added-note' ||
    value === 'false-positive'
  );
}

function sortNewestFirst(left: WarningFeedbackRecord, right: WarningFeedbackRecord): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `warning-feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
