import type { JournalEntry, MemoryContext, MemoryPattern, MemoryPostmortemSummary, WarningFeedbackRecord } from '../shared/types';
import { buildTradeBehaviorStats } from '../shared/tradeStats';
import { normalizeTradeRecord, type TradeRecord } from '../shared/tradeRecord';
import { buildTradeHistorySummary } from './tradeHistory';

const RECENT_NOTE_LIMIT = 6;
const POSTMORTEM_SUMMARY_CONTEXT_LIMIT = 4;

const EARLY_ENTRY_TERMS = ['early', 'immediate', 'immediately', 'enter now', 'ape'];
const NEGATIVE_TERMS = ['poor', 'loss', 'lost', 'oversized', 'drawdown', 'bad', 'mistake'];
const CONFIRMATION_TERMS = ['confirmation', 'confirmed', 'wait', 'waited', 'support'];
const WIN_TERMS = ['win', 'won', 'profit', 'profitable', 'green', 'worked'];
const OVERSIZE_TERMS = ['oversized', 'oversize', 'too big', 'overleveraged', 'over-leveraged'];
const FOMO_TERMS = ['fomo', 'ape', 'chased', 'chase'];
export const EARLY_ENTRY_WARNING_TEXT =
  'This resembles prior early-entry risk patterns; set a confirmation plan before acting.';

export function buildMemoryContext(
  entries: JournalEntry[],
  currentQuestion: string,
  warningFeedback: WarningFeedbackRecord[] = [],
  postmortemSummaries: MemoryPostmortemSummary[] = []
): MemoryContext {
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

  const falsePositiveSuppressedQuestions = collectFalsePositiveSuppressedQuestions(warningFeedback);

  const postmortemSummaryContext = postmortemSummaries
    .slice()
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
    .slice(0, POSTMORTEM_SUMMARY_CONTEXT_LIMIT)
    .map((summary) => ({
      id: summary.id,
      generatedAt: summary.generatedAt,
      sessionId: summary.sessionId,
      sessionLabel: summary.sessionLabel,
      compactSummary: summary.compactSummary,
      eventCount: summary.eventCount,
      taggedEventCount: summary.taggedEventCount,
      tagCounts: summary.tagCounts,
      notableRisks: summary.notableRisks
    }));

  const tradeHistorySummary = buildTradeHistorySummary(entries);

  return {
    matchedPatterns: matchPatterns(entries, currentQuestion, falsePositiveSuppressedQuestions),
    tradeBehaviorStats: buildJournalTradeBehaviorStats(entries),
    recentNotes,
    ...(tradeHistorySummary.totalTrades > 0 ? { tradeHistorySummary } : {}),
    ...(postmortemSummaryContext.length > 0 ? { postmortemSummaries: postmortemSummaryContext } : {})
  };
}

function buildJournalTradeBehaviorStats(entries: JournalEntry[]): MemoryContext['tradeBehaviorStats'] {
  if (entries.length === 0) {
    return undefined;
  }

  const trades = entries.map((entry) => normalizeTradeRecord({
    source: 'journal',
    entryId: entry.id,
    createdAt: entry.createdAt,
    selectedWindowName: entry.selectedWindow.name,
    outcome: inferJournalOutcome(entry),
    mistakeTags: inferMistakeTags(entry)
  }));

  return buildTradeBehaviorStats(trades);
}

function inferJournalOutcome(entry: JournalEntry): TradeRecord['outcome'] {
  const text = normalize(`${entry.question} ${entry.response} ${entry.notes}`);
  if (containsAny(text, ['skipped', 'passed', 'avoided'])) {
    return 'skipped';
  }
  if (containsAny(text, NEGATIVE_TERMS)) {
    return 'loss';
  }
  if (containsAny(text, WIN_TERMS)) {
    return 'win';
  }
  return 'unknown';
}

function inferMistakeTags(entry: JournalEntry): string[] | undefined {
  const text = normalize(`${entry.question} ${entry.response} ${entry.notes}`);
  const tags: string[] = [];
  if (containsAny(text, EARLY_ENTRY_TERMS)) {
    tags.push('early-entry');
  }
  if (containsAny(text, OVERSIZE_TERMS)) {
    tags.push('oversized');
  }
  if (containsAny(text, FOMO_TERMS)) {
    tags.push('fomo');
  }
  if (containsAny(text, CONFIRMATION_TERMS)) {
    tags.push('confirmation-plan');
  }
  return tags.length > 0 ? tags : undefined;
}

function matchPatterns(
  entries: JournalEntry[],
  currentQuestion: string,
  falsePositiveSuppressedQuestions: Set<string>
): MemoryPattern[] {
  const currentText = normalize(currentQuestion);
  const asksAboutEarlyEntry = containsAny(currentText, EARLY_ENTRY_TERMS);

  if (!asksAboutEarlyEntry) {
    return [];
  }

  const earlyLossEvidence = entries.filter((entry) => {
    const entryQuestion = normalize(entry.question);
    if (shouldSuppressEntryByFalsePositive(entryQuestion, falsePositiveSuppressedQuestions)) {
      return false;
    }

    const text = normalize(`${entry.question} ${entry.response} ${entry.notes}`);
    return containsAny(text, EARLY_ENTRY_TERMS) && containsAny(text, NEGATIVE_TERMS);
  });

  const confirmationEvidence = entries.filter((entry) => {
    const entryQuestion = normalize(entry.question);
    if (shouldSuppressEntryByFalsePositive(entryQuestion, falsePositiveSuppressedQuestions)) {
      return false;
    }

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

function collectFalsePositiveSuppressedQuestions(warningFeedback: WarningFeedbackRecord[]): Set<string> {
  return new Set(
    warningFeedback
      .filter((entry) => entry.action === 'false-positive' && entry.warningText === EARLY_ENTRY_WARNING_TEXT)
      .map((entry) => normalize(entry.question))
      .filter(Boolean)
  );
}

function shouldSuppressEntryByFalsePositive(entryQuestion: string, falsePositiveSuppressedQuestions: Set<string>): boolean {
  if (falsePositiveSuppressedQuestions.has(entryQuestion)) {
    return true;
  }

  if (!entryQuestion) {
    return false;
  }

  return Array.from(falsePositiveSuppressedQuestions).some((feedbackQuestion) => {
    const overlap = countTermOverlap(entryQuestion, feedbackQuestion);
    return overlap >= 2;
  });
}

function countTermOverlap(left: string, right: string): number {
  const leftTerms = new Set(
    left
      .split(/\W+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2)
  );
  const rightTerms = new Set(
    right
      .split(/\W+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2)
  );

  let overlap = 0;
  Array.from(leftTerms).forEach((term) => {
    if (rightTerms.has(term)) {
      overlap += 1;
    }
  });

  return overlap;
}

function sortNewestFirst(left: JournalEntry, right: JournalEntry): number {
  return right.createdAt.localeCompare(left.createdAt);
}
