import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';

import type { AskHermesInput, CoachBridgeApi, WindowSourceOption } from '../shared/types';

declare global {
  interface Window {
    hermesCoach?: CoachBridgeApi & {
      onOpenWindowPicker: (callback: () => void) => () => void;
    };
  }
}

type RequestState = 'idle' | 'loading-sources' | 'capturing' | 'asking';

const DEFAULT_GATEWAY_URL = 'http://localhost:8787/coach';

export function App(): ReactElement {
  const [gatewayUrl, setGatewayUrl] = useState(() => localStorage.getItem('hermes.gatewayUrl') ?? DEFAULT_GATEWAY_URL);
  const [question, setQuestion] = useState('');
  const [sources, setSources] = useState<WindowSourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<WindowSourceOption | undefined>();
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | undefined>();
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [pickerOpen, setPickerOpen] = useState(false);
  const bridge = window.hermesCoach;

  const hasQuestion = question.trim().length > 0;
  const canAsk = requestState === 'idle' && hasQuestion && Boolean(bridge);
  const selectedLabel = selectedSource ? `${selectedSource.name} (${selectedSource.kind})` : 'No trading window selected';

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
    localStorage.setItem('hermes.gatewayUrl', gatewayUrl);
  }, [gatewayUrl]);

  useEffect(() => {
    if (!bridge) {
      return undefined;
    }

    return bridge.onOpenWindowPicker(() => {
      void loadSources();
    });
  }, [bridge, loadSources]);

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
        gatewayUrl,
        question,
        screenshotDataUrl: capture,
        selectedWindow: selectedSource
      };
      const answer = await bridge.askHermes(request);
      setResponse(answer);
    } catch (nextError) {
      setError(readError(nextError));
    } finally {
      setRequestState('idle');
    }
  }, [gatewayUrl, hasQuestion, loadSources, question, selectedSource]);

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
        <label htmlFor="gateway">Hermes Docker gateway</label>
        <input
          id="gateway"
          value={gatewayUrl}
          onChange={(event) => setGatewayUrl(event.target.value)}
          spellCheck={false}
        />

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
