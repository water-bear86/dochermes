import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';

import type {
  AskHermesInput,
  CoachBridgeApi,
  HermesConnectionKind,
  HermesConnectionReport,
  HermesEndpointMode,
  LocalSettings,
  WindowSourceOption
} from '../shared/types';
import { appendJournalEntry, buildJournalEntry, readJournalEntries } from './journal';
import { readLocalSettings, writeLocalSettings } from './localSettings';
import { buildMemoryContext } from './memoryContext';

declare global {
  interface Window {
    hermesCoach?: CoachBridgeApi & {
      onOpenWindowPicker: (callback: () => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
    };
  }
}

type RequestState = 'idle' | 'loading-sources' | 'capturing' | 'asking';

export function App(): ReactElement {
  const [settings, setSettings] = useState<LocalSettings>(() => readLocalSettings(localStorage));
  const [question, setQuestion] = useState('');
  const [sources, setSources] = useState<WindowSourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<WindowSourceOption | undefined>();
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bridge = window.hermesCoach;

  const hasQuestion = question.trim().length > 0;
  const canAsk = requestState === 'idle' && hasQuestion && Boolean(bridge);
  const selectedLabel = selectedSource ? `${selectedSource.name} (${selectedSource.kind})` : 'No trading window selected';
  const memoryContext = useMemo(() => buildMemoryContext(journalEntries, question), [journalEntries, question]);

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

  const loadSources = useCallback(async () => {
    if (!bridge) {
      setError('Hermes Coach must be run from the desktop add-on to capture windows.');
      return;
    }

    setError('');
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
  }, [bridge, settings]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onOpenWindowPicker(() => {
      void loadSources();
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

  const askCoach = useCallback(async () => {
    if (!hasQuestion) {
      setError('Ask a question before sending a capture to Hermes.');
      return;
    }

    if (!bridge) {
      setError('Hermes Coach must be run from the desktop add-on to capture windows.');
      return;
    }

    if (!selectedSource) {
      setError('Choose the trading window to inspect first.');
      await loadSources();
      return;
    }

    setError('');
    setResponse('');
    setRequestState('capturing');

    try {
      const capture = await bridge.captureWindowSource(selectedSource.id);
      setScreenshotDataUrl(capture);
      setRequestState('asking');

      const request: AskHermesInput = {
        connection: settings.connection,
        question,
        screenshotDataUrl: capture,
        selectedWindow: selectedSource,
        memoryContext
      };
      const answer = await bridge.askHermes(request);
      setResponse(answer);
      setJournalSavedMessage('');
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setRequestState('idle');
    }
  }, [bridge, hasQuestion, loadSources, memoryContext, question, selectedSource, settings.connection]);

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
      screenshotCaptured: Boolean(screenshotDataUrl)
    });
    const nextEntries = appendJournalEntry(localStorage, entry);
    setJournalEntries(nextEntries);
    setJournalSavedMessage('Saved to local journal.');
    setJournalNotes('');
  }, [journalNotes, question, response, screenshotDataUrl, selectedSource]);

  const statusText = useMemo(() => {
    switch (requestState) {
      case 'loading-sources':
        return 'Reading available windows';
      case 'capturing':
        return 'Capturing selected window';
      case 'asking':
        return 'Sending context to Hermes';
      default:
        return selectedSource ? 'Ready' : 'Window selection required';
    }
  }, [requestState, selectedSource]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Hermes Coach</h1>
          <p>Risk and execution coach</p>
        </div>
        <span className="status">{statusText}</span>
      </header>

      <section className="control-strip" aria-label="Trading window selection">
        <div>
          <span className="label">Capture target</span>
          <strong>{selectedLabel}</strong>
        </div>
        <button type="button" onClick={loadSources} disabled={requestState !== 'idle'}>
          Select
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

      {pickerOpen ? (
        <section className="window-picker" aria-label="Available windows">
          <div className="section-heading">
            <h2>Choose the trading window to inspect</h2>
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
                  setSelectedSource(source);
                  setPickerOpen(false);
                  setError('');
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
