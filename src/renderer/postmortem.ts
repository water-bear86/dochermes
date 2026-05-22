import type { JournalEntry, WarningFeedbackRecord, HermesRequestDiagnostic } from '../shared/types';

export const POSTMORTEM_OUTCOME_TAG_KEY = 'hermes.postmortem.outcome.tags.v1';
export const POSTMORTEM_SUMMARY_KEY = 'hermes.postmortem.session.summaries.v1';
export const POSTMORTEM_OUTCOME_TAG_LIMIT = 300;
export const POSTMORTEM_SUMMARY_LIMIT = 80;

export type PostmortemOutcomeTag =
  | 'good-skip'
  | 'bad-entry'
  | 'ignored-warning'
  | 'followed-plan'
  | 'note-for-next-time';

export interface PostmortemTagCount {
  'good-skip': number;
  'bad-entry': number;
  'ignored-warning': number;
  'followed-plan': number;
  'note-for-next-time': number;
}

export interface PostmortemTimelineEvent {
  id: string;
  timestamp: string;
  source: string;
  title: string;
  summary: string;
  details: string[];
  provenance: string[];
  riskSignals: string[];
  kind: 'journal' | 'warning-feedback' | 'request-diagnostic';
  requestId?: string;
}

export interface PostmortemSession {
  id: string;
  label: string;
  timeline: PostmortemTimelineEvent[];
  riskSignals: string[];
}

export interface PostmortemOutcomeRecord {
  id: string;
  createdAt: string;
  eventId: string;
  tag: PostmortemOutcomeTag;
  notes?: string;
  requestId?: string;
  updatedAt?: string;
}

export interface PostmortemSummaryRecord {
  id: string;
  generatedAt: string;
  sessionId: string;
  sessionLabel: string;
  compactSummary: string;
  eventCount: number;
  taggedEventCount: number;
  tagCounts: PostmortemTagCount;
  notableRisks: string[];
}

export interface BuildPostmortemSessionsInput {
  journalEntries: JournalEntry[];
  warningFeedbackEntries: WarningFeedbackRecord[];
  requestDiagnostics: HermesRequestDiagnostic[];
}

interface BuildOutcomeInput {
  eventId: string;
  tag: PostmortemOutcomeTag;
  notes?: string;
  requestId?: string;
  now?: () => Date;
  createId?: () => string;
}

export function buildPostmortemSessions(input: BuildPostmortemSessionsInput): PostmortemSession[] {
  const sessions = new Map<string, PostmortemSession>();

  for (const entry of input.journalEntries) {
    const sessionId = toSessionId(entry.createdAt);
    const timelineEvent = buildJournalSessionEvent(entry);
    const session = sessions.get(sessionId) ?? createSession(sessionId, sessionLabelFromId(sessionId));

    session.timeline.push(timelineEvent);
    session.riskSignals = dedupe(session.riskSignals.concat(timelineEvent.riskSignals));
    sessions.set(sessionId, session);
  }

  for (const entry of input.warningFeedbackEntries) {
    const sessionId = toSessionId(entry.createdAt);
    const timelineEvent = buildWarningFeedbackSessionEvent(entry);
    const session = sessions.get(sessionId) ?? createSession(sessionId, sessionLabelFromId(sessionId));

    session.timeline.push(timelineEvent);
    session.riskSignals = dedupe(session.riskSignals.concat(timelineEvent.riskSignals));
    sessions.set(sessionId, session);
  }

  for (const diagnostic of input.requestDiagnostics) {
    const sessionId = toSessionId(diagnostic.startedAt);
    const timelineEvent = buildDiagnosticSessionEvent(diagnostic);
    const session = sessions.get(sessionId) ?? createSession(sessionId, sessionLabelFromId(sessionId));

    session.timeline.push(timelineEvent);
    session.riskSignals = dedupe(session.riskSignals.concat(timelineEvent.riskSignals));
    sessions.set(sessionId, session);
  }

  return Array.from(sessions.values())
    .map((session) => ({
      ...session,
      timeline: [...session.timeline].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    }))
    .sort((left, right) => right.id.localeCompare(left.id));
}

function buildJournalSessionEvent(entry: JournalEntry): PostmortemTimelineEvent {
  const riskSignals: string[] = [];
  const details: string[] = [];
  const provenance: string[] = [`Window capture: ${entry.selectedWindow.name}`];

  const source = `Journal (${entry.selectedWindow.name})`;
  const questionSummary = truncate(entry.question, 95);
  const responseSummary = truncate(entry.response, 120);

  details.push(`Question: ${questionSummary}`);
  details.push(`Coach response: ${responseSummary}`);

  if (entry.notes.trim()) {
    details.push(`Notes: ${truncate(entry.notes, 140)}`);
  }

  provenance.push(entry.screenshot.captured ? 'Screenshot captured' : 'No screenshot image saved');

  if (entry.monitoring) {
    if (entry.monitoring.localWarnings.length > 0) {
      const warnings = entry.monitoring.localWarnings.map((warning) => `warning:${truncate(warning, 110)}`).slice(0, 6);
      riskSignals.push(...warnings);
    }

    if (entry.monitoring.signals.length > 0) {
      details.push(
        `${entry.monitoring.signals.length} monitoring signal${entry.monitoring.signals.length === 1 ? '' : 's'} detected.`
      );

      for (const signal of entry.monitoring.signals.slice(0, 3)) {
        riskSignals.push(`${signal.source}:${signal.maskedValue} (${signal.confidence})`);
      }
    }

    if (entry.monitoring.sourceQuality && entry.monitoring.sourceQuality.length > 0) {
      const qualitySignals = entry.monitoring.sourceQuality.map(
        (finding) => `${finding.category} source (${finding.confidence}): ${truncate(finding.reason, 90)}`
      );
      riskSignals.push(...qualitySignals);
      provenance.push(`Source-quality evidence from ${entry.monitoring.sourceQuality.length} finding(s)`);
    }

    if (entry.monitoring.warningEvidence && entry.monitoring.warningEvidence.length > 0) {
      details.push(`${entry.monitoring.warningEvidence.length} warning-evidence item(s)`);
      provenance.push('Warning-evidence attached in local risk monitor.');
    }
  }

  if (entry.sourceContext) {
    details.push(`Source context: ${entry.sourceContext.category} (${entry.sourceContext.outcome})`);
    if (entry.sourceContext.tokenHint) {
      details.push(`Source token hint: ${entry.sourceContext.tokenHint}`);
    }
  }

  return {
    id: entry.id,
    timestamp: entry.createdAt,
    kind: 'journal',
    source,
    title: `Journal event: ${questionSummary}`,
    summary: truncate(`Trade check from journal entry${entry.question ? ' · question logged' : ''}`, 110),
    details,
    provenance,
    riskSignals: dedupe(riskSignals),
    requestId: entry.id
  };
}

function buildWarningFeedbackSessionEvent(entry: WarningFeedbackRecord): PostmortemTimelineEvent {
  const source = `Warning feedback (${entry.selectedWindowName})`;

  return {
    id: `feedback-${entry.id}`,
    timestamp: entry.createdAt,
    kind: 'warning-feedback',
    source,
    title: truncate(`Warning feedback: ${entry.warningText}`, 92),
    summary: `Outcome action: ${entry.action}`,
    details: [
      `Window: ${entry.selectedWindowName}`,
      `Question: ${truncate(entry.question, 100)}`,
      `Response: ${truncate(entry.response, 90)}`,
      `Warning: ${entry.warningText}`
    ],
    provenance: ['Local warning-feedback trace', `Context action: ${entry.action}`],
    riskSignals: dedupe([`action:${entry.action}`, `warning:${truncate(entry.warningText, 90)}`]),
    requestId: entry.requestId
  };
}

function buildDiagnosticSessionEvent(diagnostic: HermesRequestDiagnostic): PostmortemTimelineEvent {
  const source = `Request diagnostic (${diagnostic.selectedWindowName})`;
  const duration = diagnostic.timings.totalMs;
  const timingText = typeof duration === 'number' ? `Duration ${duration}ms` : 'Duration unavailable';
  const summary = `${diagnostic.status === 'success' ? 'Successful' : 'Failed'} ${diagnostic.connection.connectionKind} request`;
  const details: string[] = [
    `Status: ${diagnostic.status}`,
    timingText,
    `Connection: ${diagnostic.connection.endpointMode} · model ${diagnostic.connection.modelId}`
  ];
  const provenance = [
    `Hermes endpoint kind ${diagnostic.connection.connectionKind}`,
    `Endpoint mode ${diagnostic.connection.endpointMode}`
  ];
  const riskSignals: string[] = [`Request ${diagnostic.status}`];

  if (diagnostic.failure?.reason) {
    riskSignals.push(`Failure reason: ${truncate(diagnostic.failure.reason, 120)}`);
    details.push(`Failure: ${diagnostic.failure.reason}`);
  }

  if (diagnostic.connectionStatus === 'degraded') {
    riskSignals.push('Connection degraded');
  }

  if (diagnostic.debugNotes) {
    details.push(`Debug note: ${truncate(diagnostic.debugNotes, 120)}`);
  }

  return {
    id: `diagnostic-${diagnostic.id}`,
    timestamp: diagnostic.startedAt,
    kind: 'request-diagnostic',
    source,
    title: `Hermes ${diagnostic.status} ${diagnostic.selectedWindowName}`,
    summary,
    details,
    provenance,
    riskSignals: dedupe(riskSignals),
    requestId: diagnostic.id
  };
}

export function parsePostmortemOutcomeRecords(rawValue: string | null): PostmortemOutcomeRecord[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isPostmortemOutcomeRecord).sort(sortRecordsNewestFirst);
  } catch {
    return [];
  }
}

export function serializePostmortemOutcomeRecords(
  entries: PostmortemOutcomeRecord[],
  limit = POSTMORTEM_OUTCOME_TAG_LIMIT
): string {
  return JSON.stringify([...entries].sort(sortRecordsNewestFirst).slice(0, limit));
}

export function readPostmortemOutcomeRecords(storage: Pick<Storage, 'getItem'>): PostmortemOutcomeRecord[] {
  return parsePostmortemOutcomeRecords(storage.getItem(POSTMORTEM_OUTCOME_TAG_KEY));
}

export function appendPostmortemOutcomeRecord(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  input: BuildOutcomeInput
): PostmortemOutcomeRecord[] {
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? createRandomId;

  const nextOutcome = buildPostmortemOutcomeRecord({
    eventId: input.eventId,
    tag: input.tag,
    notes: input.notes,
    requestId: input.requestId,
    now,
    createId
  });

  const nextEntries = [
    nextOutcome,
    ...readPostmortemOutcomeRecords(storage).filter((entry) => entry.eventId !== nextOutcome.eventId)
  ].sort(sortRecordsNewestFirst);

  storage.setItem(POSTMORTEM_OUTCOME_TAG_KEY, serializePostmortemOutcomeRecords(nextEntries, POSTMORTEM_OUTCOME_TAG_LIMIT));
  return nextEntries.slice(0, POSTMORTEM_OUTCOME_TAG_LIMIT);
}

export function updatePostmortemOutcomeRecord(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  outcomeId: string,
  updates: Partial<Pick<PostmortemOutcomeRecord, 'tag' | 'notes'>>
): PostmortemOutcomeRecord[] {
  const nextEntries = readPostmortemOutcomeRecords(storage).map((entry) => {
    if (entry.id !== outcomeId) {
      return entry;
    }

    return {
      ...entry,
      ...updates,
      notes: updates.notes === undefined ? entry.notes : updates.notes.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
  });

  storage.setItem(POSTMORTEM_OUTCOME_TAG_KEY, serializePostmortemOutcomeRecords(nextEntries, POSTMORTEM_OUTCOME_TAG_LIMIT));
  return nextEntries;
}

export function deletePostmortemOutcomeRecord(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  outcomeId: string
): PostmortemOutcomeRecord[] {
  const nextEntries = readPostmortemOutcomeRecords(storage).filter((entry) => entry.id !== outcomeId);
  storage.setItem(POSTMORTEM_OUTCOME_TAG_KEY, serializePostmortemOutcomeRecords(nextEntries, POSTMORTEM_OUTCOME_TAG_LIMIT));
  return nextEntries;
}

function buildPostmortemOutcomeRecord(input: BuildOutcomeInput): PostmortemOutcomeRecord {
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? createRandomId;

  return {
    id: createId(),
    createdAt: now().toISOString(),
    eventId: input.eventId,
    tag: input.tag,
    ...(input.notes ? { notes: input.notes.trim() } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {})
  };
}

export function readPostmortemSummaries(storage: Pick<Storage, 'getItem'>): PostmortemSummaryRecord[] {
  const raw = storage.getItem(POSTMORTEM_SUMMARY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isPostmortemSummaryRecord).sort(sortSummariesNewestFirst);
  } catch {
    return [];
  }
}

export function serializePostmortemSummaries(
  summaries: PostmortemSummaryRecord[],
  limit = POSTMORTEM_SUMMARY_LIMIT
): string {
  return JSON.stringify([...summaries].sort(sortSummariesNewestFirst).slice(0, limit));
}

export function appendPostmortemSummary(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  summary: PostmortemSummaryRecord
): PostmortemSummaryRecord[] {
  const nextSummaries = [summary, ...readPostmortemSummaries(storage)].sort(sortSummariesNewestFirst);
  const limited = nextSummaries.slice(0, POSTMORTEM_SUMMARY_LIMIT);

  storage.setItem(POSTMORTEM_SUMMARY_KEY, serializePostmortemSummaries(limited, POSTMORTEM_SUMMARY_LIMIT));
  return limited;
}

export function buildCompactPostmortemSummary(
  session: PostmortemSession,
  outcomeRecords: PostmortemOutcomeRecord[]
): PostmortemSummaryRecord {
  const tagCounts: PostmortemTagCount = {
    'good-skip': 0,
    'bad-entry': 0,
    'ignored-warning': 0,
    'followed-plan': 0,
    'note-for-next-time': 0
  };

  const eventIds = new Set(session.timeline.map((event) => event.id));
  const related = outcomeRecords.filter((outcome) => eventIds.has(outcome.eventId));

  for (const outcome of related) {
    tagCounts[outcome.tag] += 1;
  }

  const compactSummary = buildSummaryText(session, tagCounts, related.length);
  const notableRisks = dedupe(session.riskSignals).slice(0, 5);

  return {
    id: createRandomId(),
    generatedAt: new Date().toISOString(),
    sessionId: session.id,
    sessionLabel: session.label,
    compactSummary,
    eventCount: session.timeline.length,
    taggedEventCount: related.length,
    tagCounts,
    notableRisks
  };
}

export function formatPostmortemTagLabel(tag: PostmortemOutcomeTag): string {
  if (tag === 'good-skip') {
    return 'Good skip';
  }
  if (tag === 'bad-entry') {
    return 'Bad entry';
  }
  if (tag === 'ignored-warning') {
    return 'Ignored warning';
  }
  if (tag === 'followed-plan') {
    return 'Followed plan';
  }

  return 'Note for next time';
}

function buildSummaryText(
  session: PostmortemSession,
  counts: PostmortemTagCount,
  taggedEventCount: number
): string {
  const parts = [`Session ${session.label}`, `${session.timeline.length} events in timeline`];

  if (taggedEventCount === 0) {
    parts.push('No outcomes tagged yet.');
  } else {
    const tagParts = Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([tag, value]) => `${formatPostmortemTagLabel(tag as PostmortemOutcomeTag)}=${value}`)
      .join(', ');

    parts.push(`Tagged outcomes: ${taggedEventCount}`);
    if (tagParts.length > 0) {
      parts.push(tagParts);
    }
  }

  if (session.riskSignals.length > 0) {
    const signalCount = new Set(session.riskSignals).size;
    parts.push(`${signalCount} risk signal(s).`);
  }

  return parts.filter(Boolean).join(' · ');
}

function isPostmortemOutcomeRecord(value: unknown): value is PostmortemOutcomeRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as PostmortemOutcomeRecord;

  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.eventId === 'string' &&
    typeof record.tag === 'string' &&
    isPostmortemOutcomeTag(record.tag)
  );
}

function isPostmortemOutcomeTag(value: string): value is PostmortemOutcomeTag {
  return (
    value === 'good-skip' ||
    value === 'bad-entry' ||
    value === 'ignored-warning' ||
    value === 'followed-plan' ||
    value === 'note-for-next-time'
  );
}

function isPostmortemSummaryRecord(value: unknown): value is PostmortemSummaryRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as PostmortemSummaryRecord;

  return (
    typeof record.id === 'string' &&
    typeof record.generatedAt === 'string' &&
    typeof record.sessionId === 'string' &&
    typeof record.sessionLabel === 'string' &&
    typeof record.compactSummary === 'string' &&
    typeof record.eventCount === 'number' &&
    typeof record.taggedEventCount === 'number' &&
    !!record.tagCounts &&
    typeof record.tagCounts['good-skip'] === 'number' &&
    typeof record.tagCounts['bad-entry'] === 'number' &&
    typeof record.tagCounts['ignored-warning'] === 'number' &&
    typeof record.tagCounts['followed-plan'] === 'number' &&
    typeof record.tagCounts['note-for-next-time'] === 'number' &&
    Array.isArray(record.notableRisks)
  );
}

function toSessionId(rawDate: string): string {
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.valueOf())) {
    return 'invalid';
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createSession(id: string, label: string): PostmortemSession {
  return {
    id,
    label,
    timeline: [],
    riskSignals: []
  };
}

function sessionLabelFromId(sessionId: string): string {
  if (sessionId === 'invalid') {
    return 'Unknown session';
  }

  const [year, month, day] = sessionId.split('-');
  if (!year || !month || !day) {
    return sessionId;
  }

  return `${year}-${month}-${day}`;
}

function sortRecordsNewestFirst(left: { createdAt: string }, right: { createdAt: string }): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function sortSummariesNewestFirst(left: PostmortemSummaryRecord, right: PostmortemSummaryRecord): number {
  return right.generatedAt.localeCompare(left.generatedAt);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function truncate(value: string, maximum = 120): string {
  if (value.length <= maximum) {
    return value;
  }

  return `${value.slice(0, maximum - 1)}…`;
}

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `postmortem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
