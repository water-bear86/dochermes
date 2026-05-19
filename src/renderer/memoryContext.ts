import type { JournalEntry, MemoryContext, MemoryPattern } from '../shared/types';

const RECENT_NOTE_LIMIT = 6;

const EARLY_ENTRY_TERMS = ['early', 'immediate', 'immediately', 'enter now', 'ape'];
const NEGATIVE_TERMS = ['poor', 'loss', 'lost', 'oversized', 'drawdown', 'bad', 'mistake'];
const CONFIRMATION_TERMS = ['confirmation', 'confirmed', 'wait', 'waited', 'support'];

export function buildMemoryContext(entries: JournalEntry[], currentQuestion: string): MemoryContext {
  const recentNotes = entries
    .slice()
    .sort(sortNewestFirst)
    .slice(0, RECENT_NOTE_LIMIT)
    .map((entry) => ({
      createdAt: entry.createdAt,
      question: entry.question,
      response: entry.response,
      notes: entry.notes,
      selectedWindowName: entry.selectedWindow.name
    }));

  return {
    matchedPatterns: matchPatterns(entries, currentQuestion),
    recentNotes
  };
}

function matchPatterns(entries: JournalEntry[], currentQuestion: string): MemoryPattern[] {
  const currentText = normalize(currentQuestion);
  const asksAboutEarlyEntry = containsAny(currentText, EARLY_ENTRY_TERMS);

  if (!asksAboutEarlyEntry) {
    return [];
  }

  const earlyLossEvidence = entries.filter((entry) => {
    const text = normalize(`${entry.question} ${entry.response} ${entry.notes}`);
    return containsAny(text, EARLY_ENTRY_TERMS) && containsAny(text, NEGATIVE_TERMS);
  });

  const confirmationEvidence = entries.filter((entry) => {
    const text = normalize(`${entry.question} ${entry.response} ${entry.notes}`);
    return containsAny(text, CONFIRMATION_TERMS);
  });

  const evidenceCount = new Set([...earlyLossEvidence, ...confirmationEvidence].map((entry) => entry.id)).size;

  if (evidenceCount === 0) {
    return [];
  }

  return [
    {
      name: 'early-entry-risk',
      evidenceCount,
      summary:
        'This resembles prior notes where early entries performed poorly and waiting for confirmation reduced risk.',
      recommendation: 'Do not enter immediately. Set an alert and reassess after confirmation.'
    }
  ];
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function containsAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function sortNewestFirst(left: JournalEntry, right: JournalEntry): number {
  return right.createdAt.localeCompare(left.createdAt);
}
