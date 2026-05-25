import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';

import type {
  MemoryContext,
  JournalMonitoringMetadata,
  CoachBridgeApi,
  HermesConnectionSettings,
  HermesConnectionKind,
  HermesConnectionReport,
  HermesEndpointMode,
  HermesConnectionStatus,
  HostedHermesTokenStatus,
  DataSharingScope,
  LocalSettings,
  CoachMode,
  HermesRequestDiagnostic,
  SourceQualityFinding,
  SourceCategory,
  SourceQualityOutcome,
  SourceQualityConfidence,
  MonitoringSignal,
  MonitoringStatus,
  OcrRegionProfileSettings,
  WarningEvidenceSummary,
  WindowSourceOption
} from '../shared/types';
import { appendJournalEntry, buildJournalEntry, clearJournalEntries, readJournalEntries } from './journal';
import {
  appendRequestDiagnostic,
  buildDiagnosticReport,
  summarizeDiagnostics,
  sanitizeQuestionPreview,
  readRequestDiagnostics,
  clearRequestDiagnostics,
  createRequestDiagnostic
} from './requestDiagnostics';
import {
  appendPostmortemOutcomeRecord,
  appendPostmortemSummary,
  buildCompactPostmortemSummary,
  buildPostmortemSessions,
  deletePostmortemOutcomeRecord,
  formatPostmortemOutcomeDetail,
  formatPostmortemTagLabel,
  readPostmortemOutcomeRecords,
  readPostmortemSummaries,
  updatePostmortemOutcomeRecord,
  type PostmortemOutcomeRecord,
  type PostmortemOutcomeTag,
  type PostmortemSession,
  type PostmortemSummaryRecord,
  type PostmortemTimelineEvent
} from './postmortem';
import { buildSourceQualityAssessment } from './sourceQuality';
import {
  appendWarningFeedback,
  clearWarningFeedbackEntries,
  deleteWarningFeedback,
  formatPolicyOverrideAuditDetail,
  readWarningFeedbackEntries,
  updateWarningFeedback,
  type WarningFeedbackAction,
  type WarningFeedbackRecord
} from './warningFeedback';
import {
  DEFAULT_OCR_REGION_PROFILE,
  DEFAULT_RISK_BUDGET_SETTINGS,
  DEFAULT_SOURCE_CONSTRAINTS,
  LOCAL_SETTINGS_KEY,
  clearLocalSettings,
  readMigratableBearerToken,
  readLocalSettings,
  writeLocalSettings
} from './localSettings';
import { buildMemoryContext, EARLY_ENTRY_WARNING_TEXT, withoutCompactTradeSummary } from './memoryContext';
import {
  buildCoachModePolicyGate,
  COACH_MODE_OPTIONS,
  formatPolicyLevelSignalSummary,
  getCoachModeCopy
} from './coachMode';
import {
  buildPrivacyAwareAskHermesInput,
  canBypassRemoteConsent,
  shouldCaptureWindowForPrivacy,
  summarizePrivacyRequestPolicy,
  type RemoteConsentBypassReason
} from './requestPolicy';
import { buildPolicyBlockUiCopy } from './policyBlockUi';
import { buildFrictionCard, type FrictionCard } from './frictionCards';
import { buildSessionRiskAssessment } from './sessionRisk';
import {
  parseTradeSize,
  readImportedTradeRecords,
  readWalletTradeRecords,
  replaceImportedTradeRecordsFromCsv,
  syncWalletTradeRecords,
  writeImportedTradeRecords,
  writeWalletTradeRecords,
  type WalletSyncProviderStatus
} from './tradeHistory';
import {
  appendTradeDecisionEvent,
  appendTradeOutcomeEvent,
  buildTradeDecisionEventFromTradeCardAction,
  buildTradeOutcomeEventFromPostmortemOutcome,
  readTradeDecisionEvents,
  readTradeOutcomeEvents
} from './tradeDecisionPersistence';
import {
  buildPersonalRuleContext,
  evaluatePersonalRules,
  type PersonalRuleWarningCandidate
} from './personalRules';
import {
  buildTradeCardViewModel,
  describeTradeCardDecision,
  type TradeCardActionViewModel
} from './tradeCardViewModel';
import { FirstRunWizard } from './FirstRunWizard';

type SpeechRecognitionResult = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onerror: ((event: VoiceRecognitionError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type WindowWithSpeechSupport = Window & {
  SpeechRecognition?: {
    new (): SpeechRecognitionResult;
  };
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type SpeechRecognitionConstructor = {
  new (): SpeechRecognitionResult;
};

type VoiceRecognitionEvent = {
  results: {
    length: number;
    [index: number]: {
      0: {
        transcript: string;
      };
    };
  };
};

type VoiceRecognitionError = {
  error: string;
};

interface WarningEvidenceEntry {
  source: string;
  detail: string;
  confidence: SourceQualityConfidence;
  provenance?: string;
  detectedAt?: string;
}

interface WarningCandidate {
  text: string;
  evidence: WarningEvidenceEntry;
}

interface WarningCard {
  text: string;
  evidences: WarningEvidenceEntry[];
}

interface PolicyCard {
  id: string;
  question: string;
  warnings: string[];
  blockers: string[];
}

interface WalletSyncState {
  status: 'idle' | 'syncing' | 'ready' | 'error';
  lastSyncedAt?: string;
  detail?: string;
  providerStatuses: WalletSyncProviderStatus[];
}

type OcrRegionKey = 'orderPanel' | 'chartZone';
type DraggingOcrRegionState = {
  key: OcrRegionKey;
  startLeft: number;
  startTop: number;
};

declare global {
  interface Window {
    hermesCoach?: CoachBridgeApi & {
      onOpenWindowPicker: (callback: () => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
      onArmCoach: (callback: (enabled: boolean) => void) => () => void;
      onVoiceHotkey: (callback: () => void) => () => void;
      onMonitorSignal: (callback: (signal: MonitoringSignal) => void) => () => void;
      onMonitorStatus: (callback: (status: MonitoringStatus) => void) => () => void;
    };
  }
}

type RequestState = 'idle' | 'loading-sources' | 'capturing' | 'asking';
type PickerMode = 'pair' | 'ask';
type HermesHeartbeatStatus = 'unknown' | HermesConnectionStatus;

type HermesRequestPreview = {
  destinationOrigin: string;
  endpointMode: HermesEndpointMode;
  dataSharingScope: DataSharingScope;
  payloadClasses: string[];
  localOnlyClasses: string[];
  requiresRemoteConsent: boolean;
};

type LastRequestContext = {
  id: string;
  question: string;
  response: string;
  selectedWindowId: string;
  selectedWindowName: string;
  selectedWindowKind: WindowSourceOption['kind'];
};

const HERMES_HEALTH_POLL_MS = 60_000;
const SOURCE_CATEGORY_OPTIONS: Array<{ value: SourceCategory; label: string }> = [
  { value: 'unknown', label: 'Unknown source' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'social', label: 'Social media' },
  { value: 'dex-link', label: 'DEX link' },
  { value: 'token-address', label: 'Token address' },
  { value: 'wallet', label: 'Wallet-related' }
];
const SOURCE_CONSTRAINT_CATEGORIES: SourceCategory[] = [
  'unknown',
  'telegram',
  'discord',
  'social',
  'dex-link',
  'token-address',
  'wallet'
];
const SOURCE_OUTCOME_OPTIONS: Array<{ value: SourceQualityOutcome; label: string }> = [
  { value: 'unknown', label: 'Unknown / not scored' },
  { value: 'good', label: 'Good outcome' },
  { value: 'neutral', label: 'Neutral outcome' },
  { value: 'bad', label: 'Bad outcome' }
];
const SOURCE_OUTCOME_HELP: Record<SourceQualityOutcome, string> = {
  unknown: 'No outcome logged yet for this source.',
  good: 'Source led to a positive outcome.',
  neutral: 'Source was observed but outcome was not clearly good or bad.',
  bad: 'Source led to a negative outcome.'
};
const POSTMORTEM_OUTCOME_TAG_OPTIONS: Array<{ value: PostmortemOutcomeTag; label: string }> = [
  { value: 'good-skip', label: formatPostmortemTagLabel('good-skip') },
  { value: 'bad-entry', label: formatPostmortemTagLabel('bad-entry') },
  { value: 'ignored-warning', label: formatPostmortemTagLabel('ignored-warning') },
  { value: 'followed-plan', label: formatPostmortemTagLabel('followed-plan') },
  { value: 'note-for-next-time', label: formatPostmortemTagLabel('note-for-next-time') }
];
const POSTMORTEM_SUMMARY_PREVIEW_LIMIT = 3;
const WALLET_SYNC_INTERVAL_MS = 180_000;
const LOCAL_DATA_CATEGORIES = [
  'Settings: Hermes gateway URL, bearer token if provided, privacy preset, coach mode, voice/OCR toggles, paired-window metadata, personal rules, and public wallet watchlist.',
  'Memory: journal notes, warning feedback, postmortem outcomes, and saved compact postmortem summaries.',
  'Trade context: imported CSV rows and read-only public wallet trade records cached for local risk checks.',
  'Diagnostics: recent request timing, gateway diagnostics, selected-window name, and sanitized question preview.',
  'Session-only context: live monitoring signals and the latest screenshot preview; journal entries store capture status, not screenshot images.'
];
const OCR_REGION_MIN_SIZE = 0.02;
const OCR_REGION_STEP = 0.01;

export function App(): ReactElement {
  const [settings, setSettings] = useState<LocalSettings>(() => readLocalSettings(localStorage));
  const [question, setQuestion] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | undefined>();
  const [editingRuleText, setEditingRuleText] = useState('');
  const [sources, setSources] = useState<WindowSourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<WindowSourceOption | undefined>(() =>
    settings.pairedWindow ? { ...settings.pairedWindow, thumbnailDataUrl: '' } : undefined
  );
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | undefined>();
  const [activeOcrRegionKey, setActiveOcrRegionKey] = useState<OcrRegionKey>('orderPanel');
  const [draggingOcrRegion, setDraggingOcrRegion] = useState<DraggingOcrRegionState | undefined>();
  const [response, setResponse] = useState('');
  const [journalNotes, setJournalNotes] = useState('');
  const [journalEntries, setJournalEntries] = useState(() => readJournalEntries(localStorage));
  const [importedTradeRecords, setImportedTradeRecords] = useState(() => readImportedTradeRecords(localStorage));
  const [walletTradeRecords, setWalletTradeRecords] = useState(() => readWalletTradeRecords(localStorage));
  const [tradeDecisionEvents, setTradeDecisionEvents] = useState(() => readTradeDecisionEvents(localStorage));
  const [tradeOutcomeEvents, setTradeOutcomeEvents] = useState(() => readTradeOutcomeEvents(localStorage));
  const [walletSyncState, setWalletSyncState] = useState<WalletSyncState>({
    status: 'idle',
    providerStatuses: []
  });
  const [tradeCsvInput, setTradeCsvInput] = useState('');
  const [tradeCsvMessage, setTradeCsvMessage] = useState('');
  const [journalSavedMessage, setJournalSavedMessage] = useState('');
  const [postmortemOutcomeRecords, setPostmortemOutcomeRecords] = useState<PostmortemOutcomeRecord[]>(() =>
    readPostmortemOutcomeRecords(localStorage)
  );
  const [postmortemSummaries, setPostmortemSummaries] = useState<PostmortemSummaryRecord[]>(() =>
    readPostmortemSummaries(localStorage)
  );
  const [selectedPostmortemSessionId, setSelectedPostmortemSessionId] = useState<string | undefined>();
  const [editingPostmortemEventId, setEditingPostmortemEventId] = useState<string | undefined>();
  const [editingPostmortemOutcome, setEditingPostmortemOutcome] = useState<PostmortemOutcomeTag>('good-skip');
  const [editingPostmortemNotes, setEditingPostmortemNotes] = useState('');
  const [editingPostmortemMistakeTags, setEditingPostmortemMistakeTags] = useState('');
  const [editingPostmortemSetupQuality, setEditingPostmortemSetupQuality] = useState(3);
  const [editingPostmortemSourceQuality, setEditingPostmortemSourceQuality] = useState(3);
  const [editingPostmortemSizingQuality, setEditingPostmortemSizingQuality] = useState(3);
  const [editingPostmortemEntryTimingQuality, setEditingPostmortemEntryTimingQuality] = useState(3);
  const [editingPostmortemInvalidationQuality, setEditingPostmortemInvalidationQuality] = useState(3);
  const [editingPostmortemMaxLossPercent, setEditingPostmortemMaxLossPercent] = useState('');
  const [editingPostmortemLessonLearned, setEditingPostmortemLessonLearned] = useState('');
  const [postmortemSummaryMessage, setPostmortemSummaryMessage] = useState('');
  const [connectionReport, setConnectionReport] = useState<HermesConnectionReport | undefined>();
  const [testingConnection, setTestingConnection] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [hostedTokenStatus, setHostedTokenStatus] = useState<HostedHermesTokenStatus | undefined>();
  const [hostedTokenDraft, setHostedTokenDraft] = useState('');
  const [hostedTokenBusy, setHostedTokenBusy] = useState(false);
  const [hostedTokenMessage, setHostedTokenMessage] = useState('');
  const [error, setError] = useState('');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [pickerMode, setPickerMode] = useState<PickerMode>('pair');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copiedDiagnosticId, setCopiedDiagnosticId] = useState<string | undefined>();
  const [requestMetrics, setRequestMetrics] = useState<{
    captureMs?: number;
    localRiskMs?: number;
    ocrMs?: number;
    requestBuildMs?: number;
    hermesMs?: number;
    totalMs?: number;
  } | undefined>();
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isSpeechSpeaking, setIsSpeechSpeaking] = useState(false);
  const [requestDiagnostics, setRequestDiagnostics] = useState<HermesRequestDiagnostic[]>(
    () => readRequestDiagnostics(localStorage)
  );
  const [monitorSignals, setMonitorSignals] = useState<MonitoringSignal[]>([]);
  const [lastRequestMonitoringMetadata, setLastRequestMonitoringMetadata] = useState<
    JournalMonitoringMetadata | undefined
  >();
  const [isCheckingHermes, setIsCheckingHermes] = useState(false);
  const [hermesHeartbeat, setHermesHeartbeat] = useState<{
    status: HermesHeartbeatStatus;
    checkedAt?: string;
    summary?: string;
    textCapable: boolean;
    imageCapable: boolean;
  }>({
    status: 'unknown',
    textCapable: false,
    imageCapable: false
  });
  const [requestPreview, setRequestPreview] = useState<HermesRequestPreview | undefined>();
  const [pendingRemoteConsent, setPendingRemoteConsent] = useState<HermesRequestPreview | undefined>();
  const [ocrStatusMessage, setOcrStatusMessage] = useState('OCR monitoring disabled.');
  const [warningFeedbackEntries, setWarningFeedbackEntries] = useState(() =>
    readWarningFeedbackEntries(localStorage)
  );
  const [lastRequestContext, setLastRequestContext] = useState<LastRequestContext | undefined>();
  const [feedbackNoteWarning, setFeedbackNoteWarning] = useState<string | undefined>();
  const [feedbackNoteText, setFeedbackNoteText] = useState('');
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | undefined>();
  const [editingFeedbackAction, setEditingFeedbackAction] = useState<WarningFeedbackAction>('followed-plan');
  const [editingFeedbackNotes, setEditingFeedbackNotes] = useState('');
  const [frictionCard, setFrictionCard] = useState<FrictionCard | undefined>();
  const [policyCard, setPolicyCard] = useState<PolicyCard | undefined>();
  const [frictionNoteText, setFrictionNoteText] = useState('');
  const [policyNoteText, setPolicyNoteText] = useState('');
  const [tradeCardNoteText, setTradeCardNoteText] = useState('');
  const [journalSourceCategory, setJournalSourceCategory] = useState<SourceCategory>('unknown');
  const [journalSourceOutcome, setJournalSourceOutcome] = useState<SourceQualityOutcome>('unknown');
  const [journalSourceTokenHint, setJournalSourceTokenHint] = useState('');
  const isMaximumPrivacy = settings.privacy.preset === 'maximum';
  const isTextRedactionEnabled =
    isMaximumPrivacy ||
    settings.privacy.redaction.redactAddresses ||
    settings.privacy.redaction.redactBalances ||
    settings.privacy.redaction.redactUsernames ||
    settings.privacy.redaction.redactAmounts;
  const validatedPairRef = useRef<string | undefined>(undefined);
  const heartbeatInFlightRef = useRef(false);
  const sourceContextAutoFillRequestId = useRef<string | undefined>(undefined);
  const walletSyncInFlight = useRef(false);
  const questionRef = useRef('');
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionResult | null>(null);
  const migratableBearerTokenRef = useRef<string | undefined>(
    readMigratableBearerToken(localStorage.getItem(LOCAL_SETTINGS_KEY))
  );
  const askWithSourceRef = useRef<(
    source: WindowSourceOption | undefined,
    options: {
      remoteConsentBypassReason?: RemoteConsentBypassReason;
      skipPolicyCheck?: boolean;
      skipFrictionCheck?: boolean;
    },
    rawQuestion?: string
  ) => Promise<void>>(null);
  const bridge = window.hermesCoach;
  const hasHostedTokenBridge = Boolean(bridge);
  const usesSecureHostedTokenStore = settings.connection.connectionKind === 'hosted';

  const hasQuestion = question.trim().length > 0;
  const canAsk = requestState === 'idle' && hasQuestion && Boolean(bridge);
  const selectedLabel = selectedSource ? `${selectedSource.name} (${selectedSource.kind})` : 'No trading window selected';
  const historyEntriesForRiskChecks = useMemo(
    () => (settings.dataSharing.useLocalTradeHistoryForRiskChecks ? journalEntries : []),
    [journalEntries, settings.dataSharing.useLocalTradeHistoryForRiskChecks]
  );
  const importedTradeRecordsForRiskChecks = useMemo(
    () => (settings.dataSharing.useLocalTradeHistoryForRiskChecks ? importedTradeRecords : []),
    [importedTradeRecords, settings.dataSharing.useLocalTradeHistoryForRiskChecks]
  );
  const walletTradeRecordsForRiskChecks = useMemo(
    () => (settings.dataSharing.useLocalTradeHistoryForRiskChecks ? walletTradeRecords : []),
    [settings.dataSharing.useLocalTradeHistoryForRiskChecks, walletTradeRecords]
  );
  const tradeDecisionEventsForRiskChecks = useMemo(
    () => (settings.dataSharing.useLocalTradeHistoryForRiskChecks ? tradeDecisionEvents : []),
    [settings.dataSharing.useLocalTradeHistoryForRiskChecks, tradeDecisionEvents]
  );
  const tradeOutcomeEventsForRiskChecks = useMemo(
    () => (settings.dataSharing.useLocalTradeHistoryForRiskChecks ? tradeOutcomeEvents : []),
    [settings.dataSharing.useLocalTradeHistoryForRiskChecks, tradeOutcomeEvents]
  );
  const memoryContext = useMemo(
    () =>
      buildMemoryContext(
        historyEntriesForRiskChecks,
        question,
        warningFeedbackEntries,
        postmortemSummaries,
        importedTradeRecordsForRiskChecks.concat(walletTradeRecordsForRiskChecks),
        tradeDecisionEventsForRiskChecks,
        tradeOutcomeEventsForRiskChecks
      ),
    [
      historyEntriesForRiskChecks,
      importedTradeRecordsForRiskChecks,
      postmortemSummaries,
      question,
      tradeDecisionEventsForRiskChecks,
      tradeOutcomeEventsForRiskChecks,
      walletTradeRecordsForRiskChecks,
      warningFeedbackEntries
    ]
  );
  const diagnosticSummary = useMemo(() => summarizeDiagnostics(requestDiagnostics), [requestDiagnostics]);
  const connectionScope = useMemo(() => inferDataSharingScope(settings.connection), [settings.connection]);
  const hostedTokenStatusText = useMemo(
    () => describeHostedTokenStatus(hostedTokenStatus, hasHostedTokenBridge),
    [hasHostedTokenBridge, hostedTokenStatus]
  );
  const sourceQualityAssessment = useMemo(
    () => buildSourceQualityAssessment({ question, monitorSignals, journalEntries: historyEntriesForRiskChecks }),
    [question, historyEntriesForRiskChecks, monitorSignals]
  );
  const sessionRiskAssessment = useMemo(
    () =>
      buildSessionRiskAssessment({
        question,
        journalEntries: historyEntriesForRiskChecks,
        riskBudget: settings.riskBudget,
        sourceFindings: sourceQualityAssessment.findings
      }),
    [historyEntriesForRiskChecks, question, settings.riskBudget, sourceQualityAssessment.findings]
  );
  const personalRulesWarningSummary = useMemo(
    () =>
      evaluatePersonalRules({
        rules: settings.personalRules,
        question,
        monitorSignals,
        knownLossCount: sessionRiskAssessment.status.knownLossSamples,
        now: new Date().toISOString()
      }),
    [question, sessionRiskAssessment.status.knownLossSamples, settings.personalRules, monitorSignals]
  );
  const topSourceQualityFinding = sourceQualityAssessment.findings[0];
  const topSourceQualityCategoryLabel = topSourceQualityFinding ? sourceCategoryLabel(topSourceQualityFinding.category) : '';
  const postmortemSessions = useMemo(
    () =>
      buildPostmortemSessions({
        journalEntries,
        warningFeedbackEntries,
        requestDiagnostics
      }),
    [journalEntries, warningFeedbackEntries, requestDiagnostics]
  );
  const postmortemSessionById = useMemo(() => {
    const next: Record<string, PostmortemSession> = {};
    for (const session of postmortemSessions) {
      next[session.id] = session;
    }
    return next;
  }, [postmortemSessions]);
  const postmortemSession = useMemo(() => {
    if (!selectedPostmortemSessionId) {
      return postmortemSessions[0];
    }

    return postmortemSessionById[selectedPostmortemSessionId] ?? postmortemSessions[0];
  }, [postmortemSessionById, postmortemSessions, selectedPostmortemSessionId]);
  const postmortemOutcomesBySession = useMemo(() => {
    const next = new Map<string, PostmortemOutcomeRecord[]>();
    for (const session of postmortemSessions) {
      const eventIds = new Set(session.timeline.map((event) => event.id));
      const outcomes = postmortemOutcomeRecords.filter((record) => eventIds.has(record.eventId));
      next.set(session.id, outcomes);
    }
    return next;
  }, [postmortemOutcomeRecords, postmortemSessions]);
  const postmortemSessionOutcomes = useMemo(() => {
    if (!postmortemSession) {
      return [] as PostmortemOutcomeRecord[];
    }

    return postmortemOutcomesBySession.get(postmortemSession.id) ?? [];
  }, [postmortemOutcomesBySession, postmortemSession]);
  const postmortemSessionSummaries = useMemo(
    () => postmortemSummaries.filter((summary) => postmortemSession && summary.sessionId === postmortemSession.id),
    [postmortemSession, postmortemSummaries]
  );
  const postmortemSessionSummaryLabel = postmortemSession ? postmortemSession.label : 'No session selected';

  useEffect(() => {
    if (postmortemSessions.length === 0) {
      setSelectedPostmortemSessionId(undefined);
      return;
    }

    if (selectedPostmortemSessionId && postmortemSessionById[selectedPostmortemSessionId]) {
      return;
    }

    setSelectedPostmortemSessionId(postmortemSessions[0].id);
  }, [postmortemSessionById, postmortemSessions, selectedPostmortemSessionId]);
  const localWarningCards = useMemo(
    () =>
      buildLocalWarningCards({
        ruleWarnings: [
          ...localRuleWarnings(memoryContext.matchedPatterns.length > 0, question, memoryContext),
          ...sessionRiskAssessment.warnings.map(toLocalWarningCandidate),
          ...personalRulesWarningSummary.warnings.map(toLocalWarningCandidate)
        ],
        sourceQualityWarnings: sourceQualityAssessment.warningFindings
      }),
    [
      memoryContext,
      personalRulesWarningSummary.warnings,
      question,
      sessionRiskAssessment.warnings,
      sourceQualityAssessment.warningFindings
    ]
  );
  const localWarningEvidence = useMemo(
    () =>
      localWarningCards.flatMap((warning) =>
        warning.evidences.map((evidence) => ({
          warningText: warning.text,
          source: evidence.source,
          detail: evidence.detail,
          confidence: evidence.confidence,
          provenance: evidence.provenance,
          detectedAt: evidence.detectedAt
        }))
      ),
    [localWarningCards]
  );
  const localWarnings = useMemo(() => localWarningCards.map((warning) => warning.text), [localWarningCards]);
  const tradeCard = useMemo(() => {
    if (!response) {
      return undefined;
    }

    return buildTradeCardViewModel({
      question: lastRequestContext?.question ?? question,
      response,
      mode: settings.coachMode,
      monitorSignals,
      memoryContext,
      localWarnings,
      sourceFinding: topSourceQualityFinding
    });
  }, [
    lastRequestContext?.question,
    localWarnings,
    memoryContext,
    monitorSignals,
    question,
    response,
    settings.coachMode,
    topSourceQualityFinding
  ]);
  const activePersonalRules = useMemo(
    () => settings.personalRules.filter((rule) => !rule.archived),
    [settings.personalRules]
  );
  const archivedPersonalRules = useMemo(() => settings.personalRules.filter((rule) => rule.archived), [settings.personalRules]);
  const policyBlockingWarnings = useMemo(
    () =>
      sessionRiskAssessment.warnings
        .filter((warning) => warning.policyLevel === 'policy')
        .map((warning) => warning.text)
        .concat(
          personalRulesWarningSummary.warnings
            .filter((warning) => warning.policyLevel === 'policy')
            .map((warning) => warning.text)
        ),
    [personalRulesWarningSummary.warnings, sessionRiskAssessment.warnings]
  );
  const sessionRiskStatusClass = useMemo(() => {
    const policyWarnings = sessionRiskAssessment.warnings.filter((warning) => warning.policyLevel === 'policy');
    const guardrailWarnings = sessionRiskAssessment.warnings.filter((warning) => warning.policyLevel === 'guardrail');

    if (!sessionRiskAssessment.status.enabled) {
      return 'session-risk-status--off';
    }

    if (policyWarnings.length > 0) {
      return 'session-risk-status--high';
    }

    if (guardrailWarnings.length > 0) {
      return 'session-risk-status--medium';
    }

    if (sessionRiskAssessment.warnings.length >= 2) {
      return 'session-risk-status--medium';
    }

    if (sessionRiskAssessment.warnings.length === 1) {
      return 'session-risk-status--low';
    }

    return 'session-risk-status--ok';
  }, [sessionRiskAssessment.status.enabled, sessionRiskAssessment.warnings]);
  const activeCoachModeCopy = useMemo(() => getCoachModeCopy(settings.coachMode), [settings.coachMode]);
  const sessionRiskSignalSummary = useMemo(
    () => formatPolicyLevelSignalSummary(sessionRiskAssessment.warnings.map((warning) => warning.policyLevel)),
    [sessionRiskAssessment.warnings]
  );

  const sessionRiskLossText = sessionRiskAssessment.status.hasLossData
    ? `${sessionRiskAssessment.status.knownLossPercent.toFixed(2)}% of ${sessionRiskAssessment.status.maxLossPerSessionPercent}%`
    : 'No structured loss data today';
  const sessionRiskTradeText = `${sessionRiskAssessment.status.tradeCount}/${sessionRiskAssessment.status.maxTradesPerSession}`;
  const ocrOverlayRegions = useMemo(
    () => buildOcrOverlayRegions(settings.ocrContextMode, settings.ocrRegionProfile, activeOcrRegionKey),
    [activeOcrRegionKey, settings.ocrContextMode, settings.ocrRegionProfile]
  );
  const activeOcrRegionRect = settings.ocrRegionProfile[activeOcrRegionKey];

  useEffect(() => {
    questionRef.current = question;
  }, [question]);


  useEffect(() => {
    const firstFinding = sourceQualityAssessment.findings[0];
    if (!firstFinding) {
      return;
    }

    setJournalSourceCategory((current) => (current === 'unknown' ? firstFinding.category : current));
    if (!journalSourceTokenHint.trim() && firstFinding.tokenHint) {
      setJournalSourceTokenHint(firstFinding.tokenHint);
    }
  }, [sourceQualityAssessment.findings, journalSourceTokenHint]);


  const updateConnection = useCallback((updates: Partial<LocalSettings['connection']>) => {
    setConnectionReport(undefined);
    setCopiedReport(false);
    setSettings((current) => ({
      ...current,
      connection: {
        ...current.connection,
        ...updates
      }
    }));
  }, []);

  const refreshHostedTokenStatus = useCallback(async () => {
    if (!bridge || !hasHostedTokenBridge) {
      setHostedTokenStatus({
        available: false,
        hasToken: false,
        reason: 'safe-storage-unavailable'
      });
      return;
    }

    try {
      setHostedTokenStatus(await bridge.getHostedHermesTokenStatus());
    } catch (nextError) {
      setHostedTokenStatus({
        available: false,
        hasToken: false,
        reason: 'safe-storage-unavailable'
      });
      setError(readError(nextError));
    }
  }, [bridge, hasHostedTokenBridge]);

  const saveHostedToken = useCallback(async () => {
    const token = hostedTokenDraft.trim();
    if (!token) {
      setHostedTokenMessage('Enter a bearer token before saving.');
      return;
    }

    if (!bridge || !hasHostedTokenBridge) {
      setHostedTokenStatus({
        available: false,
        hasToken: false,
        reason: 'safe-storage-unavailable'
      });
      setHostedTokenMessage('Secure storage is unavailable in this runtime.');
      return;
    }

    setHostedTokenBusy(true);
    setHostedTokenMessage('');

    try {
      const nextStatus = await bridge.saveHostedHermesToken({ token });
      setHostedTokenStatus(nextStatus);
      if (nextStatus.available && nextStatus.hasToken) {
        setSettings((current) => ({
          ...current,
          connection: {
            ...current.connection,
            bearerToken: token
          }
        }));
        setHostedTokenDraft('');
        setHostedTokenMessage('Bearer token saved to secure storage.');
      } else {
        setHostedTokenMessage('Secure storage is unavailable. Token was not saved.');
      }
    } catch (nextError) {
      setHostedTokenMessage(readError(nextError));
    } finally {
      setHostedTokenBusy(false);
    }
  }, [bridge, hasHostedTokenBridge, hostedTokenDraft]);

  const clearHostedToken = useCallback(async () => {
    if (!bridge || !hasHostedTokenBridge) {
      setHostedTokenStatus({
        available: false,
        hasToken: false,
        reason: 'safe-storage-unavailable'
      });
      setHostedTokenMessage('Secure storage is unavailable in this runtime.');
      return;
    }

    setHostedTokenBusy(true);
    setHostedTokenMessage('');

    try {
      const nextStatus = await bridge.clearHostedHermesToken();
      setHostedTokenStatus(nextStatus);
      setHostedTokenDraft('');
      setConnectionReport(undefined);
      setSettings((current) => ({
        ...current,
        connection: {
          ...current.connection,
          bearerToken: ''
        }
      }));
      setHostedTokenMessage('Bearer token cleared from secure storage.');
    } catch (nextError) {
      setHostedTokenMessage(readError(nextError));
    } finally {
      setHostedTokenBusy(false);
    }
  }, [bridge, hasHostedTokenBridge]);

  const updateRiskBudget = useCallback((updates: Partial<LocalSettings['riskBudget']>) => {
    setSettings((current) => ({
      ...current,
      riskBudget: {
        ...current.riskBudget,
        ...updates
      }
    }));
  }, []);

  const updateSourceConstraint = useCallback(
    (category: SourceCategory, updates: { enabled?: boolean; maxSizeMultiplier?: number }) => {
      setSettings((current) => {
        const prior = current.riskBudget.sourceConstraints[category] ?? DEFAULT_SOURCE_CONSTRAINTS[category] ?? { enabled: false, maxSizeMultiplier: 1 };
        const next = {
          ...prior,
          ...(typeof updates.enabled === 'boolean' ? { enabled: updates.enabled } : {}),
          ...(typeof updates.maxSizeMultiplier === 'number' ? { maxSizeMultiplier: updates.maxSizeMultiplier } : {})
        };

        return {
          ...current,
          riskBudget: {
            ...current.riskBudget,
            sourceConstraints: {
              ...current.riskBudget.sourceConstraints,
              [category]: next
            }
          }
        };
      });
    },
    []
  );

  const updateCoachMode = useCallback((mode: CoachMode) => {
    setSettings((current) => ({
      ...current,
      coachMode: mode
    }));
  }, []);

  const updatePersonalRules = useCallback((updater: (nextRules: LocalSettings['personalRules']) => LocalSettings['personalRules']) => {
    const now = new Date().toISOString();

    setSettings((current) => {
      const nextRules = updater(current.personalRules);
      return {
        ...current,
        personalRules: nextRules.map((rule) => ({
          ...rule,
          updatedAt: now
        }))
      };
    });
  }, []);

  const addPersonalRule = useCallback(() => {
    const text = newRuleText.trim();
    if (!text) {
      return;
    }

    const now = new Date().toISOString();
    const nextRule = {
      id: createRequestContextId(),
      text,
      enabled: true,
      archived: false,
      createdAt: now,
      updatedAt: now
    };

    updatePersonalRules((current) => [nextRule, ...current]);
    setNewRuleText('');
  }, [newRuleText, updatePersonalRules]);

  const togglePersonalRule = useCallback((ruleId: string) => {
    updatePersonalRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              enabled: !rule.enabled
            }
          : rule
      )
    );
  }, [updatePersonalRules]);

  const archivePersonalRule = useCallback((ruleId: string) => {
    updatePersonalRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, archived: true } : rule)));
  }, [updatePersonalRules]);

  const restorePersonalRule = useCallback((ruleId: string) => {
    updatePersonalRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, archived: false } : rule)));
  }, [updatePersonalRules]);

  const startRuleEdit = useCallback((ruleId: string, text: string) => {
    setEditingRuleId(ruleId);
    setEditingRuleText(text);
  }, []);

  const saveRuleEdit = useCallback(() => {
    const text = editingRuleText.trim();
    if (!editingRuleId || !text) {
      setEditingRuleId(undefined);
      setEditingRuleText('');
      return;
    }

    updatePersonalRules((current) =>
      current.map((rule) =>
        rule.id === editingRuleId
          ? {
              ...rule,
              text,
              updatedAt: new Date().toISOString()
            }
          : rule
      )
    );
    setEditingRuleId(undefined);
    setEditingRuleText('');
  }, [editingRuleId, editingRuleText, updatePersonalRules]);

  const cancelRuleEdit = useCallback(() => {
    setEditingRuleId(undefined);
    setEditingRuleText('');
  }, []);

  const stopSpeechOutput = useCallback(() => {
    if (!window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeechSpeaking(false);
  }, []);

  const speakResponse = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      return;
    }

    stopSpeechOutput();
    const nextUtterance = new SpeechSynthesisUtterance(text);
    nextUtterance.onstart = () => {
      setIsSpeechSpeaking(true);
    };
    nextUtterance.onend = () => {
      setIsSpeechSpeaking(false);
    };
    nextUtterance.onerror = () => {
      setIsSpeechSpeaking(false);
    };

    window.speechSynthesis.speak(nextUtterance);
  }, [stopSpeechOutput]);

  const resolveSpeechRecognitionConstructor = useCallback((): SpeechRecognitionConstructor | undefined => {
    const typedWindow = window as WindowWithSpeechSupport;
    if (typeof typedWindow.SpeechRecognition === 'function') {
      return typedWindow.SpeechRecognition;
    }

    if (typeof typedWindow.webkitSpeechRecognition === 'function') {
      return typedWindow.webkitSpeechRecognition;
    }

    return undefined;
  }, []);

  const loadSources = useCallback(async (mode: PickerMode = 'pair') => {
    if (!bridge) {
      setError('Hermes Coach must be run from the desktop add-on to capture windows.');
      return;
    }

    setError('');
    setPickerMode(mode);
    setRequestState('loading-sources');

    try {
      const nextSources = await bridge.listWindowSources();
      setSources(nextSources);
      setPickerOpen(true);

      if (nextSources.length === 0) {
        setError('No capturable windows were found. Open your trading platform and check screen recording permissions.');
      }
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setRequestState('idle');
    }
  }, [bridge]);

  const stopVoiceCapture = useCallback(() => {
    const activeRecognition = speechRecognitionRef.current;
    if (!activeRecognition) {
      setIsVoiceListening(false);
      return;
    }

    activeRecognition.onend = null;
    activeRecognition.onerror = null;
    activeRecognition.onresult = null;
    try {
      activeRecognition.abort();
    } catch {
      // ignore
    }
    speechRecognitionRef.current = null;
    setIsVoiceListening(false);
  }, []);

  const startVoiceCapture = useCallback(() => {
    if (!settings.voice.enabled) {
      setError('Enable the voice assistant before using push-to-talk.');
      return;
    }

    if (!selectedSource) {
      setError('Choose the trading window to inspect first.');
      setPickerMode('ask');
      void loadSources('ask');
      return;
    }

    if (requestState !== 'idle') {
      setError('Wait for the current request to finish before recording.');
      return;
    }

    const SpeechRecognitionCtor = resolveSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setError('Push-to-talk is unavailable: this build lacks browser speech recognition.');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    const selectedSourceForRequest = selectedSource;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((entry) => entry[0]?.transcript)
        .join(' ')
        .trim();
      const runRequest = askWithSourceRef.current;

      if (!transcript) {
        setError('No clear speech captured. Try again.');
        return;
      }

      if (!runRequest) {
        setError('Voice request pipeline is still initializing. Try again.');
        return;
      }

      setQuestion(transcript);
      void runRequest(selectedSourceForRequest, {}, transcript);
      stopVoiceCapture();
    };
    recognition.onerror = (event) => {
      const detail = event.error;
      setError(`Push-to-talk error: ${detail}`);
      stopVoiceCapture();
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
    };

    speechRecognitionRef.current = recognition;
    setIsVoiceListening(true);
    setError('');
    try {
      recognition.start();
    } catch (nextError) {
      stopVoiceCapture();
      setError(readError(nextError));
    }
  }, [loadSources, resolveSpeechRecognitionConstructor, requestState, selectedSource, settings.voice.enabled, stopVoiceCapture]);

  const toggleVoiceCapture = useCallback(() => {
    if (isVoiceListening) {
      stopVoiceCapture();
      return;
    }

    startVoiceCapture();
  }, [isVoiceListening, startVoiceCapture, stopVoiceCapture]);

  const updateVoice = useCallback((updates: Partial<LocalSettings['voice']>) => {
    setSettings((current) => ({
      ...current,
      voice: {
        ...current.voice,
        ...updates
      }
    }));
  }, []);

  const updateOcrRegionRect = useCallback(
    (key: OcrRegionKey, updates: Partial<OcrRegionProfileSettings['orderPanel']>) => {
      setSettings((current) => {
        const prior = current.ocrRegionProfile[key];
        const nextRect = sanitizeNormalizedRegionRect({
          left: updates.left ?? prior.left,
          top: updates.top ?? prior.top,
          width: updates.width ?? prior.width,
          height: updates.height ?? prior.height
        });

        return {
          ...current,
          ocrRegionProfile: {
            ...current.ocrRegionProfile,
            [key]: nextRect
          }
        };
      });
    },
    []
  );

  const resetOcrRegionProfileDefaults = useCallback(() => {
    setSettings((current) => ({
      ...current,
      ocrRegionProfile: DEFAULT_OCR_REGION_PROFILE
    }));
    setActiveOcrRegionKey('orderPanel');
  }, []);

  useEffect(() => {
    void refreshHostedTokenStatus();
  }, [refreshHostedTokenStatus]);

  useEffect(() => {
    const migratableToken = migratableBearerTokenRef.current;
    if (!migratableToken || !usesSecureHostedTokenStore || !bridge || !hasHostedTokenBridge) {
      return;
    }

    migratableBearerTokenRef.current = undefined;
    void (async () => {
      try {
        const nextStatus = await bridge.saveHostedHermesToken({ token: migratableToken });
        setHostedTokenStatus(nextStatus);
        if (nextStatus.available && nextStatus.hasToken) {
          setSettings((current) => ({
            ...current,
            connection: {
              ...current.connection,
              bearerToken: migratableToken
            }
          }));
          setHostedTokenMessage('Existing bearer token moved to secure storage.');
        }
      } catch (nextError) {
        setHostedTokenMessage(readError(nextError));
      }
    })();
  }, [bridge, hasHostedTokenBridge, usesSecureHostedTokenStore]);

  const beginOcrOverlayDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!settings.ocrRegionProfile.overlayEnabled || !screenshotDataUrl) {
        return;
      }

      const image = previewImageRef.current;
      if (!image) {
        return;
      }

      const normalized = toNormalizedPointerPosition(image, event.clientX, event.clientY);
      if (!normalized) {
        return;
      }

      updateOcrRegionRect(activeOcrRegionKey, {
        left: normalized.left,
        top: normalized.top,
        width: OCR_REGION_MIN_SIZE,
        height: OCR_REGION_MIN_SIZE
      });
      setDraggingOcrRegion({
        key: activeOcrRegionKey,
        startLeft: normalized.left,
        startTop: normalized.top
      });
    },
    [activeOcrRegionKey, screenshotDataUrl, settings.ocrRegionProfile.overlayEnabled, updateOcrRegionRect]
  );

  useEffect(() => {
    if (!draggingOcrRegion) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent): void => {
      const image = previewImageRef.current;
      if (!image) {
        return;
      }

      const normalized = toNormalizedPointerPosition(image, event.clientX, event.clientY);
      if (!normalized) {
        return;
      }

      const nextLeft = Math.min(draggingOcrRegion.startLeft, normalized.left);
      const nextTop = Math.min(draggingOcrRegion.startTop, normalized.top);
      const nextWidth = Math.max(Math.abs(normalized.left - draggingOcrRegion.startLeft), OCR_REGION_MIN_SIZE);
      const nextHeight = Math.max(Math.abs(normalized.top - draggingOcrRegion.startTop), OCR_REGION_MIN_SIZE);

      updateOcrRegionRect(draggingOcrRegion.key, {
        left: nextLeft,
        top: nextTop,
        width: nextWidth,
        height: nextHeight
      });
    };

    const onPointerUp = (): void => {
      setDraggingOcrRegion(undefined);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [draggingOcrRegion, updateOcrRegionRect]);

  useEffect(() => {
    writeLocalSettings(localStorage, settings);
    void bridge?.setAlwaysOnTop(settings.keepAlwaysOnTop).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setArmedMode(settings.armed).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setWatchClipboard(settings.watchClipboard).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setWatchOCR(settings.watchOCR).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setMonitorSource(settings.pairedWindow?.id).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setOcrContextMode(settings.ocrContextMode).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setOcrRegionProfile(settings.ocrRegionProfile).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
    void bridge?.setVoiceSettings(settings.voice).catch((nextError: unknown) => {
      setError(readError(nextError));
    });
  }, [bridge, settings]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onVoiceHotkey(() => {
      if (!settings.voice.enabled) {
        return;
      }

      toggleVoiceCapture();
    });
  }, [bridge, settings.voice.enabled, toggleVoiceCapture]);

  useEffect(() => {
    if (!settings.voice.speakReplies) {
      stopSpeechOutput();
    }
  }, [settings.voice.speakReplies, stopSpeechOutput]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onOpenWindowPicker(() => {
      void loadSources('pair');
    });
  }, [bridge, loadSources]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onOpenSettings(() => {
      setSettingsOpen(true);
    });
  }, [bridge]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onArmCoach((armed) => {
      setSettings((current) => ({
        ...current,
        armed
      }));
    });
  }, [bridge]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onMonitorSignal((signal) => {
      setMonitorSignals((current) => {
        const alreadyKnown = current.some(
          (currentSignal) => currentSignal.detectedAt === signal.detectedAt && currentSignal.value === signal.value
        );

        if (alreadyKnown) {
          return current;
        }

        return [signal, ...current].slice(0, 8);
      });
    });
  }, [bridge]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onMonitorStatus((status) => {
      if (status.source === 'ocr') {
        setOcrStatusMessage(status.message);
      }
    });
  }, [bridge]);

  useEffect(() => {
    if (!settings.watchClipboard && !settings.watchOCR) {
      setMonitorSignals([]);
      return;
    }
  }, [settings.watchClipboard, settings.watchOCR]);

  useEffect(() => {
    setRequestPreview(undefined);
    setPendingRemoteConsent(undefined);
  }, [settings.connection, settings.privacy]);

  const askWithSource = useCallback(
    async (
      source: WindowSourceOption | undefined,
      options: {
        remoteConsentBypassReason?: RemoteConsentBypassReason;
        skipPolicyCheck?: boolean;
        skipFrictionCheck?: boolean;
      } = {},
      rawQuestion?: string
    ) => {
      const questionText = (rawQuestion ?? questionRef.current).trim();
      const skipRemoteConsent = canBypassRemoteConsent(options.remoteConsentBypassReason);
      const skipPolicyCheck = options.skipPolicyCheck ?? false;
      const skipFrictionCheck = options.skipFrictionCheck ?? false;

      if (!questionText) {
        setError('Ask a question before sending a capture to Hermes.');
        return;
      }

      if (!bridge) {
        setError('Hermes Coach must be run from the desktop add-on to capture windows.');
        return;
      }

      if (!source) {
        setError('Choose the trading window to inspect first.');
        setSettings((current) => ({
          ...current,
          pairedWindow: undefined
        }));
        setSelectedSource(undefined);
        void loadSources('ask');
        return;
      }

      const requestHistoryEntries = settings.dataSharing.useLocalTradeHistoryForRiskChecks ? journalEntries : [];
      const requestImportedTradeRecords = settings.dataSharing.useLocalTradeHistoryForRiskChecks
        ? importedTradeRecords
        : [];
      const requestWalletTradeRecords = settings.dataSharing.useLocalTradeHistoryForRiskChecks
        ? walletTradeRecords
        : [];
      const requestTradeDecisionEvents = settings.dataSharing.useLocalTradeHistoryForRiskChecks
        ? tradeDecisionEvents
        : [];
      const requestTradeOutcomeEvents = settings.dataSharing.useLocalTradeHistoryForRiskChecks
        ? tradeOutcomeEvents
        : [];
      const requestMemoryContext = buildMemoryContext(
        requestHistoryEntries,
        questionText,
        warningFeedbackEntries,
        postmortemSummaries,
        requestImportedTradeRecords.concat(requestWalletTradeRecords),
        requestTradeDecisionEvents,
        requestTradeOutcomeEvents
      );
      const requestSourceQuality = buildSourceQualityAssessment({
        question: questionText,
        monitorSignals,
        journalEntries: requestHistoryEntries
      });
      const requestSessionRiskAssessment = buildSessionRiskAssessment({
        question: questionText,
        journalEntries: requestHistoryEntries,
        riskBudget: settings.riskBudget,
        sourceFindings: requestSourceQuality.findings
      });
      const requestPersonalRules = evaluatePersonalRules({
        rules: settings.personalRules,
        question: questionText,
        monitorSignals,
        knownLossCount: requestSessionRiskAssessment.status.knownLossSamples
      });
      const requestPersonalRuleContext = buildPersonalRuleContext({
        activeRules: requestPersonalRules.activeRules,
        warnings: requestPersonalRules.warnings
      });
      const requestLocalWarningCards = buildLocalWarningCards({
        ruleWarnings: [
          ...localRuleWarnings(requestMemoryContext.matchedPatterns.length > 0, questionText, requestMemoryContext),
          ...requestSessionRiskAssessment.warnings.map(toLocalWarningCandidate),
          ...requestPersonalRules.warnings.map(toLocalWarningCandidate)
        ],
        sourceQualityWarnings: requestSourceQuality.warningFindings
      });
      const requestLocalWarnings = requestLocalWarningCards.map((entry) => entry.text);
      const requestMemoryContextForHermes = settings.dataSharing.sendCompactTradeSummaryToHermes
        ? requestMemoryContext
        : withoutCompactTradeSummary(requestMemoryContext);
      const requestPolicyBlockingWarnings = [
        ...requestSessionRiskAssessment.warnings
          .filter((entry) => entry.policyLevel === 'policy')
          .map((entry) => entry.text),
        ...requestPersonalRules.warnings
          .filter((entry) => entry.policyLevel === 'policy')
          .map((entry) => entry.text)
      ];
      const requestPolicyGate = buildCoachModePolicyGate({
        mode: settings.coachMode,
        policyWarnings: requestPolicyBlockingWarnings
      });
      const requestWarningEvidence: WarningEvidenceSummary[] = requestLocalWarningCards.flatMap((entry) =>
        entry.evidences.map((evidence) => ({
          warningText: entry.text,
          source: evidence.source,
          detail: evidence.detail,
          confidence: evidence.confidence,
          ...(evidence.provenance ? { provenance: evidence.provenance } : {}),
          ...(evidence.detectedAt ? { detectedAt: evidence.detectedAt } : {})
        }))
      );
      const monitoringSnapshot = buildMonitoringMetadata(
        requestLocalWarnings,
        monitorSignals,
        requestSourceQuality.findings,
        requestWarningEvidence
      );

      setPolicyCard(undefined);
      if (!skipPolicyCheck && requestPolicyGate.shouldBlock) {
        setPolicyCard({
          id: createRequestContextId(),
          question: questionText,
          warnings: requestLocalWarnings,
          blockers: requestPolicyGate.blockers
        });
        return;
      }

      if (!skipFrictionCheck) {
        const nextFrictionCard = buildFrictionCard({
          question: questionText,
          localWarnings: requestLocalWarnings,
          matchedPatternCount: requestMemoryContext.matchedPatterns.length,
          frictionEnabled: settings.friction.enabled,
          frictionStrictness: settings.friction.strictness
        });

        if (nextFrictionCard) {
          setFrictionCard(nextFrictionCard);
          return;
        }
      }

      const analysisStartedAt = performance.now();
      const nextPreview = buildHermesRequestPreview({
        connection: settings.connection,
        selectedWindow: source,
        memoryContext: requestMemoryContextForHermes,
        privacy: settings.privacy,
        monitoringContext: monitoringSnapshot
      });
      setRequestPreview(nextPreview);

      if (nextPreview.requiresRemoteConsent && !skipRemoteConsent) {
        setPendingRemoteConsent(nextPreview);
        setError(
          settings.privacy.preset === 'maximum'
            ? 'Remote Hermes destination selected. Confirm before sending the placeholder-only maximum privacy request.'
            : 'Remote Hermes destination selected. Confirm before sending screenshot.'
        );
        return;
      }

      setPendingRemoteConsent(undefined);
      setError('');
      setResponse('');
      setTradeCardNoteText('');
      setScreenshotDataUrl(undefined);
      setRequestMetrics(undefined);
      setLastRequestMonitoringMetadata(undefined);
      setRequestState('capturing');

      const requestId = createRequestContextId();
      const requestStartedAt = new Date().toISOString();
      const timingStarted = performance.now();
      let localRiskMs = Math.round(performance.now() - analysisStartedAt);
      let ocrMs: number | undefined;
      let requestBuildMs = 0;
      let captureMs = 0;
      let hermesMs = 0;
      let failure: HermesRequestDiagnostic['failure'];
      let diagnosticError: string | undefined;
      const requestContext = inferDataSharingScope(settings.connection);
      let requestPrivacySummary: HermesRequestDiagnostic['request']['privacySummary'] | undefined =
        summarizePrivacyRequestPolicy({
          connection: settings.connection,
          question: questionText,
          screenshotDataUrl: '',
          selectedWindow: source,
          memoryContext: {
            ...requestMemoryContextForHermes,
            personalRules: requestPersonalRuleContext
          },
          monitoringContext: monitoringSnapshot,
          privacy: settings.privacy
        });

      let stage: Exclude<HermesRequestDiagnostic['failure'], undefined>['stage'] = 'validation';

      try {
        const isAvailable = await bridge.validateSelectedWindow(source.id);
        if (!isAvailable) {
          failure = {
            stage: 'validation',
            reason: 'The selected trading window is no longer available. Select a window again.'
          };
          throw new Error('The selected trading window is no longer available. Select a window again.');
        }

        stage = 'capture';
        const captureStart = performance.now();
        const shouldCaptureWindow = shouldCaptureWindowForPrivacy(settings.privacy);
        const capture = shouldCaptureWindow
          ? await bridge.captureWindowSource(source.id)
          : '';
        captureMs = shouldCaptureWindow ? Math.round(performance.now() - captureStart) : 0;
        setScreenshotDataUrl(shouldCaptureWindow ? capture : undefined);

        setRequestState('asking');
        stage = 'request-build';
        const requestBuildStart = performance.now();
        const requestDraft = {
          connection: settings.connection,
          question: questionText,
          screenshotDataUrl: capture,
          selectedWindow: source,
          memoryContext: {
            ...requestMemoryContextForHermes,
            personalRules: requestPersonalRuleContext
          },
          monitoringContext: monitoringSnapshot,
          privacy: settings.privacy
        };
        requestPrivacySummary = summarizePrivacyRequestPolicy(requestDraft);
        const request = buildPrivacyAwareAskHermesInput(requestDraft);
        requestBuildMs = Math.round(performance.now() - requestBuildStart);

        stage = 'hermes';
        const hermesStart = performance.now();
        const answer = await bridge.askHermes(request);
        hermesMs = Math.round(performance.now() - hermesStart);

        const responseText =
          requestLocalWarnings.length > 0 ? `Local risk guardrail: ${requestLocalWarnings.join(' ')}\n\n${answer}` : answer;
        setResponse(responseText);
        if (settings.voice.speakReplies && window.speechSynthesis) {
          speakResponse(responseText);
        }

        setLastRequestMonitoringMetadata(monitoringSnapshot);
        setLastRequestContext({
          id: requestId,
          question: questionText,
          response: responseText,
          selectedWindowId: source.id,
          selectedWindowName: source.name,
          selectedWindowKind: source.kind
        });
        setJournalSavedMessage('');
        setFeedbackNoteWarning(undefined);
        setFeedbackNoteText('');
        setEditingFeedbackId(undefined);
        setEditingFeedbackAction('followed-plan');
        setEditingFeedbackNotes('');
        setRequestMetrics({
          localRiskMs,
          ocrMs,
          requestBuildMs,
          captureMs,
          hermesMs,
          totalMs: Math.round(performance.now() - timingStarted)
        });
      } catch (nextError) {
        const errorMessage = readError(nextError);
        diagnosticError = errorMessage;

        if (!failure) {
          failure = {
            stage,
            reason: errorMessage
          };
        }

        if (/not available/.test(errorMessage) || /trading window/.test(errorMessage)) {
          setSettings((current) => ({
            ...current,
            pairedWindow: undefined
          }));
          setSelectedSource(undefined);
        }

        setError(errorMessage);
      } finally {
        const totalMs = Math.round(performance.now() - timingStarted);
        const diagnostic = createRequestDiagnostic({
          id: requestId,
          startedAt: requestStartedAt,
          completedAt: new Date().toISOString(),
          status: failure ? 'failure' : 'success',
          questionPreview: sanitizeQuestionPreview(questionText),
          selectedWindowName: source.name,
          selectedWindowId: source.id,
          selectedWindowKind: source.kind,
          connection: {
            connectionKind: settings.connection.connectionKind,
            endpointMode: settings.connection.endpointMode,
            baseUrl: settings.connection.baseUrl,
            modelId: settings.connection.modelId,
            resolvedEndpoint: resolveDebugEndpoint(settings.connection),
            resolvedAdapter: resolveDebugAdapter(settings.connection)
          },
          requestContext: {
            dataSharingScope: requestContext.scope,
            preset: settings.privacy.preset
          },
          request: {
            redactionEnabled: isTextRedactionEnabled,
            usedFallbackImage: settings.privacy.preset === 'maximum',
            ...(requestPrivacySummary ? { privacySummary: requestPrivacySummary } : {})
          },
          timings: {
            localRiskMs,
            ocrMs,
            requestBuildMs,
            captureMs,
            hermesMs,
            totalMs
          },
          connectionStatus: hermesHeartbeat.status === 'unknown' ? undefined : hermesHeartbeat.status,
          ...(failure ? { failure } : {}),
          ...(diagnosticError ? { debugNotes: diagnosticError } : {})
        });

        setRequestDiagnostics((current) => appendRequestDiagnostic(localStorage, diagnostic));
        setRequestState('idle');
      }
    },
    [
      bridge,
      loadSources,
      journalEntries,
      importedTradeRecords,
      walletTradeRecords,
      tradeDecisionEvents,
      tradeOutcomeEvents,
      monitorSignals,
      warningFeedbackEntries,
      settings.connection,
      settings.coachMode,
      settings.dataSharing,
      settings.friction.enabled,
      settings.friction.strictness,
      settings.personalRules,
      settings.privacy,
      settings.riskBudget,
      settings.voice.speakReplies,
      postmortemSummaries,
      isTextRedactionEnabled,
      hermesHeartbeat.status
    ]
  );

  useEffect(() => {
    askWithSourceRef.current = askWithSource;
  }, [askWithSource]);

  const askCoach = useCallback(async () => {
    if (!hasQuestion) {
      setError('Ask a question before sending a capture to Hermes.');
      return;
    }

    if (!selectedSource) {
      setError('Choose the trading window to inspect first.');
      setPickerMode('ask');
      void loadSources('ask');
      return;
    }

    const nextFrictionCard = buildFrictionCard({
      question,
      localWarnings,
      matchedPatternCount: memoryContext.matchedPatterns.length,
      frictionEnabled: settings.friction.enabled,
      frictionStrictness: settings.friction.strictness
    });
    const policyGate = buildCoachModePolicyGate({
      mode: settings.coachMode,
      policyWarnings: policyBlockingWarnings
    });

    if (policyGate.shouldBlock) {
      setPolicyCard({
        id: createRequestContextId(),
        question,
        warnings: localWarnings,
        blockers: policyGate.blockers
      });
      return;
    }

    if (nextFrictionCard) {
      setFrictionCard(nextFrictionCard);
      return;
    }

    await askWithSource(selectedSource, {});
  }, [
    askWithSource,
    hasQuestion,
    localWarnings,
    loadSources,
    policyBlockingWarnings,
    question,
    selectedSource,
    settings.coachMode,
    settings.friction.enabled,
    settings.friction.strictness
  ]);

  const testConnection = useCallback(async () => {
    if (!bridge) {
      setError('Hermes Coach must be run from the desktop add-on to test the connection.');
      return;
    }

    setTestingConnection(true);
    setCopiedReport(false);
    setError('');

    try {
      const report = await bridge.testHermesConnection(settings.connection);
      setConnectionReport(report);
      if ((report.status === 'connected' || report.status === 'degraded') && report.effectiveConnection) {
        setSettings((current) => ({
          ...current,
          connection: report.effectiveConnection ?? current.connection
        }));
      }
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setTestingConnection(false);
    }
  }, [bridge, settings.connection]);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    if (!settings.pairedWindow) {
      validatedPairRef.current = undefined;
      return;
    }

    if (validatedPairRef.current === settings.pairedWindow.id) {
      return;
    }

    const pairId = settings.pairedWindow.id;
    validatedPairRef.current = pairId;

    void (async () => {
      try {
        const isAvailable = await bridge.validateSelectedWindow(pairId);
        if (!isAvailable) {
          setSettings((current) => ({
            ...current,
            pairedWindow: undefined
          }));
          setSelectedSource(undefined);
          setError('Saved trading window is no longer available. Select it again.');
        }
      } catch {
        setError('Unable to verify saved trading window availability.');
      }
    })();
  }, [bridge, settings.pairedWindow]);

  const copyDebugReport = useCallback(async () => {
    if (!connectionReport) {
      return;
    }

    await navigator.clipboard.writeText(connectionReport.debugReport);
    setCopiedReport(true);
  }, [connectionReport]);

  const copyDiagnosticReport = useCallback(async (entry: HermesRequestDiagnostic) => {
    await navigator.clipboard.writeText(buildDiagnosticReport(entry));
    setCopiedDiagnosticId(entry.id);

    setTimeout(() => {
      setCopiedDiagnosticId((nextId) => (nextId === entry.id ? undefined : nextId));
    }, 2200);
  }, []);

  const clearDiagnosticsHistory = useCallback(() => {
    if (requestDiagnostics.length === 0) {
      return;
    }

    if (!confirmLocalDataAction('Clear local request diagnostics history?')) {
      return;
    }

    setRequestDiagnostics(clearRequestDiagnostics(localStorage));
  }, [requestDiagnostics.length]);

  const resetLocalSettingsToDefaults = useCallback(() => {
    if (!confirmLocalDataAction('Reset local settings to defaults? Journal, trade history, and diagnostics stay on this device.')) {
      return;
    }

    const nextSettings = clearLocalSettings(localStorage);
    setSettings(nextSettings);
    setSelectedSource(undefined);
    setScreenshotDataUrl(undefined);
    setConnectionReport(undefined);
    setError('');
    setJournalSavedMessage('Local settings reset to defaults.');
  }, []);

  const formatTiming = useCallback((value?: number): string => {
    return value === undefined ? 'n/a' : `${value}ms`;
  }, []);

  const buildJournalSourceContext = useCallback(() => {
    const tokenHint = journalSourceTokenHint.trim();
    if (journalSourceCategory === 'unknown' && journalSourceOutcome === 'unknown' && !tokenHint) {
      return undefined;
    }

    return {
      category: journalSourceCategory,
      outcome: journalSourceOutcome,
      ...(tokenHint ? { tokenHint } : {})
    };
  }, [journalSourceCategory, journalSourceOutcome, journalSourceTokenHint]);

  const resetSourceContextDraft = useCallback(() => {
    setJournalSourceCategory('unknown');
    setJournalSourceOutcome('unknown');
    setJournalSourceTokenHint('');
    sourceContextAutoFillRequestId.current = undefined;
  }, []);

  const applySourceContextFromFinding = useCallback(
    (finding: SourceQualityFinding | undefined, force = false) => {
      if (!finding) {
        return;
      }

      const hasManualCategory = journalSourceCategory !== 'unknown';
      const hasManualTokenHint = journalSourceTokenHint.trim().length > 0;

      if (!force && (hasManualCategory || hasManualTokenHint)) {
        return;
      }

      if (finding.category && (!hasManualCategory || force)) {
        setJournalSourceCategory(finding.category);
      }

      if (!hasManualTokenHint || force) {
        setJournalSourceTokenHint(finding.tokenHint ?? '');
      }
    },
    [journalSourceCategory, journalSourceTokenHint]
  );

  useEffect(() => {
    const requestId = lastRequestContext?.id;
    if (!requestId || sourceContextAutoFillRequestId.current === requestId) {
      return;
    }

    applySourceContextFromFinding(topSourceQualityFinding);
    sourceContextAutoFillRequestId.current = requestId;
    setTradeCardNoteText('');
  }, [applySourceContextFromFinding, lastRequestContext?.id, topSourceQualityFinding]);

  const saveJournalEntry = useCallback(() => {
    if (!selectedSource || !response) {
      setError('A coach response and selected window are required before saving to the journal.');
      return;
    }

    const entry = buildJournalEntry({
      question,
      response,
      notes: journalNotes,
      selectedWindow: selectedSource,
      screenshotCaptured: Boolean(screenshotDataUrl),
      monitoring: lastRequestMonitoringMetadata,
      sourceContext: buildJournalSourceContext()
    });
    const nextEntries = appendJournalEntry(localStorage, entry);
    setJournalEntries(nextEntries);
    setJournalSavedMessage('Saved to local journal.');
    setJournalNotes('');
    resetSourceContextDraft();
  }, [
    buildJournalSourceContext,
    journalNotes,
    lastRequestMonitoringMetadata,
    question,
    response,
    resetSourceContextDraft,
    screenshotDataUrl,
    selectedSource
  ]);

  const persistTradeCardDecision = useCallback(
    (action: TradeCardActionViewModel) => {
      if (!tradeCard) {
        return;
      }

      if (!selectedSource) {
        setError('A trading window is required before saving this trade-card decision.');
        return;
      }

      const note = tradeCardNoteText.trim();
      if (action.requiresNote && !note) {
        setError('Add an override note before recording an override.');
        return;
      }

      const entry = buildJournalEntry({
        question: lastRequestContext?.question ?? question.trim(),
        response: describeTradeCardDecision(action, tradeCard, note || undefined),
        notes: note,
        selectedWindow: selectedSource,
        screenshotCaptured: false,
        monitoring: lastRequestMonitoringMetadata,
        sourceContext: buildJournalSourceContext()
      });
      const nextEntries = appendJournalEntry(localStorage, entry);
      const decisionEvent = buildTradeDecisionEventFromTradeCardAction({
        signalId: entry.id,
        decidedAt: entry.createdAt,
        card: tradeCard,
        action,
        note: note || undefined
      });
      const nextDecisionEvents = appendTradeDecisionEvent(localStorage, decisionEvent);
      setJournalEntries(nextEntries);
      setTradeDecisionEvents(nextDecisionEvents);
      setJournalSavedMessage('Saved trade-card decision locally.');
      setTradeCardNoteText('');
      setError('');
      resetSourceContextDraft();
    },
    [
      buildJournalSourceContext,
      lastRequestContext?.question,
      lastRequestMonitoringMetadata,
      question,
      resetSourceContextDraft,
      selectedSource,
      tradeCard,
      tradeCardNoteText
    ]
  );

  const recordWarningFeedback = useCallback(
    (warningText: string, action: WarningFeedbackAction, notes?: string) => {
      if (!lastRequestContext) {
        setError('Answer context is missing; send a new trade check first.');
        return;
      }

      const nextEntries = appendWarningFeedback(localStorage, {
        warningText,
        action,
        question: lastRequestContext.question,
        response: lastRequestContext.response,
        selectedWindow: {
          id: lastRequestContext.selectedWindowId,
          name: lastRequestContext.selectedWindowName,
          kind: lastRequestContext.selectedWindowKind,
          thumbnailDataUrl: ''
        },
        requestId: lastRequestContext.id,
        notes
      });
      setWarningFeedbackEntries(nextEntries);
      setFeedbackNoteWarning(undefined);
      setFeedbackNoteText('');
      setError('');
      setJournalSavedMessage('Feedback logged.');
    },
    [lastRequestContext]
  );

  const saveAddNoteFeedback = useCallback(() => {
    if (!feedbackNoteWarning) {
      setFeedbackNoteWarning(undefined);
      return;
    }

    if (!feedbackNoteText.trim()) {
      setFeedbackNoteWarning(undefined);
      return;
    }

    recordWarningFeedback(feedbackNoteWarning, 'added-note', feedbackNoteText.trim());
  }, [feedbackNoteText, feedbackNoteWarning, recordWarningFeedback]);

  const beginEditFeedback = useCallback((entry: WarningFeedbackRecord) => {
    setEditingFeedbackId(entry.id);
    setEditingFeedbackAction(entry.action);
    setEditingFeedbackNotes(entry.notes ?? '');
    setFeedbackNoteWarning(undefined);
    setFeedbackNoteText('');
  }, []);

  const saveEditedFeedback = useCallback(() => {
    if (!editingFeedbackId) {
      return;
    }

    const nextEntries = updateWarningFeedback(localStorage, editingFeedbackId, {
      action: editingFeedbackAction,
      notes: editingFeedbackNotes
    });
    setWarningFeedbackEntries(nextEntries);
    setEditingFeedbackId(undefined);
    setEditingFeedbackNotes('');
    setEditingFeedbackAction('followed-plan');
  }, [editingFeedbackAction, editingFeedbackId, editingFeedbackNotes]);

  const deleteWarningFeedbackEntry = useCallback((entryId: string) => {
    if (!confirmLocalDataAction('Delete this local warning feedback record?')) {
      return;
    }

    const nextEntries = deleteWarningFeedback(localStorage, entryId);
    setWarningFeedbackEntries(nextEntries);
    if (editingFeedbackId === entryId) {
      setEditingFeedbackId(undefined);
      setEditingFeedbackAction('followed-plan');
      setEditingFeedbackNotes('');
    }
  }, [editingFeedbackId]);

  const postmortemOutcomeForEvent = useCallback(
    (eventId: string) => postmortemOutcomeRecords.find((record) => record.eventId === eventId),
    [postmortemOutcomeRecords]
  );
  const beginEditPostmortemOutcome = useCallback(
    (event: PostmortemTimelineEvent) => {
      const nextOutcome = postmortemOutcomeForEvent(event.id);
      setEditingPostmortemEventId(event.id);
      setEditingPostmortemOutcome(nextOutcome?.tag ?? 'followed-plan');
      setEditingPostmortemNotes(nextOutcome?.notes ?? '');
      setEditingPostmortemMistakeTags(nextOutcome?.mistakeTags?.join(', ') ?? '');
      setEditingPostmortemSetupQuality(nextOutcome?.setupQuality ?? 3);
      setEditingPostmortemSourceQuality(nextOutcome?.sourceQuality ?? 3);
      setEditingPostmortemSizingQuality(nextOutcome?.sizingQuality ?? 3);
      setEditingPostmortemEntryTimingQuality(nextOutcome?.entryTimingQuality ?? 3);
      setEditingPostmortemInvalidationQuality(nextOutcome?.invalidationQuality ?? 3);
      setEditingPostmortemMaxLossPercent(nextOutcome?.maxLossPercent !== undefined ? String(nextOutcome.maxLossPercent) : '');
      setEditingPostmortemLessonLearned(nextOutcome?.lessonLearned ?? '');
    },
    [postmortemOutcomeForEvent]
  );

  const savePostmortemOutcome = useCallback(() => {
    if (!postmortemSession || !editingPostmortemEventId) {
      return;
    }

    const timelineEvent = postmortemSession.timeline.find((entry) => entry.id === editingPostmortemEventId);
    if (!timelineEvent) {
      setEditingPostmortemEventId(undefined);
      setEditingPostmortemNotes('');
      setEditingPostmortemOutcome('followed-plan');
      return;
    }

    const existingOutcome = postmortemOutcomeForEvent(editingPostmortemEventId);
    const notes = editingPostmortemNotes.trim();
    const mistakeTags = editingPostmortemMistakeTags
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const maxLossPercent = Number(editingPostmortemMaxLossPercent);
    const lessonLearned = editingPostmortemLessonLearned.trim();

    const nextOutcomeRecords = existingOutcome
      ? updatePostmortemOutcomeRecord(localStorage, existingOutcome.id, {
          tag: editingPostmortemOutcome,
          notes,
          mistakeTags,
          setupQuality: editingPostmortemSetupQuality,
          sourceQuality: editingPostmortemSourceQuality,
          sizingQuality: editingPostmortemSizingQuality,
          entryTimingQuality: editingPostmortemEntryTimingQuality,
          invalidationQuality: editingPostmortemInvalidationQuality,
          ...(Number.isFinite(maxLossPercent) ? { maxLossPercent } : {}),
          ...(lessonLearned ? { lessonLearned } : {})
        })
      : appendPostmortemOutcomeRecord(localStorage, {
          eventId: timelineEvent.id,
          tag: editingPostmortemOutcome,
          ...(notes ? { notes } : {}),
          ...(mistakeTags.length > 0 ? { mistakeTags } : {}),
          setupQuality: editingPostmortemSetupQuality,
          sourceQuality: editingPostmortemSourceQuality,
          sizingQuality: editingPostmortemSizingQuality,
          entryTimingQuality: editingPostmortemEntryTimingQuality,
          invalidationQuality: editingPostmortemInvalidationQuality,
          ...(Number.isFinite(maxLossPercent) ? { maxLossPercent } : {}),
          ...(lessonLearned ? { lessonLearned } : {}),
          ...(timelineEvent.requestId ? { requestId: timelineEvent.requestId } : {})
        });

    setPostmortemOutcomeRecords(nextOutcomeRecords);
    const savedOutcome = nextOutcomeRecords.find((record) => record.eventId === timelineEvent.id);
    if (savedOutcome) {
      const nextTradeOutcomeEvents = appendTradeOutcomeEvent(
        localStorage,
        buildTradeOutcomeEventFromPostmortemOutcome({
          signalId: timelineEvent.requestId ?? timelineEvent.id,
          closedAt: savedOutcome.updatedAt ?? savedOutcome.createdAt,
          postmortem: savedOutcome
        })
      );
      setTradeOutcomeEvents(nextTradeOutcomeEvents);
    }
    setEditingPostmortemEventId(undefined);
    setEditingPostmortemNotes('');
    setEditingPostmortemMistakeTags('');
    setEditingPostmortemSetupQuality(3);
    setEditingPostmortemSourceQuality(3);
    setEditingPostmortemSizingQuality(3);
    setEditingPostmortemEntryTimingQuality(3);
    setEditingPostmortemInvalidationQuality(3);
    setEditingPostmortemMaxLossPercent('');
    setEditingPostmortemLessonLearned('');
    setEditingPostmortemOutcome('followed-plan');
  }, [
    editingPostmortemEntryTimingQuality,
    editingPostmortemEventId,
    editingPostmortemInvalidationQuality,
    editingPostmortemLessonLearned,
    editingPostmortemMaxLossPercent,
    editingPostmortemMistakeTags,
    editingPostmortemNotes,
    editingPostmortemOutcome,
    editingPostmortemSetupQuality,
    editingPostmortemSizingQuality,
    editingPostmortemSourceQuality,
    postmortemOutcomeForEvent,
    postmortemSession
  ]);

  const clearPostmortemEditing = useCallback(() => {
    setEditingPostmortemEventId(undefined);
    setEditingPostmortemNotes('');
    setEditingPostmortemMistakeTags('');
    setEditingPostmortemSetupQuality(3);
    setEditingPostmortemSourceQuality(3);
    setEditingPostmortemSizingQuality(3);
    setEditingPostmortemEntryTimingQuality(3);
    setEditingPostmortemInvalidationQuality(3);
    setEditingPostmortemMaxLossPercent('');
    setEditingPostmortemLessonLearned('');
    setEditingPostmortemOutcome('followed-plan');
  }, []);

  const deletePostmortemOutcome = useCallback(
    (outcomeId: string) => {
      if (!confirmLocalDataAction('Clear this local postmortem outcome?')) {
        return;
      }

      const nextOutcomeRecords = deletePostmortemOutcomeRecord(localStorage, outcomeId);
      setPostmortemOutcomeRecords(nextOutcomeRecords);
      if (editingPostmortemEventId) {
        const editingOutcome = nextOutcomeRecords.find((record) => record.eventId === editingPostmortemEventId);
        if (!editingOutcome) {
          clearPostmortemEditing();
        }
      }
  }, [clearPostmortemEditing, editingPostmortemEventId]);

  useEffect(() => {
    if (!editingPostmortemEventId) {
      return;
    }

    if (!postmortemSession) {
      clearPostmortemEditing();
      return;
    }

    const stillPresent = postmortemSession.timeline.some((entry) => entry.id === editingPostmortemEventId);
    if (!stillPresent) {
      clearPostmortemEditing();
      return;
    }

    const outcome = postmortemOutcomeForEvent(editingPostmortemEventId);
    if (outcome) {
      setEditingPostmortemOutcome(outcome.tag);
      setEditingPostmortemNotes(outcome.notes ?? '');
      setEditingPostmortemMistakeTags(outcome.mistakeTags?.join(', ') ?? '');
      setEditingPostmortemSetupQuality(outcome.setupQuality ?? 3);
      setEditingPostmortemSourceQuality(outcome.sourceQuality ?? 3);
      setEditingPostmortemSizingQuality(outcome.sizingQuality ?? 3);
      setEditingPostmortemEntryTimingQuality(outcome.entryTimingQuality ?? 3);
      setEditingPostmortemInvalidationQuality(outcome.invalidationQuality ?? 3);
      setEditingPostmortemMaxLossPercent(outcome.maxLossPercent !== undefined ? String(outcome.maxLossPercent) : '');
      setEditingPostmortemLessonLearned(outcome.lessonLearned ?? '');
      return;
    }

    setEditingPostmortemOutcome('followed-plan');
    setEditingPostmortemNotes('');
    setEditingPostmortemMistakeTags('');
    setEditingPostmortemSetupQuality(3);
    setEditingPostmortemSourceQuality(3);
    setEditingPostmortemSizingQuality(3);
    setEditingPostmortemEntryTimingQuality(3);
    setEditingPostmortemInvalidationQuality(3);
    setEditingPostmortemMaxLossPercent('');
    setEditingPostmortemLessonLearned('');
  }, [editingPostmortemEventId, clearPostmortemEditing, postmortemOutcomeForEvent, postmortemSession]);

  const savePostmortemSummary = useCallback(() => {
    if (!postmortemSession) {
      return;
    }

    const nextSummaries = appendPostmortemSummary(
      localStorage,
      buildCompactPostmortemSummary(postmortemSession, postmortemOutcomeRecords)
    );
    setPostmortemSummaries(nextSummaries);
    setPostmortemSummaryMessage(`Saved summary for ${postmortemSession.label}`);
    setTimeout(() => {
      setPostmortemSummaryMessage('');
    }, 2200);
  }, [postmortemOutcomeRecords, postmortemSession]);

  const importTradeCsvRecords = useCallback(() => {
    const raw = tradeCsvInput.trim();
    if (!raw) {
      setTradeCsvMessage('Paste CSV text before importing.');
      return;
    }

    const nextRecords = replaceImportedTradeRecordsFromCsv(localStorage, raw, 'csv');
    setImportedTradeRecords(nextRecords);
    setTradeCsvMessage(
      nextRecords.length > 0
        ? `Imported ${nextRecords.length} trade record${nextRecords.length === 1 ? '' : 's'} from CSV.`
        : 'No valid trade rows detected. Check CSV headers (timestamp/date + size/amount/unit and optional pnl_percent).'
    );
  }, [tradeCsvInput]);

  const clearImportedTradeRecords = useCallback(() => {
    if (importedTradeRecords.length === 0) {
      setTradeCsvMessage('No imported trade-history records to clear.');
      return;
    }

    if (!confirmLocalDataAction('Clear imported CSV trade-history records?')) {
      return;
    }

    const nextRecords = writeImportedTradeRecords(localStorage, []);
    setImportedTradeRecords(nextRecords);
    setTradeCsvMessage('Cleared imported trade-history records.');
  }, [importedTradeRecords.length]);

  const syncObservedWalletHistory = useCallback(
    async (source: 'manual' | 'background' = 'background') => {
      const observedAddresses = settings.dataSharing.observedWalletAddresses
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 12);

      if (observedAddresses.length === 0) {
        setWalletSyncState({
          status: 'idle',
          detail: 'Add at least one public wallet address to enable sync.',
          providerStatuses: []
        });
        const nextRecords = writeWalletTradeRecords(localStorage, []);
        setWalletTradeRecords(nextRecords);
        return;
      }

      if (walletSyncInFlight.current) {
        return;
      }

      walletSyncInFlight.current = true;
      setWalletSyncState((current) => ({
        ...current,
        status: 'syncing',
        detail: source === 'manual' ? 'Syncing wallet history...' : 'Refreshing wallet history...'
      }));

      try {
        const result = await syncWalletTradeRecords({
          addresses: observedAddresses
        });
        const nextRecords = writeWalletTradeRecords(localStorage, result.records);
        setWalletTradeRecords(nextRecords);

        const errors = result.statuses.filter((entry) => entry.status === 'error').length;
        const unsupported = result.statuses.filter((entry) => entry.status === 'unsupported').length;
        const status: WalletSyncState['status'] = errors > 0 ? 'error' : 'ready';
        const detailParts = [
          `${nextRecords.length} local wallet trade record${nextRecords.length === 1 ? '' : 's'}`
        ];

        if (unsupported > 0) {
          detailParts.push(`${unsupported} unsupported address format${unsupported === 1 ? '' : 's'}`);
        }
        if (errors > 0) {
          detailParts.push(`${errors} sync error${errors === 1 ? '' : 's'}`);
        }

        setWalletSyncState({
          status,
          lastSyncedAt: result.fetchedAt,
          detail: detailParts.join(' · '),
          providerStatuses: result.statuses
        });
      } catch (nextError) {
        setWalletSyncState((current) => ({
          ...current,
          status: 'error',
          detail: readError(nextError)
        }));
      } finally {
        walletSyncInFlight.current = false;
      }
    },
    [settings.dataSharing.observedWalletAddresses]
  );

  useEffect(() => {
    if (!settings.dataSharing.useLocalTradeHistoryForRiskChecks) {
      return undefined;
    }

    const hasWalletsConfigured = settings.dataSharing.observedWalletAddresses.some((entry) => entry.trim().length > 0);
    if (!hasWalletsConfigured) {
      void syncObservedWalletHistory('background');
      return undefined;
    }

    void syncObservedWalletHistory('background');
    const interval = window.setInterval(() => {
      void syncObservedWalletHistory('background');
    }, WALLET_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    settings.dataSharing.observedWalletAddresses,
    settings.dataSharing.useLocalTradeHistoryForRiskChecks,
    syncObservedWalletHistory
  ]);

  const persistPreTradeDecision = useCallback(
    (
      actionLabel: string,
      note: string | undefined,
      source: 'friction' | 'policy',
      policyOverrideBlockers: string[] = [],
      context?: {
        question?: string;
        localWarnings?: string[];
      }
    ) => {
      if (!selectedSource) {
        setError('A trading window is required before saving this decision.');
        return;
      }

      const questionContext = (context?.question ?? question).trim();
      const notes = note?.trim() || '';
      if (source === 'policy' && policyOverrideBlockers.length > 0 && !notes) {
        setError('Add an override note before sending through a policy block.');
        return;
      }
      const response = buildFrictionDecision(actionLabel, notes);
      const warningContext = context?.localWarnings ?? localWarnings;

      const entry = buildJournalEntry({
        question: questionContext,
        response,
        notes,
        selectedWindow: selectedSource,
        screenshotCaptured: false,
        monitoring: buildMonitoringMetadata(
          warningContext,
          monitorSignals,
          sourceQualityAssessment.findings,
          localWarningEvidence
        ),
        sourceContext: buildJournalSourceContext()
      });

      const nextEntries = appendJournalEntry(localStorage, {
        ...entry,
        notes
      });
      setJournalEntries(nextEntries);
      if (source === 'policy' && policyOverrideBlockers.length > 0) {
        const nextFeedbackEntries = appendWarningFeedback(localStorage, {
          warningText: 'Policy override',
          action: 'took-it-anyway',
          question: questionContext,
          response,
          selectedWindow: selectedSource,
          requestId: entry.id,
          notes,
          policyOverride: {
            required: true,
            blockers: policyOverrideBlockers,
            overrideNote: notes,
            auditSource: 'policy-card'
          }
        });
        setWarningFeedbackEntries(nextFeedbackEntries);
      }
      setJournalSavedMessage('Saved to local journal.');
      if (source === 'friction') {
        setFrictionCard(undefined);
        setFrictionNoteText('');
      } else {
        setPolicyCard(undefined);
        setPolicyNoteText('');
      }
      resetSourceContextDraft();
    },
    [
      buildJournalSourceContext,
      localWarnings,
      localWarningEvidence,
      monitorSignals,
      question,
      resetSourceContextDraft,
      selectedSource,
      sourceQualityAssessment.findings
    ]
  );

  const persistFrictionJournalAction = useCallback(
    (actionLabel: string, note?: string) => {
      persistPreTradeDecision(actionLabel, note, 'friction');
    },
    [persistPreTradeDecision]
  );

  const persistPolicyDecision = useCallback(
    (actionLabel: string, note?: string) => {
      persistPreTradeDecision(actionLabel, note, 'policy', policyCard?.blockers ?? [], {
        question: policyCard?.question,
        localWarnings: policyCard?.warnings
      });
    },
    [persistPreTradeDecision, policyCard?.blockers, policyCard?.question, policyCard?.warnings]
  );

  const proceedWithFrictionAction = useCallback(
    (actionLabel: string, selected: WindowSourceOption, shouldAsk = false) => {
      setError('');
      setFrictionCard(undefined);
      persistFrictionJournalAction(actionLabel, frictionNoteText.trim() || undefined);
      setFrictionNoteText('');

      if (shouldAsk) {
        void askWithSource(selected, { skipFrictionCheck: true });
        setJournalSavedMessage('');
        return;
      }
    },
    [askWithSource, frictionNoteText, persistFrictionJournalAction]
  );

  const clearFrictionCard = useCallback(() => {
    setFrictionCard(undefined);
    setFrictionNoteText('');
  }, []);

  const clearPolicyCard = useCallback(() => {
    setPolicyCard(undefined);
    setPolicyNoteText('');
  }, []);

  const clearPolicyAndError = useCallback(() => {
    setError('Trade blocked by policy without override.');
    setPolicyCard(undefined);
    setPolicyNoteText('');
  }, []);

  const proceedWithPolicyOverride = useCallback(
    (selected: WindowSourceOption) => {
      if (!policyNoteText.trim()) {
        setError('Add an override note before sending through a policy block.');
        return;
      }
      setError('');
      persistPolicyDecision('Policy override', policyNoteText.trim() || undefined);
      setPolicyNoteText('');
      void askWithSource(selected, { skipPolicyCheck: true, skipFrictionCheck: true }, policyCard?.question);
    },
    [askWithSource, persistPolicyDecision, policyCard?.question, policyNoteText]
  );

  const statusText = useMemo(() => {
    switch (requestState) {
      case 'loading-sources':
        return 'Reading available windows';
      case 'capturing':
        return 'Capturing selected window';
      case 'asking':
        return 'Sending context to Hermes';
      default:
        const voiceText = isVoiceListening
          ? 'Voice listening'
          : isSpeechSpeaking
            ? 'Voice speaking'
            : settings.voice.enabled
              ? 'Voice ready'
              : 'Voice off';

        return `${settings.armed ? 'Armed' : 'Paused'} • ${selectedSource ? 'Ready' : 'Window selection required'} • ${voiceText}`;
    }
  }, [isSpeechSpeaking, isVoiceListening, requestState, selectedSource, settings.armed, settings.voice.enabled]);

  const hermesStatusText = useMemo(() => {
    switch (hermesHeartbeat.status) {
      case 'connected':
        return 'Hermes check-in: connected';
      case 'degraded':
        return 'Hermes check-in: degraded';
      case 'disconnected':
        return 'Hermes check-in: disconnected';
      case 'auth-error':
        return 'Hermes check-in: auth issue';
      case 'model-error':
        return 'Hermes check-in: gateway route issue';
      case 'incompatible':
        return 'Hermes check-in: incompatible';
      default:
        return 'Hermes check-in: checking...';
    }
  }, [hermesHeartbeat.status]);

  const clearMonitorSignals = useCallback(() => {
    setMonitorSignals([]);
  }, []);

  const clearLocalMemory = useCallback(() => {
    if (journalEntries.length === 0 && warningFeedbackEntries.length === 0) {
      setJournalSavedMessage('No local memory records to clear.');
      return;
    }

    if (!confirmLocalDataAction('Clear local journal notes and warning feedback records?')) {
      return;
    }

    setJournalEntries(clearJournalEntries(localStorage));
    setWarningFeedbackEntries(clearWarningFeedbackEntries(localStorage));
    setLastRequestMonitoringMetadata(undefined);
    setLastRequestContext(undefined);
    setFeedbackNoteWarning(undefined);
    setFeedbackNoteText('');
    setEditingFeedbackId(undefined);
    setEditingFeedbackAction('followed-plan');
    setEditingFeedbackNotes('');
    setFrictionCard(undefined);
    setFrictionNoteText('');
    setJournalSavedMessage('Local memory cleared.');
    setError('');
  }, [journalEntries.length, warningFeedbackEntries.length]);

  const dismissMonitorSignal = useCallback((signal: MonitoringSignal) => {
    setMonitorSignals((current) =>
      current.filter((entry) => !isSameMonitoringSignal(entry, signal))
    );
  }, []);

  const isSameMonitoringSignal = useCallback((left: MonitoringSignal, right: MonitoringSignal): boolean => {
    return left.kind === right.kind && left.source === right.source && left.value === right.value && left.detectedAt === right.detectedAt;
  }, []);

  const appendSignalToQuestion = useCallback(
    (signal: MonitoringSignal) => {
      const tokenHint = signal.value.trim();
      if (!tokenHint) {
        return;
      }

      setQuestion((current) => {
        const trimmed = current.trim();
        if (trimmed.includes(tokenHint)) {
          return current;
        }

        const nextLine = trimmed.length > 0 ? `${trimmed}\n` : '';
        return `${nextLine}Candidate detected: ${tokenHint}`;
      });
      dismissMonitorSignal(signal);
    },
    [dismissMonitorSignal]
  );

  const runHermesHeartbeat = useCallback(async () => {
    if (heartbeatInFlightRef.current) {
      return;
    }

    if (!bridge) {
      return;
    }

    heartbeatInFlightRef.current = true;
    setIsCheckingHermes(true);
    try {
      const report = await bridge.testHermesConnection(settings.connection);
      setHermesHeartbeat({
        status: report.status,
        checkedAt: new Date().toISOString(),
        summary: report.summary,
        textCapable: report.textCapable,
        imageCapable: report.imageCapable
      });
      return;
    } catch (nextError) {
      setHermesHeartbeat({
        status: 'disconnected',
        checkedAt: new Date().toISOString(),
        summary: readError(nextError),
        textCapable: false,
        imageCapable: false
      });
    } finally {
      heartbeatInFlightRef.current = false;
      setIsCheckingHermes(false);
    }
  }, [bridge, settings.connection]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    void runHermesHeartbeat();
    const timer = setInterval(() => {
      void runHermesHeartbeat();
    }, HERMES_HEALTH_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [bridge, runHermesHeartbeat]);

  const onSelectSource = useCallback(
    (source: WindowSourceOption) => {
      const nextSource = {
        ...source
      };
      setSelectedSource(nextSource);
      setSettings((current) => ({
        ...current,
        pairedWindow: {
          id: nextSource.id,
          name: nextSource.name,
          kind: nextSource.kind
        }
      }));
      setError('');
      setPickerOpen(false);

      if (pickerMode === 'ask') {
        const nextFrictionCard = buildFrictionCard({
          question,
          localWarnings,
          matchedPatternCount: memoryContext.matchedPatterns.length,
          frictionEnabled: settings.friction.enabled,
          frictionStrictness: settings.friction.strictness
        });

        if (nextFrictionCard) {
          setFrictionCard(nextFrictionCard);
          return;
        }

        void askWithSource(nextSource, {});
      }
    },
    [
      askWithSource,
      memoryContext.matchedPatterns.length,
      localWarnings,
      pickerMode,
      question,
      settings.friction.enabled,
      settings.friction.strictness
    ]
  );

  const toggleArmed = useCallback(() => {
    const nextArmed = !settings.armed;
    setSettings((current) => ({
      ...current,
      armed: nextArmed
    }));
    void bridge?.setArmedMode(nextArmed);
  }, [bridge, settings.armed]);

  useEffect(() => {
    setSelectedSource((current) => {
      if (!settings.pairedWindow) {
        return undefined;
      }

      if (current?.id === settings.pairedWindow.id) {
        return {
          ...current,
          ...settings.pairedWindow,
          thumbnailDataUrl: current.thumbnailDataUrl || ''
        };
      }

      return {
        ...settings.pairedWindow,
        thumbnailDataUrl: ''
      };
    });
  }, [settings.pairedWindow]);

  const completeFirstRunSetup = useCallback(() => {
    setSettings((current) => ({
      ...current,
      setup: {
        ...current.setup,
        completedAt: new Date().toISOString()
      }
    }));
    setError('');
  }, []);

  if (!settings.setup.completedAt) {
    return (
      <FirstRunWizard
        bridge={bridge}
        settings={settings}
        onSettingsChange={setSettings}
        onComplete={completeFirstRunSetup}
      />
    );
  }

  const policyBlockUi = policyCard
    ? buildPolicyBlockUiCopy({
        blockerCount: policyCard.blockers.length,
        overrideNote: policyNoteText
      })
    : undefined;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Hermes Coach</h1>
          <p>Risk and execution coach</p>
        </div>
        <span className="status" role="status" aria-live="polite" aria-atomic="true">
          {statusText}
        </span>
      </header>
      <section className="control-strip compact-strip" aria-label="Hermes check-in status">
        <div role="status" aria-live="polite" aria-atomic="true">
          <span className="label">Hermes gateway</span>
          <strong>{hermesStatusText}</strong>
          <small>{hermesHeartbeat.summary ?? 'No check yet.'}</small>
        </div>
        <button
          type="button"
          onClick={() => {
            void runHermesHeartbeat();
          }}
          disabled={isCheckingHermes}
        >
          {isCheckingHermes ? 'Checking...' : hermesHeartbeat.checkedAt ? 'Recheck' : 'Check now'}
        </button>
      </section>

      <section className="control-strip" aria-label="Monitoring state">
        <div>
          <span className="label">Coach state</span>
          <strong>{settings.armed ? 'Armed' : 'Paused'}</strong>
        </div>
        <button type="button" onClick={toggleArmed}>
          {settings.armed ? 'Disarm' : 'Arm'}
        </button>
      </section>

      <section className="control-strip control-strip--multi" aria-label="Trading window selection">
        <div>
          <span className="label">Capture target</span>
          <strong>{selectedLabel}</strong>
        </div>
        <button type="button" onClick={() => loadSources('pair')} disabled={requestState !== 'idle'}>
          Select
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setSettings((current) => ({
              ...current,
              pairedWindow: undefined
            }));
            setSelectedSource(undefined);
          }}
          disabled={requestState !== 'idle' || !selectedSource}
        >
          Unpair
        </button>
      </section>

      <section className={`message session-risk-status ${sessionRiskStatusClass}`} aria-label="Session risk budget status">
        <span className="label">Session risk status</span>
        <div className="session-risk-grid">
          <div>
            <strong>Trades today</strong>
            <p>{sessionRiskTradeText}</p>
          </div>
          <div>
            <strong>Loss usage</strong>
            <p>{sessionRiskLossText}</p>
          </div>
          <div>
            <strong>Cooldown</strong>
            <p>
              {sessionRiskAssessment.status.cooldownMinutesLeft === undefined
                ? 'N/A'
                : `${Math.max(0, Math.ceil(sessionRiskAssessment.status.cooldownMinutesLeft))} min left`}
            </p>
          </div>
          <div>
            <strong>Tilt sensitivity</strong>
            <p>{sessionRiskAssessment.status.tiltSensitivity}</p>
          </div>
        </div>
        {sessionRiskAssessment.status.candidateSize ? (
          <p className="session-risk-note">
            Candidate size: {sessionRiskAssessment.status.candidateSize} · Session median: {sessionRiskAssessment.status.medianSize ?? 'unknown'}
          </p>
        ) : null}
        <small className="session-risk-note">
          {sessionRiskSignalSummary}
        </small>
      </section>

      <section className="settings-panel" aria-label="Local settings">
        <div className="section-heading compact">
          <h2>Local settings</h2>
          <button type="button" className="ghost" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? 'Hide' : 'Show'}
          </button>
        </div>
        {settingsOpen ? (
          <div className="settings-grid">
            <label htmlFor="connection-kind">Hermes gateway</label>
            <select
              id="connection-kind"
              value={settings.connection.connectionKind}
              onChange={(event) => {
                const connectionKind = event.target.value as HermesConnectionKind;
                setHostedTokenDraft('');
                setHostedTokenMessage('');
                updateConnection({
                  connectionKind,
                  ...(connectionKind === 'local' ? {} : { bearerToken: '' })
                });
              }}
            >
              <option value="local">Local gateway</option>
              <option value="hosted">Hosted gateway</option>
              <option value="custom">Custom gateway</option>
            </select>

            <small className="subtle-note settings-wide">
              DocHermes connects to the Hermes gateway only. Configure all agent routing inside Hermes.
            </small>

            <label htmlFor="gateway">Gateway URL</label>
            <input
              id="gateway"
              value={settings.connection.baseUrl}
              onChange={(event) =>
                updateConnection({
                  baseUrl: event.target.value
                })
              }
              spellCheck={false}
            />

            <label htmlFor="bearer-token">{usesSecureHostedTokenStore ? 'Hosted bearer token' : 'Bearer token'}</label>
            <input
              id="bearer-token"
              type="password"
              value={usesSecureHostedTokenStore ? hostedTokenDraft : settings.connection.bearerToken}
              placeholder={
                usesSecureHostedTokenStore
                  ? hostedTokenStatus?.hasToken
                    ? 'Saved securely. Enter a new token to replace it.'
                    : 'Enter a token, then save it securely'
                  : settings.connection.connectionKind === 'custom'
                    ? 'Session-only for custom gateways in this beta'
                    : 'Only if your local Hermes gateway requires one'
              }
              onChange={(event) => {
                if (usesSecureHostedTokenStore) {
                  setHostedTokenDraft(event.target.value);
                  setHostedTokenMessage('');
                  return;
                }

                updateConnection({
                  bearerToken: event.target.value
                });
              }}
              spellCheck={false}
            />

            {usesSecureHostedTokenStore ? (
              <div className={`token-storage-card ${hostedTokenStatus?.available ? 'available' : 'unavailable'} settings-wide`}>
                <div>
                  <span className="label">Token storage</span>
                  <strong>{hostedTokenStatusText.title}</strong>
                  <small>{hostedTokenStatusText.detail}</small>
                  {hostedTokenMessage ? <small>{hostedTokenMessage}</small> : null}
                </div>
                <div className="button-row">
                  <button type="button" onClick={saveHostedToken} disabled={hostedTokenBusy || !hostedTokenDraft.trim()}>
                    {hostedTokenBusy ? 'Saving...' : 'Save token'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={clearHostedToken}
                    disabled={
                      hostedTokenBusy ||
                      (!hostedTokenStatus?.hasToken &&
                        !settings.connection.bearerToken &&
                        hostedTokenStatus?.reason !== 'corrupt-token-store')
                    }
                  >
                    Clear token
                  </button>
                </div>
              </div>
            ) : null}

            <div className="button-row settings-wide">
              <button type="button" onClick={testConnection} disabled={testingConnection}>
                {testingConnection ? 'Testing...' : 'Test gateway'}
              </button>
            </div>
            {connectionReport ? (
              <div
                className={`connection-report ${connectionReport.status} settings-wide`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <strong>{connectionReport.summary}</strong>
                <small>
                  Status: {connectionReport.status}
                  {connectionReport.activeAdapter ? ` / ${connectionReport.activeAdapter}` : ''}
                </small>
                <div className="capability-row">
                  <span>{connectionReport.textCapable ? 'Text route OK' : 'Text route failed'}</span>
                  <span>{connectionReport.imageCapable ? 'Image route OK' : 'Image route failed'}</span>
                  <span>
                    {connectionReport.models.length > 0
                      ? `${connectionReport.models.length} discovered route/profile${connectionReport.models.length === 1 ? '' : 's'}`
                      : 'Route discovery unknown'}
                  </span>
                </div>
                <textarea readOnly value={connectionReport.debugReport} aria-label="Copyable Hermes gateway debug report" />
                <button type="button" onClick={copyDebugReport}>
                  {copiedReport ? 'Copied' : 'Copy debug report'}
                </button>
              </div>
            ) : null}

            <details className="advanced-settings settings-wide">
              <summary>Advanced gateway compatibility</summary>
              <div className="settings-grid nested-settings-grid">
                <label htmlFor="endpoint-mode">Adapter mode</label>
                <select
                  id="endpoint-mode"
                  value={settings.connection.endpointMode}
                  onChange={(event) =>
                    updateConnection({
                      endpointMode: event.target.value as HermesEndpointMode
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="openai-chat">Hermes API server</option>
                  <option value="legacy-coach">Legacy /coach</option>
                  <option value="custom">Exact custom endpoint</option>
                </select>

                <label htmlFor="gateway-route-profile">Route/profile token</label>
                <input
                  id="gateway-route-profile"
                  value={settings.connection.modelId}
                  onChange={(event) =>
                    updateConnection({
                      modelId: event.target.value
                    })
                  }
                  spellCheck={false}
                />
                <small className="subtle-note settings-wide">
                  This is a compatibility token for gateways that require an OpenAI-style model field. The active provider and
                  model still live in Hermes.
                </small>
              </div>
            </details>
            <div className={`privacy-indicator ${connectionScope.className}`}>
              <span className="label">Data-sharing scope</span>
              <strong>{connectionScope.title}</strong>
              <small>{connectionScope.description}</small>
            </div>
            <div className="privacy-indicator scope-local local-data-controls">
              <span className="label">Local data on this device</span>
              <strong>
                {journalEntries.length} journal · {warningFeedbackEntries.length} feedback · {importedTradeRecords.length} imported ·{' '}
                {walletTradeRecords.length} wallet · {requestDiagnostics.length} diagnostics
              </strong>
              <ul className="warning-list">
                {LOCAL_DATA_CATEGORIES.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
              <small>
                These controls only affect data in this local browser profile. They do not delete data from Hermes, wallets,
                exchanges, or remote services.
              </small>
              <div className="button-row">
                <button type="button" className="ghost" onClick={resetLocalSettingsToDefaults}>
                  Reset local settings
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={clearLocalMemory}
                  disabled={journalEntries.length === 0 && warningFeedbackEntries.length === 0}
                >
                  Clear journal + feedback
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={clearDiagnosticsHistory}
                  disabled={requestDiagnostics.length === 0}
                >
                  Clear diagnostics
                </button>
              </div>
            </div>

            <label htmlFor="privacy-preset">Privacy preset</label>
            <select
              id="privacy-preset"
              value={settings.privacy.preset}
              onChange={(event) => {
                setSettings((current) => ({
                  ...current,
                  privacy: {
                    ...current.privacy,
                    preset: event.target.value as LocalSettings['privacy']['preset']
                  }
                }));
              }}
            >
              <option value="maximum">Maximum (placeholder only; no title, memory, or monitoring)</option>
              <option value="balanced">Balanced (window + summaries)</option>
              <option value="full">Full context (full window)</option>
            </select>

            <label className="check-row" htmlFor="redact-addresses">
              <input
                id="redact-addresses"
                type="checkbox"
                checked={isMaximumPrivacy || settings.privacy.redaction.redactAddresses}
                disabled={isMaximumPrivacy}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      redaction: {
                        ...current.privacy.redaction,
                        redactAddresses: event.target.checked
                      }
                    }
                  }))
                }
              />
              <span>Redact wallet/token addresses</span>
            </label>

            <label className="check-row" htmlFor="redact-usernames">
              <input
                id="redact-usernames"
                type="checkbox"
                checked={isMaximumPrivacy || settings.privacy.redaction.redactUsernames}
                disabled={isMaximumPrivacy}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      redaction: {
                        ...current.privacy.redaction,
                        redactUsernames: event.target.checked
                      }
                    }
                  }))
                }
              />
              <span>Redact usernames</span>
            </label>

            <label className="check-row" htmlFor="redact-balances">
              <input
                id="redact-balances"
                type="checkbox"
                checked={isMaximumPrivacy || settings.privacy.redaction.redactBalances}
                disabled={isMaximumPrivacy}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      redaction: {
                        ...current.privacy.redaction,
                        redactBalances: event.target.checked
                      }
                    }
                  }))
                }
              />
              <span>Redact balances</span>
            </label>

            <label className="check-row" htmlFor="redact-amounts">
              <input
                id="redact-amounts"
                type="checkbox"
                checked={isMaximumPrivacy || settings.privacy.redaction.redactAmounts}
                disabled={isMaximumPrivacy}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      redaction: {
                        ...current.privacy.redaction,
                        redactAmounts: event.target.checked
                      }
                    }
                  }))
                }
              />
              <span>Redact amounts and token values</span>
            </label>

            {isMaximumPrivacy ? (
              <small className="subtle-note">
                Maximum privacy sends placeholder screenshot/window metadata and withholds memory and monitoring from Hermes.
              </small>
            ) : null}

            <label className="check-row" htmlFor="use-local-history">
              <input
                id="use-local-history"
                type="checkbox"
                checked={settings.dataSharing.useLocalTradeHistoryForRiskChecks}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    dataSharing: {
                      ...current.dataSharing,
                      useLocalTradeHistoryForRiskChecks: event.target.checked
                    }
                  }))
                }
              />
              <span>Use local trade history for risk checks</span>
            </label>

            <label className="check-row" htmlFor="send-compact-history">
              <input
                id="send-compact-history"
                type="checkbox"
                checked={settings.dataSharing.sendCompactTradeSummaryToHermes}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    dataSharing: {
                      ...current.dataSharing,
                      sendCompactTradeSummaryToHermes: event.target.checked
                    }
                  }))
                }
              />
              <span>Send compact trade-history summary to Hermes</span>
            </label>

            <label className="check-row" htmlFor="send-raw-trades">
              <input
                id="send-raw-trades"
                type="checkbox"
                checked={settings.dataSharing.sendRawTradeRecordsToHermes}
                disabled
                onChange={() => undefined}
              />
              <span>Send raw trade records to Hermes (disabled in MVP)</span>
            </label>

            <label htmlFor="wallet-watchlist">Observed public wallet addresses (read-only)</label>
            <textarea
              id="wallet-watchlist"
              className="notes"
              value={settings.dataSharing.observedWalletAddresses.join('\n')}
              onChange={(event) => {
                const nextAddresses = event.target.value
                  .split(/\n+/)
                  .map((entry) => entry.trim())
                  .filter(Boolean)
                  .slice(0, 12);

                setSettings((current) => ({
                  ...current,
                  dataSharing: {
                    ...current.dataSharing,
                    observedWalletAddresses: nextAddresses
                  }
                }));
              }}
              placeholder="One public address per line"
            />
            <small className="subtle-note">
              Never enter seed phrases or private keys. DocHermes only supports read-only public addresses and never requests signing,
              trading, approvals, or withdrawals.
            </small>
            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  void syncObservedWalletHistory('manual');
                }}
                disabled={walletSyncState.status === 'syncing'}
              >
                {walletSyncState.status === 'syncing' ? 'Syncing wallet history...' : 'Sync wallet history'}
              </button>
            </div>
            <small className="subtle-note">
              {walletSyncState.detail ?? 'Background sync runs every few minutes when local risk checks are enabled.'}
              {walletSyncState.lastSyncedAt ? ` · Last synced ${new Date(walletSyncState.lastSyncedAt).toLocaleString()}` : ''}
            </small>
            {walletSyncState.providerStatuses.length > 0 ? (
              <ul className="wallet-sync-status-list">
                {walletSyncState.providerStatuses.map((status) => (
                  <li key={`${status.address}-${status.chain}`}>
                    {status.address} · {status.chain} · {status.status}
                    {status.detail ? ` · ${status.detail}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}

            <label htmlFor="trade-csv-import">Trade history CSV import (read-only)</label>
            <textarea
              id="trade-csv-import"
              className="notes"
              value={tradeCsvInput}
              onChange={(event) => setTradeCsvInput(event.target.value)}
              placeholder="timestamp,size,unit,pnl_percent,token\n2026-05-22T12:00:00Z,0.5,SOL,-8.2,0x..."
            />
            <div className="button-row">
              <button type="button" onClick={importTradeCsvRecords}>
                Import CSV
              </button>
              <button type="button" className="ghost" onClick={clearImportedTradeRecords}>
                Clear imported records
              </button>
            </div>
            <small className="subtle-note">
              Imported records: {importedTradeRecords.length}
              {tradeCsvMessage ? ` · ${tradeCsvMessage}` : ''}
            </small>
            <small className="subtle-note">
              Wallet records (read-only): {walletTradeRecords.length}
            </small>

            <label className="check-row" htmlFor="keep-on-top">
              <input
                id="keep-on-top"
                type="checkbox"
                checked={settings.keepAlwaysOnTop}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    keepAlwaysOnTop: event.target.checked
                  }))
                }
              />
              <span>Keep coach panel on top</span>
            </label>
            <label className="check-row" htmlFor="voice-enabled">
              <input
                id="voice-enabled"
                type="checkbox"
                checked={settings.voice.enabled}
                onChange={(event) => updateVoice({ enabled: event.target.checked })}
              />
              <span>Enable push-to-talk</span>
            </label>
            <label htmlFor="voice-hotkey">Push-to-talk hotkey</label>
            <select
              id="voice-hotkey"
              value={settings.voice.hotkey}
              disabled={!settings.voice.enabled}
              onChange={(event) =>
                updateVoice({
                  hotkey: event.target.value as LocalSettings['voice']['hotkey']
                })
              }
            >
              <option value="space">Space</option>
              <option value="alt-space">Alt + Space</option>
              <option value="ctrl-space">Ctrl + Space</option>
              <option value="cmd-space">Cmd + Space</option>
            </select>
            <label className="check-row" htmlFor="voice-speak-replies">
              <input
                id="voice-speak-replies"
                type="checkbox"
                checked={settings.voice.speakReplies}
                onChange={(event) => updateVoice({ speakReplies: event.target.checked })}
              />
              <span>Read Hermes replies aloud</span>
            </label>
            <small className="subtle-note">
              Voice flow uses the selected trading window and shares the same Hermes request path as manual capture.
            </small>
            <label className="check-row" htmlFor="friction-enabled">
              <input
                id="friction-enabled"
                type="checkbox"
                checked={settings.friction.enabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    friction: {
                      ...current.friction,
                      enabled: event.target.checked
                    }
                  }))
                }
              />
              <span>Enable pre-trade friction cards</span>
            </label>
            <label htmlFor="friction-strictness">Friction strictness</label>
            <select
              id="friction-strictness"
              disabled={!settings.friction.enabled}
              value={settings.friction.strictness}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  friction: {
                    ...current.friction,
                    strictness: event.target.value as LocalSettings['friction']['strictness']
                  }
                }))
              }
            >
              <option value="low">Low</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
            </select>
            <label htmlFor="coach-mode">Coach mode</label>
            <select
              id="coach-mode"
              value={settings.coachMode}
              onChange={(event) =>
                updateCoachMode(event.target.value as CoachMode)
              }
            >
              {COACH_MODE_OPTIONS.map((option) => (
                <option key={option.mode} value={option.mode}>
                  {option.selectLabel}
                </option>
              ))}
            </select>
            <small className="subtle-note">
              {activeCoachModeCopy.settingDetail} {activeCoachModeCopy.policyBlockBehavior} {activeCoachModeCopy.boundary}
            </small>
            <label>Personal trading rules</label>
            <p className="subtle-note">Add plain-language rules; supported checks: confirmation requirements, size ceilings, and cooldown patterns.</p>
            <label htmlFor="new-personal-rule">New rule</label>
            <div className="source-constraint-row">
              <input
                id="new-personal-rule"
                value={newRuleText}
                onChange={(event) => setNewRuleText(event.target.value)}
                placeholder='e.g. "Never enter without confirmation"'
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') {
                    return;
                  }

                  event.preventDefault();
                  addPersonalRule();
                }}
              />
              <button type="button" onClick={addPersonalRule} disabled={!newRuleText.trim()}>
                Add rule
              </button>
            </div>
            {activePersonalRules.length > 0 ? (
              <div className="source-constraint-row">
                {activePersonalRules.map((rule) => (
                  <div key={rule.id} className="source-constraint-row">
                    <div className="check-row">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => togglePersonalRule(rule.id)}
                        aria-label={`Enable rule ${rule.text}`}
                      />
                      <span>{rule.text}</span>
                    </div>
                    <div className="button-row">
                      <button type="button" className="ghost" onClick={() => startRuleEdit(rule.id, rule.text)}>
                        Edit
                      </button>
                      <button type="button" className="ghost" onClick={() => archivePersonalRule(rule.id)}>
                        Archive
                      </button>
                    </div>
                    {editingRuleId === rule.id ? (
                      <div className="button-row">
                        <input
                          value={editingRuleText}
                          onChange={(event) => setEditingRuleText(event.target.value)}
                          placeholder="Edit rule text"
                        />
                        <button type="button" onClick={saveRuleEdit}>
                          Save
                        </button>
                        <button type="button" className="ghost" onClick={cancelRuleEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    <small className="subtle-note">Updated {new Date(rule.updatedAt).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            ) : (
              <small className="subtle-note">No active personal rules yet.</small>
            )}
            {archivedPersonalRules.length > 0 ? (
              <details>
                <summary>{archivedPersonalRules.length} archived rule(s)</summary>
                {archivedPersonalRules.map((rule) => (
                  <div key={rule.id} className="source-constraint-row">
                    <small className="subtle-note">{rule.text}</small>
                    <button type="button" className="ghost" onClick={() => restorePersonalRule(rule.id)}>
                      Restore
                    </button>
                  </div>
                ))}
              </details>
            ) : null}
            <label className="check-row" htmlFor="risk-budget-enabled">
              <input
                id="risk-budget-enabled"
                type="checkbox"
                checked={settings.riskBudget.enabled}
                onChange={(event) =>
                  updateRiskBudget({
                    enabled: event.target.checked
                  })
                }
              />
              <span>Enable session risk budget</span>
            </label>
            <label htmlFor="risk-budget-max-trades">Max trades per session</label>
            <input
              id="risk-budget-max-trades"
              type="number"
              min="0"
              step="1"
              value={settings.riskBudget.maxTradesPerSession}
              disabled={!settings.riskBudget.enabled}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                updateRiskBudget({
                  maxTradesPerSession: Number.isFinite(nextValue) ? Math.max(0, Math.round(nextValue)) : DEFAULT_RISK_BUDGET_SETTINGS.maxTradesPerSession
                });
              }}
            />
            <label htmlFor="risk-budget-max-loss">Max loss per session %</label>
            <input
              id="risk-budget-max-loss"
              type="number"
              min="0"
              step="1"
              value={settings.riskBudget.maxLossPerSessionPercent}
              disabled={!settings.riskBudget.enabled}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                updateRiskBudget({
                  maxLossPerSessionPercent: Number.isFinite(nextValue) ? Math.max(0, nextValue) : DEFAULT_RISK_BUDGET_SETTINGS.maxLossPerSessionPercent
                });
              }}
            />
            <label htmlFor="risk-budget-cooldown">Cooldown after loss (m)</label>
            <input
              id="risk-budget-cooldown"
              type="number"
              min="0"
              step="1"
              value={settings.riskBudget.cooldownMinutesAfterLoss}
              disabled={!settings.riskBudget.enabled}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                updateRiskBudget({
                  cooldownMinutesAfterLoss: Number.isFinite(nextValue) ? Math.max(0, Math.round(nextValue)) : DEFAULT_RISK_BUDGET_SETTINGS.cooldownMinutesAfterLoss
                });
              }}
            />
            <label htmlFor="risk-budget-size-multiplier">Max size multiplier</label>
            <input
              id="risk-budget-size-multiplier"
              type="number"
              min="1"
              step="0.1"
              value={settings.riskBudget.maxSizeMultiplier}
              disabled={!settings.riskBudget.enabled}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                updateRiskBudget({
                  maxSizeMultiplier: Number.isFinite(nextValue) ? Math.max(1, Math.round(nextValue * 100) / 100) : DEFAULT_RISK_BUDGET_SETTINGS.maxSizeMultiplier
                });
              }}
            />
            <label htmlFor="risk-budget-tilt-sensitivity">Tilt sensitivity</label>
            <select
              id="risk-budget-tilt-sensitivity"
              value={settings.riskBudget.tiltSensitivity}
              disabled={!settings.riskBudget.enabled}
              onChange={(event) => {
                updateRiskBudget({
                  tiltSensitivity: event.target.value as LocalSettings['riskBudget']['tiltSensitivity']
                });
              }}
            >
              <option value="low">Low</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
            </select>
            <label>Source-specific size constraints</label>
            {SOURCE_CONSTRAINT_CATEGORIES.map((sourceCategory) => {
              const sourceConstraint = settings.riskBudget.sourceConstraints[sourceCategory]
                ?? DEFAULT_SOURCE_CONSTRAINTS[sourceCategory]
                ?? { enabled: false, maxSizeMultiplier: 1 };

              return (
                <div key={sourceCategory} className="source-constraint-row">
                  <label className="check-row" htmlFor={`source-constraint-enabled-${sourceCategory}`}>
                    <input
                      id={`source-constraint-enabled-${sourceCategory}`}
                      type="checkbox"
                      checked={sourceConstraint.enabled}
                      disabled={!settings.riskBudget.enabled}
                      onChange={(event) =>
                        updateSourceConstraint(sourceCategory, {
                          enabled: event.target.checked
                        })
                      }
                    />
                    <span>Limit for {sourceCategoryLabel(sourceCategory)}</span>
                  </label>
                  <label htmlFor={`source-constraint-multiplier-${sourceCategory}`}>
                    Max multiplier (x) from baseline
                  </label>
                  <input
                    id={`source-constraint-multiplier-${sourceCategory}`}
                    type="number"
                    min="1"
                    step="0.1"
                    value={sourceConstraint.maxSizeMultiplier}
                    disabled={!settings.riskBudget.enabled || !sourceConstraint.enabled}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      updateSourceConstraint(sourceCategory, {
                        maxSizeMultiplier: Number.isFinite(nextValue) ? Math.max(1, Math.round(nextValue * 100) / 100) : 1
                      });
                    }}
                  />
                </div>
              );
            })}
            <small className="subtle-note">Higher sensitivity triggers more rapid-repetition and urgency checks.</small>
            <label className="check-row" htmlFor="clipboard-watch">
              <input
                id="clipboard-watch"
                type="checkbox"
                checked={settings.watchClipboard}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    watchClipboard: event.target.checked
                  }))
                }
              />
              <span>Watch clipboard for token candidates</span>
            </label>
            <label className="check-row" htmlFor="ocr-watch">
              <input
                id="ocr-watch"
                type="checkbox"
                checked={settings.watchOCR}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    watchOCR: event.target.checked
                  }))
                }
              />
              <span>Use OCR snapshots for local pre-checks</span>
            </label>
            <label htmlFor="ocr-context-mode">OCR analysis region</label>
            <select
              id="ocr-context-mode"
              value={settings.ocrContextMode}
              onChange={(event) => {
                const nextMode = event.target.value;
                if (nextMode !== 'full-window' && nextMode !== 'order-panel' && nextMode !== 'chart-order-panel') {
                  return;
                }

                setSettings((current) => ({
                  ...current,
                  ocrContextMode: nextMode
                }));
              }}
              disabled={!settings.watchOCR}
            >
              <option value="full-window">Full selected window</option>
              <option value="order-panel">Order panel focus</option>
              <option value="chart-order-panel">Chart + order panel</option>
            </select>
            <label className="check-row" htmlFor="ocr-overlay-enabled">
              <input
                id="ocr-overlay-enabled"
                type="checkbox"
                checked={settings.ocrRegionProfile.overlayEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    ocrRegionProfile: {
                      ...current.ocrRegionProfile,
                      overlayEnabled: event.target.checked
                    }
                  }))
                }
              />
              <span>Show OCR region overlay on capture preview</span>
            </label>
            <label htmlFor="ocr-region-target">OCR region to edit</label>
            <select
              id="ocr-region-target"
              value={activeOcrRegionKey}
              onChange={(event) =>
                setActiveOcrRegionKey(event.target.value === 'chartZone' ? 'chartZone' : 'orderPanel')
              }
            >
              <option value="orderPanel">Order panel</option>
              <option value="chartZone">Chart zone</option>
            </select>
            <label htmlFor="ocr-region-left">Region left (0-1)</label>
            <input
              id="ocr-region-left"
              type="number"
              min="0"
              max="1"
              step={OCR_REGION_STEP}
              value={activeOcrRegionRect.left}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateOcrRegionRect(activeOcrRegionKey, { left: parsed });
              }}
            />
            <label htmlFor="ocr-region-top">Region top (0-1)</label>
            <input
              id="ocr-region-top"
              type="number"
              min="0"
              max="1"
              step={OCR_REGION_STEP}
              value={activeOcrRegionRect.top}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateOcrRegionRect(activeOcrRegionKey, { top: parsed });
              }}
            />
            <label htmlFor="ocr-region-width">Region width (0-1)</label>
            <input
              id="ocr-region-width"
              type="number"
              min={OCR_REGION_MIN_SIZE}
              max="1"
              step={OCR_REGION_STEP}
              value={activeOcrRegionRect.width}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateOcrRegionRect(activeOcrRegionKey, { width: parsed });
              }}
            />
            <label htmlFor="ocr-region-height">Region height (0-1)</label>
            <input
              id="ocr-region-height"
              type="number"
              min={OCR_REGION_MIN_SIZE}
              max="1"
              step={OCR_REGION_STEP}
              value={activeOcrRegionRect.height}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateOcrRegionRect(activeOcrRegionKey, { height: parsed });
              }}
            />
            <small className="subtle-note">
              Enable overlay, then drag on the latest capture to place the selected region.
            </small>
            <button type="button" className="ghost" onClick={resetOcrRegionProfileDefaults}>
              Reset OCR region defaults
            </button>
            <p className="subtle-note" role="note">
              {settings.watchOCR
                ? settings.armed
                  ? ocrStatusMessage
                  : 'OCR monitoring waits for armed state.'
                : 'OCR monitoring currently inactive.'}
            </p>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                void bridge?.recalibrateOCR().catch((nextError: unknown) => {
                  setError(readError(nextError));
                });
              }}
              disabled={!settings.watchOCR}
            >
              Recalibrate OCR regions
            </button>
          </div>
        ) : null}
      </section>

      <section className="control-strip control-strip--multi" aria-label="Request diagnostics">
        <div>
          <span className="label">Request diagnostics</span>
          <strong>
            {diagnosticSummary.count} recent request{diagnosticSummary.count === 1 ? '' : 's'} ·{' '}
            {diagnosticSummary.successCount}/{diagnosticSummary.count} success
          </strong>
          {diagnosticSummary.count > 0 ? (
            <small>
              Avg latency (success): {formatTiming(diagnosticSummary.avgLocalRiskMs)} risk checks ·{' '}
              {formatTiming(diagnosticSummary.avgOcrMs)} OCR · {formatTiming(diagnosticSummary.avgRequestBuildMs)} request build ·{' '}
              {formatTiming(diagnosticSummary.avgCaptureMs)} capture · {formatTiming(diagnosticSummary.avgHermesMs)} Hermes ·{' '}
              {formatTiming(diagnosticSummary.avgTotalMs)} total
            </small>
          ) : null}
        </div>
        <div className="button-row">
          <button type="button" onClick={clearDiagnosticsHistory} disabled={requestDiagnostics.length === 0}>
            Clear history
          </button>
          <button type="button" onClick={() => setDiagnosticsOpen((open) => !open)}>
            {diagnosticsOpen ? 'Hide history' : 'Show history'}
          </button>
        </div>
      </section>

      {diagnosticsOpen ? (
        <section className="message diagnostics" aria-label="Diagnostics history">
          <div className="section-heading compact">
            <h2>Diagnostics history</h2>
          </div>
          {requestDiagnostics.length > 0 ? (
            <ol className="diagnostic-history">
              {requestDiagnostics.slice(0, 8).map((diagnostic) => (
                <li key={diagnostic.id} className={`diagnostic-item ${diagnostic.status}`}>
                  <div className="diagnostic-item-row">
                    <strong>{diagnostic.status.toUpperCase()}</strong>
                    <span>{diagnostic.selectedWindowName}</span>
                    <small>
                      {diagnostic.connection.connectionKind}/{diagnostic.connection.endpointMode}
                    </small>
                    <button
                      type="button"
                      onClick={() => {
                        void copyDiagnosticReport(diagnostic);
                      }}
                    >
                      {copiedDiagnosticId === diagnostic.id ? 'Report copied' : 'Copy report'}
                    </button>
                  </div>
                  <div className="diagnostic-metrics">
                    <small>
                      Risk {formatTiming(diagnostic.timings.localRiskMs)} · OCR {formatTiming(diagnostic.timings.ocrMs)} · Build{' '}
                      {formatTiming(diagnostic.timings.requestBuildMs)} · Capture {formatTiming(diagnostic.timings.captureMs)} · Hermes{' '}
                      {formatTiming(diagnostic.timings.hermesMs)} · Total {formatTiming(diagnostic.timings.totalMs)}
                    </small>
                  </div>
                  {diagnostic.failure ? (
                    <small>
                      Failure: {diagnostic.failure.stage ?? 'unknown'} — {diagnostic.failure.reason ?? 'no detail'}
                    </small>
                  ) : null}
                  {diagnostic.debugNotes ? <small>Note: {diagnostic.debugNotes}</small> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="diagnostics-empty">No diagnostics recorded yet.</p>
          )}
        </section>
      ) : null}

      {pendingRemoteConsent ? (
        <section className="message warning" aria-label="Remote Hermes consent">
          <span className="label">Remote Hermes target</span>
          <p>
            This request will be sent to <strong>{pendingRemoteConsent.destinationOrigin}</strong> and include:
          </p>
          <p>To Hermes: {pendingRemoteConsent.payloadClasses.join(' · ')}</p>
          <p>Local-only: {pendingRemoteConsent.localOnlyClasses.join(' · ') || 'none'}</p>
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                if (!selectedSource) {
                  setPendingRemoteConsent(undefined);
                  setError('Select a trading window first.');
                  return;
                }
                void askWithSource(selectedSource, {
                  remoteConsentBypassReason: 'remote-consent-confirmed',
                  skipPolicyCheck: true,
                  skipFrictionCheck: true
                });
              }}
            >
              I understand, send now
            </button>
            <button type="button" className="ghost" onClick={() => setPendingRemoteConsent(undefined)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {policyCard && policyBlockUi ? (
        <section className="message warning policy-card" aria-label="Policy mode guardrail">
          <span className="label">{policyBlockUi.title}</span>
          <p>{policyBlockUi.summary}</p>
          <small className="policy-card-boundary">{policyBlockUi.boundary}</small>
          {policyCard.blockers.length > 0 ? (
            <div className="policy-card-panel">
              <strong>{policyBlockUi.blockerHeading}</strong>
              <ol className="policy-blocker-list">
                {policyCard.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {policyCard.warnings.length > 0 ? (
            <details className="policy-card-panel">
              <summary>{policyBlockUi.contextHeading}</summary>
              <ul className="warning-list">
                {policyCard.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="policy-card-audit">
            <strong>{policyBlockUi.auditLabel}</strong>
            <small>{policyBlockUi.auditDetail}</small>
          </div>
          <label htmlFor="policy-note">{policyBlockUi.noteLabel}</label>
          <textarea
            id="policy-note"
            className="notes"
            value={policyNoteText}
            onChange={(event) => setPolicyNoteText(event.target.value)}
            placeholder={policyBlockUi.notePlaceholder}
          />
          <small className="policy-note-hint">{policyBlockUi.noteHint}</small>
          <div className="button-row">
            <button
              type="button"
              disabled={!policyBlockUi.canOverride}
              onClick={() => {
                if (selectedSource) {
                  proceedWithPolicyOverride(selectedSource);
                }
              }}
            >
              Override and send
            </button>
            <button type="button" className="ghost" onClick={clearPolicyAndError}>
              Block (no send)
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setPolicyCard(undefined);
                setPolicyNoteText('');
              }}
            >
              Dismiss for now
            </button>
          </div>
        </section>
      ) : null}

      {pickerOpen ? (
        <section className="window-picker" aria-label="Available windows">
          <div className="section-heading">
            <h2>Choose the trading window to inspect</h2>
            <button type="button" className="ghost" onClick={() => loadSources('pair')}>
              Refresh
            </button>
            <button type="button" className="ghost" onClick={() => setPickerOpen(false)}>
              Close
            </button>
          </div>
          <div className="source-list">
            {sources.map((source) => (
              <button
                type="button"
                className={`source-option ${selectedSource?.id === source.id ? 'selected' : ''}`}
                key={source.id}
                onClick={() => {
                  onSelectSource(source);
                }}
              >
                <img src={source.thumbnailDataUrl} alt="" />
                <span>{source.name}</span>
                <small>{source.kind}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {requestPreview ? (
        <section className="message" aria-label="Hermes request preview">
          <span className="label">Sent to Hermes</span>
          <p>
            Destination: <strong>{requestPreview.destinationOrigin}</strong> ({requestPreview.dataSharingScope})
          </p>
          <p>
            Privacy preset: <strong>{settings.privacy.preset}</strong>
          </p>
          <div className="payload-row">
            {requestPreview.payloadClasses.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </div>
          {requestPreview.localOnlyClasses.length > 0 ? (
            <p>
              Withheld from Hermes: {requestPreview.localOnlyClasses.join(' · ')}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="question-panel" aria-label="Ask Hermes">
        <label htmlFor="question">Question</label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Should I take this trade now?"
        />
        <div className="button-row">
          <button type="button" className="primary" onClick={askCoach} disabled={!canAsk}>
            Capture and ask
          </button>
          <button type="button" className="ghost" onClick={toggleVoiceCapture} disabled={!settings.voice.enabled}>
            {isVoiceListening ? 'Stop listening' : 'Push-to-talk'}
          </button>
          {isSpeechSpeaking ? (
            <button type="button" className="ghost" onClick={stopSpeechOutput}>
              Stop reply audio
            </button>
          ) : null}
        </div>
      </section>

      {frictionCard ? (
        <section className="message warning">
          <span className="label">Pre-trade friction card</span>
          <p>{frictionCard.question ? `High-risk context: ${frictionCard.question}` : 'High-risk context detected.'}</p>
          {frictionCard.warnings.length > 0 ? (
            <div className="warning-list">
              {frictionCard.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="warning-list">
            {frictionCard.prompts.map((prompt) => (
              <p key={prompt}>{prompt}</p>
            ))}
          </div>
          <div className="button-row" style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => {
                if (selectedSource) {
                  void proceedWithFrictionAction('I have a plan', selectedSource, true);
                }
              }}
            >
              I have a plan
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedSource) {
                  void proceedWithFrictionAction('Skip this trade', selectedSource);
                }
              }}
            >
              Skip this trade
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedSource) {
                  void proceedWithFrictionAction('Ask Hermes', selectedSource, true);
                }
              }}
            >
              Ask Hermes
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                clearFrictionCard();
              }}
            >
              Dismiss
            </button>
          </div>
          <label htmlFor="friction-note">Add friction note</label>
          <textarea
            id="friction-note"
            className="notes"
            value={frictionNoteText}
            onChange={(event) => setFrictionNoteText(event.target.value)}
            placeholder="If this is a false-positive or special case, capture it here."
          />
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                if (!frictionNoteText.trim()) {
                  return;
                }

                persistFrictionJournalAction('Friction note added', frictionNoteText.trim());
              }}
            >
              Save note
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setFrictionNoteText('');
              }}
            >
              Clear note
            </button>
          </div>
          <small>Dismiss does not log an action. Use an action to proceed, skip, or save a note.</small>
        </section>
      ) : null}

      {localWarningCards.length > 0 ? (
        <section className="message warning">
          <span className="label">Local guardrail</span>
          <div className="warning-cards">
            {localWarningCards.map((warning) => (
              <article key={warning.text} className="warning-card">
                <p className="warning-card-text">{warning.text}</p>
                <p className="warning-card-subtitle">Why am I seeing this?</p>
                <ul className="warning-evidence-list">
                  {warning.evidences.length > 0 ? (
                    warning.evidences.map((evidence, index) => (
                      <li
                        key={`${warning.text}-${evidence.source}-${evidence.detail}-${index}`}
                        className={`warning-evidence ${isLowConfidenceEvidence(evidence.confidence) ? 'warning-evidence--low' : ''}`}
                      >
                        <div className="warning-evidence-header">
                          <span className="warning-evidence-source">{evidence.source}</span>
                          <span className={`warning-evidence-confidence ${isLowConfidenceEvidence(evidence.confidence) ? 'warning-evidence-confidence--low' : ''}`}>
                            {formatEvidenceConfidence(evidence.confidence)}
                            {isLowConfidenceEvidence(evidence.confidence) ? ' (uncertain)' : ''}
                          </span>
                        </div>
                        <div className="warning-evidence-detail">{evidence.detail}</div>
                        <small className="warning-evidence-meta">
                          {evidence.provenance ? `Provenance: ${evidence.provenance}` : 'Provenance: local'}
                          {evidence.detectedAt ? ` · ${formatWarningDetectedAt(evidence.detectedAt)}` : ''}
                        </small>
                      </li>
                    ))
                  ) : (
                    <li className="warning-evidence warning-evidence--empty">No detailed evidence available.</li>
                  )}
                </ul>
                <div className="feedback-button-row">
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning.text, 'took-it-anyway');
                    }}
                  >
                    I took it anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning.text, 'skipped');
                    }}
                  >
                    I skipped
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning.text, 'followed-plan');
                    }}
                  >
                    I followed the plan
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setFeedbackNoteWarning(warning.text);
                    }}
                  >
                    Add note
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning.text, 'false-positive');
                    }}
                  >
                    Mark false positive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {feedbackNoteWarning ? (
        <section className="message">
          <span className="label">Add feedback note</span>
          <p>Warning: {feedbackNoteWarning}</p>
          <textarea
            className="notes"
            value={feedbackNoteText}
            onChange={(event) => setFeedbackNoteText(event.target.value)}
            placeholder="Why was this warning skipped or valid?"
          />
          <div className="button-row">
            <button type="button" onClick={saveAddNoteFeedback}>
              Save note
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setFeedbackNoteWarning(undefined);
                setFeedbackNoteText('');
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {monitorSignals.length > 0 ? (
        <section className="message warning">
          <div className="section-heading compact">
            <span className="label">Live monitoring signals</span>
            <button type="button" className="ghost" onClick={clearMonitorSignals}>
              Clear
            </button>
          </div>
          <ul className="monitor-list">
            {monitorSignals.map((signal) => (
              <li key={`${signal.detectedAt}-${signal.value}-${signal.kind}`}>
                <div>
                  <strong>{signal.source}</strong>/{signal.kind} · <span className="monitor-list-meta">{signal.confidence}-confidence</span>
                  <div>
                    {signal.message ? signal.message : signal.maskedValue}
                  </div>
                </div>
                {signal.source === 'clipboard' ? (
                  <div className="button-row">
                    <button type="button" className="ghost" onClick={() => appendSignalToQuestion(signal)}>
                      Use
                    </button>
                    <button type="button" className="ghost" onClick={() => dismissMonitorSignal(signal)}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="message" aria-label="Local memory controls">
        <div className="section-heading compact">
          <span className="label">Local memory</span>
          <button
            type="button"
            className="ghost"
            onClick={clearLocalMemory}
            disabled={journalEntries.length === 0 && warningFeedbackEntries.length === 0}
          >
            Clear local memory
          </button>
        </div>
        <p>
          {journalEntries.length} journal notes · {warningFeedbackEntries.length} warning feedback records saved locally on this
          device.
        </p>
      </section>

      {memoryContext.matchedPatterns.length > 0 ? (
        <section className="message memory" aria-label="Personal memory match">
          <span className="label">Personal memory</span>
          {memoryContext.matchedPatterns.map((pattern) => (
            <div key={pattern.name} className="memory-pattern">
              <strong>{pattern.summary}</strong>
              <p>{pattern.recommendation}</p>
              <small>{pattern.evidenceCount} local journal notes matched</small>
            </div>
          ))}
        </section>
      ) : null}

      {memoryContext.tradeHistorySummary ? (
        <section className="message trade-history" aria-label="Trade history summary">
          <span className="label">Trade history summary</span>
          <ul className="trade-history-list">
            <li>
              {memoryContext.tradeHistorySummary.totalTrades} recent trades tracked · {memoryContext.tradeHistorySummary.recentLossStreak} recent loss
              {memoryContext.tradeHistorySummary.recentLossStreak === 1 ? '' : 'es'} (latest hour/day:
              {memoryContext.tradeHistorySummary.tradesLastHour}/{memoryContext.tradeHistorySummary.tradesLastDay})
              {memoryContext.tradeHistorySummary.importedTrades > 0
                ? ` · imported records: ${memoryContext.tradeHistorySummary.importedTrades}`
                : ''}
              {memoryContext.tradeHistorySummary.walletTrades > 0
                ? ` · wallet records: ${memoryContext.tradeHistorySummary.walletTrades}`
                : ''}
            </li>
            {memoryContext.tradeHistorySummary.sizeSignals.length > 0 ? (
              memoryContext.tradeHistorySummary.sizeSignals.map((signal) => (
                <li key={signal.unit}>
                  {signal.unit.toUpperCase()} median: {signal.medianSize.toFixed(2)} / max: {signal.maxSize.toFixed(2)} (n={signal.sampleCount})
                </li>
              ))
            ) : (
              <li>No parseable trade-size signal in recent notes.</li>
            )}
          </ul>
        </section>
      ) : null}

      {warningFeedbackEntries.length > 0 ? (
        <section className="message" aria-label="Warning feedback log">
          <span className="label">Warning feedback</span>
          <div className="warning-feedback-list">
            {warningFeedbackEntries.map((entry) => (
              <div key={entry.id} className="warning-feedback-item">
                <strong>{entry.warningText}</strong>
                <p>{entry.action.replace('-', ' ')}</p>
                <small>
                  {new Date(entry.createdAt).toLocaleString()} · {entry.selectedWindowName}
                </small>
                {entry.notes ? <small>Notes: {entry.notes}</small> : null}
                {formatPolicyOverrideAuditDetail(entry).map((detail) => (
                  <small key={`${entry.id}-${detail}`} className="policy-override-audit-detail">
                    {detail}
                  </small>
                ))}
                {entry.updatedAt ? <small>Updated: {new Date(entry.updatedAt).toLocaleString()}</small> : null}
                <div className="button-row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      beginEditFeedback(entry);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="ghost" onClick={() => deleteWarningFeedbackEntry(entry.id)}>
                    Delete
                  </button>
                </div>

                {editingFeedbackId === entry.id ? (
                  <div className="feedback-edit-row">
                    <label htmlFor={`edit-action-${entry.id}`}>Action</label>
                    <select
                      id={`edit-action-${entry.id}`}
                      value={editingFeedbackAction}
                      onChange={(event) => setEditingFeedbackAction(event.target.value as WarningFeedbackAction)}
                    >
                      <option value="took-it-anyway">Took it anyway</option>
                      <option value="skipped">Skipped</option>
                      <option value="followed-plan">Followed plan</option>
                      <option value="added-note">Added note</option>
                      <option value="false-positive">Mark false positive</option>
                    </select>
                    <label htmlFor={`edit-notes-${entry.id}`}>Notes</label>
                    <textarea
                      id={`edit-notes-${entry.id}`}
                      value={editingFeedbackNotes}
                      onChange={(event) => setEditingFeedbackNotes(event.target.value)}
                      className="notes"
                    />
                    <div className="button-row">
                      <button type="button" onClick={saveEditedFeedback}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setEditingFeedbackId(undefined);
                          setEditingFeedbackAction('followed-plan');
                          setEditingFeedbackNotes('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {postmortemSessions.length > 0 ? (
        <section className="message postmortem" aria-label="Postmortem replay">
          <span className="label">Postmortem replay</span>
          <div className="section-heading compact">
            <h2>{postmortemSessionSummaryLabel}</h2>
            <button type="button" className="ghost" onClick={savePostmortemSummary}>
              Save session compact summary
            </button>
          </div>

          <label htmlFor="postmortem-session">Replay session</label>
          <select
            id="postmortem-session"
            value={postmortemSession?.id ?? ''}
            onChange={(event) => {
              setSelectedPostmortemSessionId(event.target.value);
              setPostmortemSummaryMessage('');
              clearPostmortemEditing();
            }}
          >
            {postmortemSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
              </option>
            ))}
          </select>

          {postmortemSummaryMessage ? <small className="subtle-note">{postmortemSummaryMessage}</small> : null}

          <div className="subtle-note">
            {postmortemSession.timeline.length} timeline event(s) · {postmortemSessionOutcomes.length} tagged outcome(s)
            {postmortemSession.riskSignals.length > 0
              ? ` · top risks: ${postmortemSession.riskSignals.slice(0, 3).join(', ')}`
              : ''}
          </div>

          <div className="postmortem-timeline">
            {postmortemSession.timeline.map((event) => {
              const eventOutcome = postmortemOutcomeForEvent(event.id);
              const isEditing = editingPostmortemEventId === event.id;

              return (
                <article key={event.id} className="postmortem-event">
                  <div className="postmortem-event-heading">
                    <strong>{event.source}</strong>
                    <small>{new Date(event.timestamp).toLocaleString()}</small>
                  </div>
                  <h3>{event.title}</h3>
                  <p className="postmortem-event-summary">{event.summary}</p>
                  <small className="postmortem-event-subtitle">{event.riskSignals.length > 0 ? 'Risk signals present' : 'No explicit risk signal'}</small>

                  <ul className="postmortem-event-list">
                    {event.details.map((detail, index) => (
                      <li key={`${event.id}-detail-${index}`}>{detail}</li>
                    ))}
                  </ul>
                  {event.provenance.length > 0 ? (
                    <ul className="postmortem-event-list postmortem-event-provenance">
                      {event.provenance.map((entry, index) => (
                        <li key={`${event.id}-prov-${index}`}>{entry}</li>
                      ))}
                    </ul>
                  ) : null}

                  {eventOutcome ? (
                    <small className="postmortem-outcome-chip">
                      {formatPostmortemOutcomeDetail(eventOutcome)}
                    </small>
                  ) : null}

                  {isEditing ? (
                    <div className="postmortem-edit-row">
                      <label htmlFor={`postmortem-tag-${event.id}`}>Outcome tag</label>
                      <select
                        id={`postmortem-tag-${event.id}`}
                        value={editingPostmortemOutcome}
                        onChange={(newEvent) => setEditingPostmortemOutcome(newEvent.target.value as PostmortemOutcomeTag)}
                      >
                        {POSTMORTEM_OUTCOME_TAG_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <label htmlFor={`postmortem-notes-${event.id}`}>Notes</label>
                      <textarea
                        id={`postmortem-notes-${event.id}`}
                        value={editingPostmortemNotes}
                        className="notes"
                        onChange={(newEvent) => setEditingPostmortemNotes(newEvent.target.value)}
                      />
                      <label htmlFor={`postmortem-mistake-tags-${event.id}`}>Mistake tags (comma separated)</label>
                      <input
                        id={`postmortem-mistake-tags-${event.id}`}
                        value={editingPostmortemMistakeTags}
                        onChange={(newEvent) => setEditingPostmortemMistakeTags(newEvent.target.value)}
                        placeholder="fomo, late-entry, oversize"
                      />
                      <label htmlFor={`postmortem-setup-quality-${event.id}`}>Setup quality (1-5)</label>
                      <input
                        id={`postmortem-setup-quality-${event.id}`}
                        type="number"
                        min="1"
                        max="5"
                        step="1"
                        value={editingPostmortemSetupQuality}
                        onChange={(newEvent) => setEditingPostmortemSetupQuality(Math.max(1, Math.min(5, Number(newEvent.target.value) || 3)))}
                      />
                      <label htmlFor={`postmortem-source-quality-${event.id}`}>Source quality (1-5)</label>
                      <input
                        id={`postmortem-source-quality-${event.id}`}
                        type="number"
                        min="1"
                        max="5"
                        step="1"
                        value={editingPostmortemSourceQuality}
                        onChange={(newEvent) => setEditingPostmortemSourceQuality(Math.max(1, Math.min(5, Number(newEvent.target.value) || 3)))}
                      />
                      <label htmlFor={`postmortem-sizing-quality-${event.id}`}>Sizing quality (1-5)</label>
                      <input
                        id={`postmortem-sizing-quality-${event.id}`}
                        type="number"
                        min="1"
                        max="5"
                        step="1"
                        value={editingPostmortemSizingQuality}
                        onChange={(newEvent) => setEditingPostmortemSizingQuality(Math.max(1, Math.min(5, Number(newEvent.target.value) || 3)))}
                      />
                      <label htmlFor={`postmortem-entry-timing-quality-${event.id}`}>Entry timing quality (1-5)</label>
                      <input
                        id={`postmortem-entry-timing-quality-${event.id}`}
                        type="number"
                        min="1"
                        max="5"
                        step="1"
                        value={editingPostmortemEntryTimingQuality}
                        onChange={(newEvent) =>
                          setEditingPostmortemEntryTimingQuality(Math.max(1, Math.min(5, Number(newEvent.target.value) || 3)))
                        }
                      />
                      <label htmlFor={`postmortem-invalidation-quality-${event.id}`}>Invalidation quality (1-5)</label>
                      <input
                        id={`postmortem-invalidation-quality-${event.id}`}
                        type="number"
                        min="1"
                        max="5"
                        step="1"
                        value={editingPostmortemInvalidationQuality}
                        onChange={(newEvent) =>
                          setEditingPostmortemInvalidationQuality(Math.max(1, Math.min(5, Number(newEvent.target.value) || 3)))
                        }
                      />
                      <label htmlFor={`postmortem-max-loss-${event.id}`}>Max loss observed (%)</label>
                      <input
                        id={`postmortem-max-loss-${event.id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={editingPostmortemMaxLossPercent}
                        onChange={(newEvent) => setEditingPostmortemMaxLossPercent(newEvent.target.value)}
                        placeholder="12.5"
                      />
                      <label htmlFor={`postmortem-lesson-${event.id}`}>Lesson learned</label>
                      <textarea
                        id={`postmortem-lesson-${event.id}`}
                        value={editingPostmortemLessonLearned}
                        className="notes"
                        onChange={(newEvent) => setEditingPostmortemLessonLearned(newEvent.target.value)}
                      />
                      <div className="button-row">
                        <button type="button" onClick={savePostmortemOutcome}>
                          Save outcome
                        </button>
                        <button type="button" className="ghost" onClick={clearPostmortemEditing}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="button-row">
                      <button type="button" onClick={() => beginEditPostmortemOutcome(event)}>
                        {eventOutcome ? 'Edit outcome' : 'Add outcome'}
                      </button>
                      {eventOutcome ? (
                        <button type="button" className="ghost" onClick={() => deletePostmortemOutcome(eventOutcome.id)}>
                          Clear outcome
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {postmortemSessionSummaries.length > 0 ? (
            <div className="postmortem-summary-listing">
              <div className="section-heading compact">
                <h2>Saved session summaries</h2>
                <small>{postmortemSessionSummaries.length}</small>
              </div>
              <ol className="postmortem-summary-list">
                {postmortemSessionSummaries.slice(0, POSTMORTEM_SUMMARY_PREVIEW_LIMIT).map((summary) => (
                  <li key={summary.id} className="postmortem-summary-item">
                    <strong>{summary.compactSummary}</strong>
                    <small>
                      Generated {new Date(summary.generatedAt).toLocaleString()} · {summary.eventCount} events · {summary.taggedEventCount}{' '}
                      tagged
                    </small>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      {screenshotDataUrl ? (
        <section className="preview" aria-label="Latest screenshot preview">
          <div className="section-heading">
            <h2>Latest capture</h2>
            <span>{selectedSource?.name}</span>
          </div>
          <div className="preview-media">
            <img
              ref={previewImageRef}
              src={screenshotDataUrl}
              alt="Latest selected trading window capture"
            />
            {settings.ocrRegionProfile.overlayEnabled && ocrOverlayRegions.length > 0 ? (
              <div
                className={`ocr-overlay-stage ${draggingOcrRegion ? 'is-dragging' : ''}`}
                onPointerDown={beginOcrOverlayDrag}
              >
                {ocrOverlayRegions.map((region) => (
                  <button
                    type="button"
                    key={region.key}
                    className={`ocr-region-box ${region.isActive ? 'is-active' : ''}`}
                    style={{
                      left: `${region.rectangle.left * 100}%`,
                      top: `${region.rectangle.top * 100}%`,
                      width: `${region.rectangle.width * 100}%`,
                      height: `${region.rectangle.height * 100}%`
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setActiveOcrRegionKey(region.key);
                    }}
                  >
                    <span>{region.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {settings.ocrRegionProfile.overlayEnabled && ocrOverlayRegions.length > 0 ? (
            <small className="subtle-note">
              Drag over the capture to set the selected OCR region.
            </small>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <section className="message error" role="alert">
          {error}
        </section>
      ) : null}

      {tradeCard ? (
        <section
          className={`message trade-card trade-card--${tradeCard.riskTone}`}
          aria-label="Trade card decision flow"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="trade-card-header">
            <div>
              <span className="label">Trade card</span>
              <h2>{tradeCard.token}</h2>
              <p>
                {tradeCard.proposedTrade} · {tradeCard.strategy}
              </p>
            </div>
            <div className={`trade-card-risk trade-card-risk--${tradeCard.riskTone}`} aria-label={`Risk ${tradeCard.risk}`}>
              <span>Risk</span>
              <strong>{tradeCard.risk}</strong>
            </div>
          </div>

          <dl className="trade-card-facts">
            <div>
              <dt>Source</dt>
              <dd>{tradeCard.source}</dd>
            </div>
            <div>
              <dt>Token age</dt>
              <dd>{tradeCard.tokenAge}</dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd>{tradeCard.liquidity}</dd>
            </div>
            <div>
              <dt>Holder concentration</dt>
              <dd>{tradeCard.holderConcentration}</dd>
            </div>
            <div>
              <dt>Wallet behavior</dt>
              <dd>{tradeCard.recentWalletBehavior}</dd>
            </div>
            <div>
              <dt>Recommended size</dt>
              <dd>{tradeCard.recommendedSize}</dd>
            </div>
          </dl>

          <div className="trade-card-assessment">
            <span className="label">Coach assessment</span>
            <p>{tradeCard.reason}</p>
            {tradeCard.memorySummary ? <small>{tradeCard.memorySummary}</small> : null}
          </div>

          <div className="trade-card-plan">
            <span className="label">Suggested plan</span>
            <dl>
              <div>
                <dt>Entry</dt>
                <dd>{tradeCard.plan.entry}</dd>
              </div>
              <div>
                <dt>Invalidation</dt>
                <dd>{tradeCard.plan.invalidation}</dd>
              </div>
              <div>
                <dt>Take profit</dt>
                <dd>{tradeCard.plan.takeProfit}</dd>
              </div>
              <div>
                <dt>Max hold</dt>
                <dd>{tradeCard.plan.maxHoldTime}</dd>
              </div>
            </dl>
          </div>

          {tradeCard.warnings.length > 0 ? (
            <ul className="trade-card-warnings" aria-label="Trade-card guardrails">
              {tradeCard.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <p className="trade-card-boundary">{tradeCard.advisoryNotice}</p>
          <label htmlFor="trade-card-note">Decision note</label>
          <textarea
            id="trade-card-note"
            className="notes"
            value={tradeCardNoteText}
            onChange={(event) => setTradeCardNoteText(event.target.value)}
            placeholder="Add sizing, alert, plan, rejection, or override context."
          />
          <div className="trade-card-actions">
            {tradeCard.actions.map((action) => (
              <button
                key={action.kind}
                type="button"
                className={action.kind === 'accepted-recommended' ? 'primary' : action.kind === 'overrode' ? 'ghost' : undefined}
                onClick={() => persistTradeCardDecision(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
          {requestMetrics ? (
            <small className="timing">
              Local risk checks: {formatTiming(requestMetrics.localRiskMs)} · OCR: {formatTiming(requestMetrics.ocrMs)} · Request build:{' '}
              {formatTiming(requestMetrics.requestBuildMs)} · Capture: {formatTiming(requestMetrics.captureMs)} · Hermes:{' '}
              {formatTiming(requestMetrics.hermesMs)} · Total: {formatTiming(requestMetrics.totalMs)}
            </small>
          ) : null}
          <details className="trade-card-raw-response">
            <summary>Raw Hermes response</summary>
            <p>{response}</p>
          </details>
        </section>
      ) : null}

      {response ? (
        <section className="message" aria-label="Source context">
          <div className="section-heading compact source-outcome-heading">
            <h2>Source context</h2>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                applySourceContextFromFinding(topSourceQualityFinding, true);
              }}
              disabled={!topSourceQualityFinding}
            >
              Apply detected source
            </button>
          </div>
          <small className="source-outcome-hint">Track source context so future source-quality checks learn from your outcomes.</small>
          {topSourceQualityFinding ? (
            <div className="source-quality-chip-list">
              <span className="source-quality-chip">
                {topSourceQualityCategoryLabel} · confidence {topSourceQualityFinding.confidence} ·{' '}
                {topSourceQualityFinding.provenance}
              </span>
              {topSourceQualityFinding.tokenHint ? (
                <span className="source-quality-chip">Token hint: {topSourceQualityFinding.tokenHint}</span>
              ) : null}
            </div>
          ) : (
            <small className="source-outcome-hint">No source detected in this request. Fill category/outcome manually if needed.</small>
          )}
          <label htmlFor="source-category">Source category</label>
          <select
            id="source-category"
            value={journalSourceCategory}
            onChange={(event) => setJournalSourceCategory(event.target.value as SourceCategory)}
          >
            {SOURCE_CATEGORY_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="source-outcome">Outcome</label>
          <select
            id="source-outcome"
            value={journalSourceOutcome}
            onChange={(event) => setJournalSourceOutcome(event.target.value as SourceQualityOutcome)}
          >
            {SOURCE_OUTCOME_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small className="source-outcome-hint">{SOURCE_OUTCOME_HELP[journalSourceOutcome]}</small>
          <label htmlFor="source-token-hint">Token/address hint (optional)</label>
          <input
            id="source-token-hint"
            value={journalSourceTokenHint}
            onChange={(event) => setJournalSourceTokenHint(event.target.value)}
            placeholder="Optional token hint (e.g. contract/address)"
          />
          <label htmlFor="journal-notes">Session notes</label>
          <textarea
            id="journal-notes"
            className="notes"
            value={journalNotes}
            onChange={(event) => setJournalNotes(event.target.value)}
            placeholder="What happened next?"
          />
          <div className="journal-actions">
            <button type="button" onClick={saveJournalEntry}>
              Save journal
            </button>
            <span>{journalSavedMessage || `${journalEntries.length} saved locally`}</span>
          </div>
        </section>
      ) : null}

      <footer>
        Platform agnostic. Read-only wallet context only. No signing. No order routing.
      </footer>
    </main>
  );
}

function readError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unexpected Hermes Coach error.';
}

function describeHostedTokenStatus(
  status: HostedHermesTokenStatus | undefined,
  hasBridge: boolean
): { title: string; detail: string } {
  if (!hasBridge || status?.available === false) {
    return {
      title: 'Secure storage unavailable',
      detail: 'Bearer tokens will not be written to local settings in this runtime.'
    };
  }

  if (!status) {
    return {
      title: 'Checking secure storage',
      detail: 'Token storage status has not loaded yet.'
    };
  }

  if (status.reason === 'corrupt-token-store') {
    return {
      title: 'Stored token needs attention',
      detail: 'Clear the saved token and save it again.'
    };
  }

  if (status.hasToken) {
    return {
      title: 'Saved securely',
      detail: status.updatedAt ? `Last updated ${new Date(status.updatedAt).toLocaleString()}.` : 'A bearer token is saved.'
    };
  }

  return {
    title: 'No saved token',
      detail: 'Enter a hosted bearer token and save it to secure storage.'
  };
}

function confirmLocalDataAction(message: string): boolean {
  return window.confirm(`${message}\n\nThis only changes data stored in this browser profile on this device.`);
}

function createRequestContextId(): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `req-${Date.now()}-${random}`;
}

function buildOcrOverlayRegions(
  mode: LocalSettings['ocrContextMode'],
  profile: OcrRegionProfileSettings,
  activeKey: OcrRegionKey
): Array<{
  key: OcrRegionKey;
  label: string;
  rectangle: OcrRegionProfileSettings['orderPanel'];
  isActive: boolean;
}> {
  if (mode === 'full-window') {
    return [];
  }

  const regions: Array<{
    key: OcrRegionKey;
    label: string;
    rectangle: OcrRegionProfileSettings['orderPanel'];
  }> = [{ key: 'orderPanel', label: 'Order panel', rectangle: profile.orderPanel }];

  if (mode === 'chart-order-panel') {
    regions.push({ key: 'chartZone', label: 'Chart zone', rectangle: profile.chartZone });
  }

  return regions.map((region) => ({
    ...region,
    isActive: activeKey === region.key
  }));
}

function sanitizeNormalizedRegionRect(
  rectangle: OcrRegionProfileSettings['orderPanel']
): OcrRegionProfileSettings['orderPanel'] {
  const left = clampNumber(rectangle.left, 0, 1 - OCR_REGION_MIN_SIZE);
  const top = clampNumber(rectangle.top, 0, 1 - OCR_REGION_MIN_SIZE);
  const width = clampNumber(rectangle.width, OCR_REGION_MIN_SIZE, 1 - left);
  const height = clampNumber(rectangle.height, OCR_REGION_MIN_SIZE, 1 - top);

  return {
    left: roundNormalized(left),
    top: roundNormalized(top),
    width: roundNormalized(width),
    height: roundNormalized(height)
  };
}

function toNormalizedPointerPosition(
  image: HTMLImageElement,
  clientX: number,
  clientY: number
): { left: number; top: number } | undefined {
  const bounds = image.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return undefined;
  }

  const left = clampNumber((clientX - bounds.left) / bounds.width, 0, 1);
  const top = clampNumber((clientY - bounds.top) / bounds.height, 0, 1);

  return {
    left: roundNormalized(left),
    top: roundNormalized(top)
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function roundNormalized(value: number): number {
  return Math.round(value * 10000) / 10000;
}

type DataSharingProfile = {
  title: string;
  description: string;
  className: string;
  scope: DataSharingScope;
  requiresRemoteConsent: boolean;
};

function buildHermesRequestPreview(input: {
  connection: HermesConnectionSettings;
  selectedWindow: WindowSourceOption;
  memoryContext: MemoryContext;
  privacy: LocalSettings['privacy'];
  monitoringContext?: JournalMonitoringMetadata;
}): HermesRequestPreview {
  const { connection, memoryContext, privacy, monitoringContext } = input;
  const profile = inferDataSharingScope(connection);
  const hasMonitoringContext =
    (monitoringContext?.localWarnings?.length ?? 0) > 0 ||
    (monitoringContext?.warningEvidence?.length ?? 0) > 0 ||
    (monitoringContext?.signals?.length ?? 0) > 0 ||
    (monitoringContext?.sourceQuality?.length ?? 0) > 0;
  const hasMemoryContext =
    memoryContext.matchedPatterns.length > 0 ||
    memoryContext.recentNotes.length > 0 ||
    (memoryContext.postmortemSummaries?.length ?? 0) > 0 ||
    memoryContext.tradeHistorySummary !== undefined ||
    memoryContext.tradeBehaviorStats !== undefined ||
    (memoryContext.personalRules?.matchedRules.length ?? 0) > 0;
  const payloadClasses = ['Question text'];
  const localOnlyClasses: string[] = [];

  if (privacy.preset === 'maximum') {
    payloadClasses.push('Placeholder screenshot', 'Placeholder window metadata');
    localOnlyClasses.push('Real screenshot', 'Window title');
    if (hasMonitoringContext) {
      localOnlyClasses.push('Monitoring summary');
    }
  } else {
    payloadClasses.push('Selected window metadata', 'Screenshot image');
    if (hasMonitoringContext) {
      payloadClasses.push('Monitoring summary');
    }
  }

  if (hasMemoryContext) {
    if (privacy.preset === 'maximum') {
      localOnlyClasses.push('Compact memory context');
    } else {
      payloadClasses.push('Compact memory context');
    }
  }

  const isTextRedactionEnabled =
    privacy.preset === 'maximum' ||
    privacy.redaction.redactAddresses ||
    privacy.redaction.redactBalances ||
    privacy.redaction.redactUsernames ||
    privacy.redaction.redactAmounts;

  if (isTextRedactionEnabled) {
    payloadClasses.push(
      privacy.preset === 'maximum' ? 'Text redaction enabled (maximum privacy)' : 'Text redaction enabled'
    );
  }

  return {
    destinationOrigin: originFromBaseUrl(connection.baseUrl),
    endpointMode: connection.endpointMode,
    dataSharingScope: profile.scope,
    payloadClasses,
    localOnlyClasses,
    requiresRemoteConsent: profile.requiresRemoteConsent
  };
}

function inferDataSharingScope(connection: HermesConnectionSettings): DataSharingProfile {
  const isLocal = isLoopbackEndpoint(connection.baseUrl);

  if (isLocal && connection.connectionKind !== 'hosted') {
    return {
      title: 'Local-first',
      description: 'Local Hermes only; keep sensitive context on your machine.',
      className: 'scope-local',
      scope: 'local-first',
      requiresRemoteConsent: false
    };
  }

  if (connection.connectionKind === 'hosted') {
    return {
      title: 'Hosted',
      description: 'Window data and context are sent to configured hosted Hermes.',
      className: 'scope-hosted',
      scope: 'hosted',
      requiresRemoteConsent: true
    };
  }

  return {
    title: 'Advanced custom endpoint',
    description: 'Requests go to an advanced/custom target you configured.',
    className: 'scope-advanced',
    scope: 'advanced',
    requiresRemoteConsent: !isLocal
  };
}

function isLoopbackEndpoint(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  } catch {
    return false;
  }
}

function originFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}

function resolveDebugEndpoint(connection: HermesConnectionSettings): string {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  if (connection.endpointMode === 'legacy-coach') {
    return `${baseUrl}/coach`;
  }

  if (connection.endpointMode === 'custom') {
    return baseUrl;
  }

  return `${baseUrl}/v1/chat/completions`;
}

function resolveDebugAdapter(connection: HermesConnectionSettings): HermesEndpointMode {
  if (connection.endpointMode === 'auto') {
    return 'openai-chat';
  }

  return connection.endpointMode;
}

function normalizeBaseUrl(baseUrl: string): string {
  try {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
      return trimmed;
    }

    const normalized = new URL(trimmed);
    normalized.hash = '';
    normalized.search = '';
    return normalized.toString().replace(/\/+$/, '');
  } catch {
    return baseUrl.replace(/\/+$/, '');
  }
}

function buildMonitoringMetadata(
  localWarnings: string[],
  monitorSignals: MonitoringSignal[],
  sourceQuality?: SourceQualityFinding[],
  warningEvidence?: WarningEvidenceSummary[]
): JournalMonitoringMetadata {
  return {
    localWarnings,
    ...(warningEvidence
      ? {
          warningEvidence: warningEvidence.slice(0, 12).map((entry) => ({
            warningText: entry.warningText,
            source: entry.source,
            detail: entry.detail,
            confidence: entry.confidence,
            ...(entry.provenance ? { provenance: entry.provenance } : {}),
            ...(entry.detectedAt ? { detectedAt: entry.detectedAt } : {})
          }))
        }
      : {}),
    signals: monitorSignals.slice(0, 8).map((signal) => ({
      source: signal.source,
      kind: signal.kind,
      maskedValue: signal.maskedValue,
      confidence: signal.confidence,
      detectedAt: signal.detectedAt,
      ...(signal.message ? { message: signal.message } : {})
    })),
    ...(sourceQuality
      ? {
          sourceQuality: sourceQuality.slice(0, 6).map((finding) => ({
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

function localRuleWarnings(
  hasMemoryMatch: boolean,
  question: string,
  memoryContext?: MemoryContext
): WarningCandidate[] {
  const normalized = question.toLowerCase().trim();
  const warningCandidates: WarningCandidate[] = [];

  if (!normalized) {
    return warningCandidates;
  }

  if (hasMemoryMatch) {
    warningCandidates.push({
      text: EARLY_ENTRY_WARNING_TEXT,
      evidence: {
        source: 'Personal memory patterns',
        detail: 'Matched prior early-entry behavior with negative outcome notes.',
        confidence: 'medium',
        provenance: 'Local memory'
      }
    });
  }

  if (/(enter now|all-in|ape|immediate|immediately|right now)/.test(normalized)) {
    warningCandidates.push({
      text: 'Immediate-entry question detected; local guardrail suggests avoiding first-tick fills.',
      evidence: {
        source: 'Question parser',
        detail: 'Immediate-entry wording detected in the user question.',
        confidence: 'low',
        provenance: 'Question text'
      }
    });
  }

  const tradeSize = parseTradeSize(normalized);
  const tradeHistorySummary = memoryContext?.tradeHistorySummary;
  const matchingSizeSignal = tradeHistorySummary?.sizeSignals.find((signal) => signal.unit === tradeSize?.unit);
  if (tradeSize && matchingSizeSignal && matchingSizeSignal.sampleCount > 1) {
    const normalizedMax = matchingSizeSignal.maxSize > 0 ? matchingSizeSignal.maxSize : matchingSizeSignal.medianSize;
    if (tradeSize.value >= normalizedMax * 1.5) {
      warningCandidates.push({
        text: `Proposed size ${tradeSize.value.toFixed(2)} ${tradeSize.unit.toUpperCase()} exceeds your recent size envelope.`,
        evidence: {
          source: 'Trade-history summary',
          detail: `Your recent ${tradeSize.unit.toUpperCase()} median is ${matchingSizeSignal.medianSize.toFixed(2)} with max ${matchingSizeSignal.maxSize.toFixed(
            2
          )} across ${matchingSizeSignal.sampleCount} logged trades.`,
          confidence: 'medium',
          provenance: 'Local history'
        }
      });
    }
  }

  if ((tradeHistorySummary?.recentLossStreak ?? 0) >= 3) {
    warningCandidates.push({
      text: 'Recent loss streak warning: recent logged outcomes show repeated losses, use confirmation before new entries.',
      evidence: {
        source: 'Trade-history summary',
        detail: `Your latest logged trades include ${tradeHistorySummary?.recentLossStreak} losses in a row.`,
        confidence: 'low',
        provenance: 'Local history'
      }
    });
  }

  return warningCandidates;
}

function toLocalWarningCandidate(input: { text: string; evidence: WarningEvidenceEntry }): WarningCandidate {
  return {
    text: input.text,
    evidence: input.evidence
  };
}

function buildLocalWarningCards(input: {
  ruleWarnings: WarningCandidate[];
  sourceQualityWarnings: Array<{ warning: string; finding: SourceQualityFinding }>;
}): WarningCard[] {
  const cards = new Map<string, WarningCard>();
  const evidenceKeys = new Map<string, Set<string>>();

  for (const warning of input.ruleWarnings) {
    const card = cards.get(warning.text) ?? { text: warning.text, evidences: [] };
    const key = buildEvidenceKey(warning.text, warning.evidence);
    const set = evidenceKeys.get(warning.text) ?? new Set<string>();

    if (!set.has(key)) {
      card.evidences.push(warning.evidence);
      set.add(key);
      evidenceKeys.set(warning.text, set);
      cards.set(warning.text, card);
    }
  }

  for (const { warning, finding } of input.sourceQualityWarnings) {
    if (!warning || !finding) {
      continue;
    }

    const evidence: WarningEvidenceEntry = {
      source: `Source-quality signal (${finding.category})`,
      detail: finding.tokenHint ? `${finding.reason}: ${shortenTokenHint(finding.tokenHint)}` : finding.reason,
      confidence: finding.confidence,
      provenance: finding.provenance,
      ...(finding.detectedAt ? { detectedAt: finding.detectedAt } : {})
    };

    const card = cards.get(warning) ?? { text: warning, evidences: [] };
    const key = buildEvidenceKey(warning, evidence);
    const set = evidenceKeys.get(warning) ?? new Set<string>();

    if (!set.has(key)) {
      card.evidences.push(evidence);
      set.add(key);
      evidenceKeys.set(warning, set);
      cards.set(warning, card);
    }
  }

  const result = Array.from(cards.values()).map((card) => ({
    text: card.text,
    evidences: card.evidences
      .slice()
      .sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence))
  }));

  return result.sort((left, right) => left.text.localeCompare(right.text));
}

function buildEvidenceKey(warningText: string, evidence: WarningEvidenceEntry): string {
  return `${warningText}|${evidence.source}|${evidence.detail}|${evidence.confidence}`;
}

function shortenTokenHint(tokenHint: string, maximum = 16): string {
  if (tokenHint.length <= maximum) {
    return tokenHint;
  }

  return `${tokenHint.slice(0, 6)}…${tokenHint.slice(-5)}`;
}

function confidenceRank(confidence: SourceQualityConfidence): number {
  if (confidence === 'high') {
    return 3;
  }
  if (confidence === 'medium') {
    return 2;
  }

  return 1;
}

function isLowConfidenceEvidence(confidence: SourceQualityConfidence): boolean {
  return confidence === 'low';
}

function formatEvidenceConfidence(confidence: SourceQualityConfidence): string {
  return `Confidence: ${confidence}`;
}

function sourceCategoryLabel(category: SourceCategory): string {
  const option = SOURCE_CATEGORY_OPTIONS.find((entry) => entry.value === category);
  return option?.label ?? category;
}

function formatWarningDetectedAt(detectedAt: string): string {
  const parsed = new Date(detectedAt);
  if (Number.isNaN(parsed.valueOf())) {
    return detectedAt;
  }

  return parsed.toLocaleString();
}

function buildFrictionDecision(actionLabel: string, note?: string): string {
  if (note) {
    return `${actionLabel}. Note: ${note}`;
  }

  return `${actionLabel}.`;
}
