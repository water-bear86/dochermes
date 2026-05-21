import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import type {
  AskHermesInput,
  MemoryContext,
  JournalMonitoringMetadata,
  CoachBridgeApi,
  HermesConnectionSettings,
  HermesConnectionKind,
  HermesConnectionReport,
  HermesEndpointMode,
  HermesConnectionStatus,
  LocalSettings,
  MonitoringSignal,
  MonitoringStatus,
  WindowSourceOption
} from '../shared/types';
import { appendJournalEntry, buildJournalEntry, readJournalEntries } from './journal';
import {
  appendWarningFeedback,
  deleteWarningFeedback,
  readWarningFeedbackEntries,
  updateWarningFeedback,
  type WarningFeedbackAction,
  type WarningFeedbackRecord
} from './warningFeedback';
import { readLocalSettings, writeLocalSettings } from './localSettings';
import { buildMemoryContext } from './memoryContext';

declare global {
  interface Window {
    hermesCoach?: CoachBridgeApi & {
      onOpenWindowPicker: (callback: () => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
      onArmCoach: (callback: (enabled: boolean) => void) => () => void;
      onMonitorSignal: (callback: (signal: MonitoringSignal) => void) => () => void;
      onMonitorStatus: (callback: (status: MonitoringStatus) => void) => () => void;
    };
  }
}

type RequestState = 'idle' | 'loading-sources' | 'capturing' | 'asking';
type PickerMode = 'pair' | 'ask';
type HermesHeartbeatStatus = 'unknown' | HermesConnectionStatus;

type DataSharingScope = 'local-first' | 'hosted' | 'advanced';

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

type FrictionCard = {
  id: string;
  question: string;
  warnings: string[];
  prompts: string[];
};

const HERMES_HEALTH_POLL_MS = 60_000;

export function App(): ReactElement {
  const [settings, setSettings] = useState<LocalSettings>(() => readLocalSettings(localStorage));
  const [question, setQuestion] = useState('');
  const [sources, setSources] = useState<WindowSourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<WindowSourceOption | undefined>(() =>
    settings.pairedWindow ? { ...settings.pairedWindow, thumbnailDataUrl: '' } : undefined
  );
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | undefined>();
  const [response, setResponse] = useState('');
  const [journalNotes, setJournalNotes] = useState('');
  const [journalEntries, setJournalEntries] = useState(() => readJournalEntries(localStorage));
  const [journalSavedMessage, setJournalSavedMessage] = useState('');
  const [connectionReport, setConnectionReport] = useState<HermesConnectionReport | undefined>();
  const [testingConnection, setTestingConnection] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [error, setError] = useState('');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [pickerMode, setPickerMode] = useState<PickerMode>('pair');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [requestMetrics, setRequestMetrics] = useState<{
    captureMs?: number;
    localAnalysisMs?: number;
    hermesMs?: number;
    totalMs?: number;
  } | undefined>();
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
  const [frictionNoteText, setFrictionNoteText] = useState('');
  const validatedPairRef = useRef<string | undefined>(undefined);
  const bridge = window.hermesCoach;

  const hasQuestion = question.trim().length > 0;
  const canAsk = requestState === 'idle' && hasQuestion && Boolean(bridge);
  const selectedLabel = selectedSource ? `${selectedSource.name} (${selectedSource.kind})` : 'No trading window selected';
  const memoryContext = useMemo(
    () => buildMemoryContext(journalEntries, question, warningFeedbackEntries),
    [journalEntries, question, warningFeedbackEntries]
  );
  const connectionScope = useMemo(() => inferDataSharingScope(settings.connection), [settings.connection]);
  const localWarnings = useMemo(
    () => localRiskWarnings(memoryContext.matchedPatterns.length > 0, question),
    [question, memoryContext.matchedPatterns.length]
  );


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
  }, [bridge, settings]);

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
    async (source: WindowSourceOption | undefined, skipRemoteConsent = false) => {
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

      const localWarnings = localRiskWarnings(memoryContext.matchedPatterns.length > 0, question);
      const monitoringSnapshot = buildMonitoringMetadata(localWarnings, monitorSignals);

      const nextPreview = buildHermesRequestPreview({
        connection: settings.connection,
        selectedWindow: source,
        memoryContext,
        privacy: settings.privacy,
        monitoringContext: monitoringSnapshot
      });
      setRequestPreview(nextPreview);

      if (nextPreview.requiresRemoteConsent && !skipRemoteConsent) {
        setPendingRemoteConsent(nextPreview);
        setError('Remote Hermes destination selected. Confirm before sending screenshot.');
        return;
      }

      setPendingRemoteConsent(undefined);
      setError('');
      setResponse('');
      setScreenshotDataUrl(undefined);
      setRequestMetrics(undefined);
      setLastRequestMonitoringMetadata(undefined);
      setRequestState('capturing');

      const totalStart = performance.now();
      const localAnalysisStart = performance.now();
      const localAnalysisMs = Math.round(performance.now() - localAnalysisStart);

      try {
        const isAvailable = await bridge.validateSelectedWindow(source.id);
        if (!isAvailable) {
          throw new Error('The selected trading window is no longer available. Select a window again.');
        }

        const captureStart = performance.now();
        const capture = await bridge.captureWindowSource(source.id);
        const captureMs = Math.round(performance.now() - captureStart);
        setScreenshotDataUrl(capture);
        setRequestState('asking');

        const hermesStart = performance.now();
        const request: AskHermesInput = {
          connection: settings.connection,
          question,
          screenshotDataUrl: capture,
          selectedWindow: source,
          memoryContext,
          monitoringContext: monitoringSnapshot,
          privacy: settings.privacy
        };
        const answer = await bridge.askHermes(request);
        const hermesMs = Math.round(performance.now() - hermesStart);

        if (localWarnings.length > 0) {
          setResponse(`Local risk guardrail: ${localWarnings.join(' ')}\n\n${answer}`);
        } else {
          setResponse(answer);
        }

        setLastRequestMonitoringMetadata(monitoringSnapshot);
        setLastRequestContext({
          id: createRequestContextId(),
          question,
          response: localWarnings.length > 0 ? `Local risk guardrail: ${localWarnings.join(' ')}\n\n${answer}` : answer,
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
          localAnalysisMs,
          captureMs,
          hermesMs,
          totalMs: Math.round(performance.now() - totalStart)
        });
      } catch (nextError) {
        const errorMessage = readError(nextError);

        if (/not available/.test(errorMessage) || /trading window/.test(errorMessage)) {
          setSettings((current) => ({
            ...current,
            pairedWindow: undefined
          }));
          setSelectedSource(undefined);
        }

        setError(errorMessage);
      } finally {
        setRequestState('idle');
      }
    },
    [bridge, memoryContext, monitorSignals, question, settings.connection, settings.privacy]
  );

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
      matchedPatternCount: memoryContext.matchedPatterns.length
    });

    if (nextFrictionCard) {
      setFrictionCard(nextFrictionCard);
      return;
    }

    await askWithSource(selectedSource);
  }, [askWithSource, hasQuestion, localWarnings, loadSources, selectedSource]);

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
      monitoring: lastRequestMonitoringMetadata
    });
    const nextEntries = appendJournalEntry(localStorage, entry);
    setJournalEntries(nextEntries);
    setJournalSavedMessage('Saved to local journal.');
    setJournalNotes('');
  }, [journalNotes, lastRequestMonitoringMetadata, question, response, screenshotDataUrl, selectedSource]);

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
    const nextEntries = deleteWarningFeedback(localStorage, entryId);
    setWarningFeedbackEntries(nextEntries);
    if (editingFeedbackId === entryId) {
      setEditingFeedbackId(undefined);
      setEditingFeedbackAction('followed-plan');
      setEditingFeedbackNotes('');
    }
  }, [editingFeedbackId]);

  const persistFrictionJournalAction = useCallback(
    (actionLabel: string, note?: string) => {
      if (!selectedSource) {
        setError('A trading window is required before saving a friction decision.');
        return;
      }

      const questionContext = question.trim();
      const notes = note?.trim() || '';
      const response = buildFrictionDecision(actionLabel, notes);

      const entry = buildJournalEntry({
        question: questionContext,
        response,
        notes,
        selectedWindow: selectedSource,
        screenshotCaptured: false,
        monitoring: buildMonitoringMetadata(localWarnings, monitorSignals)
      });

      const nextEntries = appendJournalEntry(localStorage, {
        ...entry,
        notes
      });
      setJournalEntries(nextEntries);
      setJournalSavedMessage('Saved to local journal.');
      setFrictionCard(undefined);
      setFrictionNoteText('');
    },
    [localWarnings, monitorSignals, question, selectedSource]
  );

  const proceedWithFrictionAction = useCallback(
    (actionLabel: string, selected: WindowSourceOption, shouldAsk = false) => {
      setError('');
      setFrictionCard(undefined);
      persistFrictionJournalAction(actionLabel, frictionNoteText.trim() || undefined);
      setFrictionNoteText('');

      if (shouldAsk) {
        void askWithSource(selected, true);
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

  const statusText = useMemo(() => {
    switch (requestState) {
      case 'loading-sources':
        return 'Reading available windows';
      case 'capturing':
        return 'Capturing selected window';
      case 'asking':
        return 'Sending context to Hermes';
      default:
        return `${settings.armed ? 'Armed' : 'Paused'} • ${selectedSource ? 'Ready' : 'Window selection required'}`;
    }
  }, [requestState, selectedSource, settings.armed]);

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
        return 'Hermes check-in: model mismatch';
      case 'incompatible':
        return 'Hermes check-in: incompatible';
      default:
        return 'Hermes check-in: checking...';
    }
  }, [hermesHeartbeat.status]);

  const appendSignalToQuestion = useCallback((signal: MonitoringSignal) => {
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
  }, []);

  const clearMonitorSignals = useCallback(() => {
    setMonitorSignals([]);
  }, []);

  const runHermesHeartbeat = useCallback(async () => {
    if (isCheckingHermes) {
      return;
    }

    if (!bridge) {
      return;
    }

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
      setIsCheckingHermes(false);
    }
  }, [bridge, isCheckingHermes, settings.connection]);

  useEffect(() => {
    runHermesHeartbeat();
    const timer = setInterval(() => {
      void runHermesHeartbeat();
    }, HERMES_HEALTH_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [runHermesHeartbeat]);

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
          matchedPatternCount: memoryContext.matchedPatterns.length
        });

        if (nextFrictionCard) {
          setFrictionCard(nextFrictionCard);
          return;
        }

        void askWithSource(nextSource);
      }
    },
    [askWithSource, memoryContext.matchedPatterns.length, localWarnings, pickerMode, question]
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Hermes Coach</h1>
          <p>Risk and execution coach</p>
        </div>
        <span className="status">{statusText}</span>
      </header>
      <section className="control-strip compact-strip" aria-label="Hermes check-in status">
        <div>
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

      <section className="settings-panel" aria-label="Local settings">
        <div className="section-heading compact">
          <h2>Local settings</h2>
          <button type="button" className="ghost" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? 'Hide' : 'Show'}
          </button>
        </div>
        {settingsOpen ? (
          <div className="settings-grid">
            <label htmlFor="connection-kind">Connection</label>
            <select
              id="connection-kind"
              value={settings.connection.connectionKind}
              onChange={(event) =>
                updateConnection({
                  connectionKind: event.target.value as HermesConnectionKind
                })
              }
            >
              <option value="local">Local Hermes</option>
              <option value="hosted">Hosted/remote Hermes</option>
              <option value="custom">Advanced/custom endpoint</option>
            </select>

            <label htmlFor="endpoint-mode">Endpoint mode</label>
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
              <option value="openai-chat">Hermes API Server</option>
              <option value="legacy-coach">Legacy /coach</option>
              <option value="custom">Exact custom endpoint</option>
            </select>
            <div className={`privacy-indicator ${connectionScope.className}`}>
              <span className="label">Data-sharing scope</span>
              <strong>{connectionScope.title}</strong>
              <small>{connectionScope.description}</small>
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
              <option value="maximum">Maximum (no screenshot, local summaries only)</option>
              <option value="balanced">Balanced (window + summaries)</option>
              <option value="full">Full context (full window)</option>
            </select>

            <label className="check-row" htmlFor="redact-addresses">
              <input
                id="redact-addresses"
                type="checkbox"
                checked={settings.privacy.redaction.redactAddresses}
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
                checked={settings.privacy.redaction.redactUsernames}
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
                checked={settings.privacy.redaction.redactBalances}
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
                checked={settings.privacy.redaction.redactAmounts}
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

            <label htmlFor="gateway">Hermes base URL</label>
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

            <label htmlFor="model-id">Model ID</label>
            <input
              id="model-id"
              value={settings.connection.modelId}
              onChange={(event) =>
                updateConnection({
                  modelId: event.target.value
                })
              }
              spellCheck={false}
            />

            <label htmlFor="bearer-token">Bearer token</label>
            <input
              id="bearer-token"
              type="password"
              value={settings.connection.bearerToken}
              placeholder="Required for hosted/public Hermes"
              onChange={(event) =>
                updateConnection({
                  bearerToken: event.target.value
                })
              }
              spellCheck={false}
            />

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
            <p className="subtle-note" role="note">
              {settings.watchOCR
                ? settings.armed
                  ? ocrStatusMessage
                  : 'OCR monitoring waits for armed state.'
                : 'OCR monitoring currently inactive.'}
            </p>
            <button type="button" onClick={testConnection} disabled={testingConnection}>
              {testingConnection ? 'Testing...' : 'Test connection'}
            </button>
            {connectionReport ? (
              <div className={`connection-report ${connectionReport.status}`}>
                <strong>{connectionReport.summary}</strong>
                <small>
                  Status: {connectionReport.status}
                  {connectionReport.activeAdapter ? ` / ${connectionReport.activeAdapter}` : ''}
                </small>
                <div className="capability-row">
                  <span>{connectionReport.textCapable ? 'Text OK' : 'Text failed'}</span>
                  <span>{connectionReport.imageCapable ? 'Image OK' : 'Image failed'}</span>
                  <span>{connectionReport.models.length > 0 ? `${connectionReport.models.length} models` : 'Models unknown'}</span>
                </div>
                <textarea readOnly value={connectionReport.debugReport} aria-label="Copyable Hermes debug report" />
                <button type="button" onClick={copyDebugReport}>
                  {copiedReport ? 'Copied' : 'Copy debug report'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

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
                void askWithSource(selectedSource, true);
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
              Local-only context: {requestPreview.localOnlyClasses.join(' · ')}
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

        <button type="button" className="primary" onClick={askCoach} disabled={!canAsk}>
          Capture and ask
        </button>
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

      {localWarnings.length > 0 ? (
        <section className="message warning">
          <span className="label">Local guardrail</span>
          <ul className="warning-list">
            {localWarnings.map((warning) => (
              <li key={warning}>
                {warning}
                <div className="feedback-button-row">
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning, 'took-it-anyway');
                    }}
                  >
                    I took it anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning, 'skipped');
                    }}
                  >
                    I skipped
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning, 'followed-plan');
                    }}
                  >
                    I followed the plan
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setFeedbackNoteWarning(warning);
                    }}
                  >
                    Add note
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      recordWarningFeedback(warning, 'false-positive');
                    }}
                  >
                    Mark false positive
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
                  <strong>{signal.source}</strong>
                  {signal.message ? `: ${signal.message}` : `: ${signal.maskedValue} (${signal.kind})`}
                </div>
                {signal.source === 'clipboard' ? (
                  <button type="button" className="ghost" onClick={() => appendSignalToQuestion(signal)}>
                    Use
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      {screenshotDataUrl ? (
        <section className="preview" aria-label="Latest screenshot preview">
          <div className="section-heading">
            <h2>Latest capture</h2>
            <span>{selectedSource?.name}</span>
          </div>
          <img src={screenshotDataUrl} alt="Latest selected trading window capture" />
        </section>
      ) : null}

      {error ? (
        <section className="message error" role="alert">
          {error}
        </section>
      ) : null}

      {response ? (
        <section className="message response" aria-label="Hermes response">
          <span className="label">Coach assessment</span>
          <p>{response}</p>
          {requestMetrics ? (
            <small className="timing">
              Local analysis: {requestMetrics.localAnalysisMs ?? 0}ms · Capture: {requestMetrics.captureMs ?? 0}ms · Hermes: {requestMetrics.hermesMs ?? 0}ms ·
              Total: {requestMetrics.totalMs ?? 0}ms
            </small>
          ) : null}
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
        Platform agnostic. No wallet access. No order routing.
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

function createRequestContextId(): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `req-${Date.now()}-${random}`;
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
    (monitoringContext?.localWarnings?.length ?? 0) > 0 || (monitoringContext?.signals?.length ?? 0) > 0;
  const payloadClasses = ['Question text', 'Selected window metadata'];
  const localOnlyClasses: string[] = [];

  if (privacy.preset === 'maximum') {
    payloadClasses.push('Screenshot placeholder (maximum privacy)');
    if (hasMonitoringContext) {
      localOnlyClasses.push('Monitoring summary (local-only)');
    }
  } else {
    payloadClasses.push('Screenshot image');
    if (hasMonitoringContext) {
      payloadClasses.push('Monitoring summary');
    }
  }

  if (memoryContext.matchedPatterns.length > 0 || memoryContext.recentNotes.length > 0) {
    payloadClasses.push('Compact memory context');
  }

  if (
    privacy.redaction.redactAddresses ||
    privacy.redaction.redactBalances ||
    privacy.redaction.redactUsernames ||
    privacy.redaction.redactAmounts
  ) {
    payloadClasses.push('Text redaction enabled');
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

function buildMonitoringMetadata(
  localWarnings: string[],
  monitorSignals: MonitoringSignal[]
): JournalMonitoringMetadata {
  return {
    localWarnings,
    signals: monitorSignals.slice(0, 8).map((signal) => ({
      source: signal.source,
      kind: signal.kind,
      maskedValue: signal.maskedValue,
      confidence: signal.confidence,
      detectedAt: signal.detectedAt,
      ...(signal.message ? { message: signal.message } : {})
    }))
  };
}

function localRiskWarnings(hasMemoryMatch: boolean, question: string): string[] {
  const normalized = question.toLowerCase().trim();
  const warnings: string[] = [];

  if (!normalized) {
    return warnings;
  }

  if (hasMemoryMatch) {
    warnings.push('This setup resembles prior early-entry risk patterns; set confirmation plan before acting.');
  }

  if (/(enter now|all-in|ape|immediate|immediately|right now)/.test(normalized)) {
    warnings.push('Immediate-entry question detected; local guardrail suggests avoiding first-tick fills.');
  }

  return warnings;
}

function buildFrictionCard(input: {
  question: string;
  localWarnings: string[];
  matchedPatternCount: number;
}): FrictionCard | undefined {
  const normalized = input.question.toLowerCase();
  const hasUrgentSignal = /(immediate|right now|all-in|ape|momentum)/.test(normalized);
  const hasHistoricalRiskSignal = input.matchedPatternCount > 0 || input.localWarnings.length > 0;

  if (!hasUrgentSignal && !hasHistoricalRiskSignal) {
    return undefined;
  }

  const prompts = [
    'Why now? What changed in the last 30 seconds that would invalidate this setup?',
    'What confirms you are wrong before entering? What is your invalidation plan?',
    'What is the max loss and first action if that threshold is hit?'
  ];

  return {
    id: createRequestContextId(),
    question: input.question.trim(),
    warnings: [...input.localWarnings],
    prompts: input.matchedPatternCount > 0 ? [...prompts, 'Do you still have session risk budget for this entry?'] : prompts
  };
}

function buildFrictionDecision(actionLabel: string, note?: string): string {
  if (note) {
    return `${actionLabel}. Note: ${note}`;
  }

  return `${actionLabel}.`;
}
