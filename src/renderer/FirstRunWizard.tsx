import { useCallback, useMemo, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react';

import type {
  CoachBridgeApi,
  HermesConnectionKind,
  HermesConnectionReport,
  LocalSettings,
  WindowSourceOption
} from '../shared/types';

interface FirstRunWizardProps {
  bridge?: CoachBridgeApi;
  settings: LocalSettings;
  onSettingsChange: Dispatch<SetStateAction<LocalSettings>>;
  onComplete: () => void;
}

type WizardStep = 'welcome' | 'gateway' | 'pairing' | 'ready';

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'welcome', label: 'Privacy' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'pairing', label: 'Window' },
  { id: 'ready', label: 'Ready' }
];

const CONNECTION_KIND_OPTIONS: Array<{ value: HermesConnectionKind; label: string }> = [
  { value: 'local', label: 'Local gateway' },
  { value: 'hosted', label: 'Hosted gateway' },
  { value: 'custom', label: 'Custom gateway' }
];

export function FirstRunWizard({
  bridge,
  settings,
  onSettingsChange,
  onComplete
}: FirstRunWizardProps): ReactElement {
  const [stepIndex, setStepIndex] = useState(0);
  const [sources, setSources] = useState<WindowSourceOption[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionReport, setConnectionReport] = useState<HermesConnectionReport | undefined>();
  const [wizardError, setWizardError] = useState('');
  const [tokenStorageMessage, setTokenStorageMessage] = useState('');

  const currentStep = STEPS[stepIndex];
  const selectedSourceId = settings.pairedWindow?.id;
  const canGoBack = stepIndex > 0;
  const isLastStep = stepIndex === STEPS.length - 1;
  const isHostedConnection = settings.connection.connectionKind === 'hosted';

  const gatewaySummary = useMemo(() => {
    if (!connectionReport) {
      return 'No gateway test has run yet.';
    }

    return connectionReport.summary;
  }, [connectionReport]);

  const updateConnection = useCallback(
    (patch: Partial<LocalSettings['connection']>) => {
      onSettingsChange((current) => ({
        ...current,
        connection: {
          ...current.connection,
          ...patch
        }
      }));
      setConnectionReport(undefined);
      setWizardError('');
      setTokenStorageMessage('');
    },
    [onSettingsChange]
  );

  const loadSources = useCallback(async () => {
    if (!bridge) {
      setWizardError('DocHermes must be run from the desktop app to list trading windows.');
      return;
    }

    setIsLoadingSources(true);
    setWizardError('');

    try {
      const nextSources = await bridge.listWindowSources();
      setSources(nextSources);
      if (nextSources.length === 0) {
        setWizardError('No capturable windows were found. Open your trading platform and check screen recording permissions.');
      }
    } catch (error) {
      setWizardError(readError(error));
    } finally {
      setIsLoadingSources(false);
    }
  }, [bridge]);

  const testConnection = useCallback(async () => {
    if (!bridge) {
      setWizardError('DocHermes must be run from the desktop app to test the Hermes gateway.');
      return;
    }

    setIsTestingConnection(true);
    setWizardError('');
    setTokenStorageMessage('');

    try {
      const token = settings.connection.bearerToken.trim();
      if (isHostedConnection && token) {
        const tokenStatus = await bridge.saveHostedHermesToken({ token });
        if (!tokenStatus.available || !tokenStatus.hasToken) {
          setWizardError('Secure storage is unavailable. Hosted bearer token was not saved.');
          return;
        }
        setTokenStorageMessage('Hosted bearer token saved to secure storage.');
      }

      const report = await bridge.testHermesConnection(settings.connection);
      setConnectionReport(report);

      if ((report.status === 'connected' || report.status === 'degraded') && report.effectiveConnection) {
        onSettingsChange((current) => ({
          ...current,
          connection: report.effectiveConnection ?? current.connection
        }));
      }
    } catch (error) {
      setWizardError(readError(error));
    } finally {
      setIsTestingConnection(false);
    }
  }, [bridge, isHostedConnection, onSettingsChange, settings.connection]);

  const selectSource = useCallback(
    (source: WindowSourceOption) => {
      onSettingsChange((current) => ({
        ...current,
        pairedWindow: {
          id: source.id,
          name: source.name,
          kind: source.kind
        }
      }));
      setWizardError('');
    },
    [onSettingsChange]
  );

  const goNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
      return;
    }

    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
    setWizardError('');
  }, [isLastStep, onComplete]);

  const goBack = useCallback(() => {
    setStepIndex((current) => Math.max(current - 1, 0));
    setWizardError('');
  }, []);

  const skipSetupForTesting = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <main className="shell first-run-shell">
      <header className="topbar">
        <div>
          <h1>Set up Hermes Coach</h1>
          <p>Pair the advisor before your first capture</p>
        </div>
        <span className="status" role="status" aria-live="polite" aria-atomic="true">
          First run
        </span>
      </header>

      <section className="first-run-panel" aria-label="First-run setup wizard">
        <ol className="wizard-steps" aria-label="Setup steps">
          {STEPS.map((step, index) => (
            <li
              className={`${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'done' : ''}`}
              key={step.id}
            >
              <span>{index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>

        <div className="wizard-card">
          {currentStep.id === 'welcome' ? (
            <section className="wizard-step-content" aria-label="Privacy promise">
              <span className="label">Advisory boundary</span>
              <h2>DocHermes observes only what you choose and never controls funds.</h2>
              <p>
                The coach can inspect an explicitly selected trading window and ask your Hermes gateway for risk guidance.
                It does not place trades, route swaps, sign transactions, request private keys, control wallets, or execute
                orders.
              </p>
              <ul className="wizard-boundary-list">
                <li>No wallet control, seed phrases, private keys, approvals, withdrawals, or signing.</li>
                <li>No order routing or trade execution. You decide and act in your trading platform.</li>
                <li>Window capture is tied to the source you select, and privacy presets still control what leaves this app.</li>
              </ul>
            </section>
          ) : null}

          {currentStep.id === 'gateway' ? (
            <section className="wizard-step-content" aria-label="Hermes gateway setup">
              <span className="label">Hermes gateway</span>
              <h2>Connect the local coach to your Hermes gateway.</h2>
              <p>
                DocHermes is model agnostic. It sends coach requests to Hermes; Hermes handles providers, models, and
                routing.
              </p>
              <div className="wizard-form-grid">
                <label>
                  Gateway type
                  <select
                    value={settings.connection.connectionKind}
                    onChange={(event) =>
                      updateConnection({
                        connectionKind: event.target.value as HermesConnectionKind,
                        ...(event.target.value === 'local' ? {} : { bearerToken: '' })
                      })
                    }
                  >
                    {CONNECTION_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Gateway URL
                  <input
                    type="url"
                    value={settings.connection.baseUrl}
                    onChange={(event) => updateConnection({ baseUrl: event.target.value })}
                    placeholder="http://localhost:8642"
                  />
                </label>
                <label className="wizard-wide-field">
                  {isHostedConnection ? 'Hosted bearer token' : 'Bearer token'}
                  <input
                    type="password"
                    value={settings.connection.bearerToken}
                    onChange={(event) => updateConnection({ bearerToken: event.target.value })}
                    placeholder="Optional"
                  />
                  <small>
                    {isHostedConnection
                      ? 'Saved to secure storage when you test the gateway.'
                      : settings.connection.connectionKind === 'custom'
                        ? 'Custom bearer tokens are session-only in this beta.'
                        : 'Optional for local development gateways.'}
                  </small>
                </label>
              </div>
              {tokenStorageMessage ? <p className="wizard-helper">{tokenStorageMessage}</p> : null}
              <div
                className={`wizard-check ${connectionReport ? connectionReport.status : ''}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <div>
                  <strong>{connectionReport ? `Gateway ${connectionReport.status}` : 'Gateway not tested'}</strong>
                  <small>{gatewaySummary}</small>
                </div>
                <button type="button" onClick={testConnection} disabled={isTestingConnection}>
                  {isTestingConnection ? 'Testing...' : 'Test gateway'}
                </button>
              </div>
            </section>
          ) : null}

          {currentStep.id === 'pairing' ? (
            <section className="wizard-step-content" aria-label="Trading-window pairing">
              <span className="label">Trading window</span>
              <h2>Choose the window DocHermes may inspect when you ask for guidance.</h2>
              <p>
                Pairing stores the window name and source id for local capture. It does not grant trade execution or wallet
                access.
              </p>
              <div className="wizard-check">
                <div>
                  <strong>{settings.pairedWindow ? settings.pairedWindow.name : 'No window paired yet'}</strong>
                  <small>{settings.pairedWindow ? settings.pairedWindow.kind : 'Open your trading platform, then refresh.'}</small>
                </div>
                <button type="button" onClick={loadSources} disabled={isLoadingSources}>
                  {isLoadingSources ? 'Loading...' : sources.length > 0 ? 'Refresh windows' : 'List windows'}
                </button>
              </div>
              {sources.length > 0 ? (
                <div className="source-list wizard-source-list">
                  {sources.map((source) => (
                    <button
                      type="button"
                      className={`source-option ${selectedSourceId === source.id ? 'selected' : ''}`}
                      key={source.id}
                      onClick={() => selectSource(source)}
                    >
                      <img src={source.thumbnailDataUrl} alt="" />
                      <span>{source.name}</span>
                      <small>{source.kind}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {currentStep.id === 'ready' ? (
            <section className="wizard-step-content" aria-label="Ready to finish setup">
              <span className="label">Ready</span>
              <h2>Setup can be completed now.</h2>
              <p>
                The main coach opens after setup is marked complete. You can still change the Hermes gateway, privacy mode,
                advisory settings, and paired window later from the coach UI.
              </p>
              <div className="wizard-ready-grid">
                <div>
                  <strong>Hermes gateway</strong>
                  <small>{connectionReport ? connectionReport.status : 'Not tested in this run'}</small>
                </div>
                <div>
                  <strong>Trading window</strong>
                  <small>{settings.pairedWindow?.name ?? 'Not paired yet'}</small>
                </div>
                <div>
                  <strong>Product boundary</strong>
                  <small>Advisory-only. No signing, routing, wallet control, private keys, or trade execution.</small>
                </div>
              </div>
            </section>
          ) : null}

          {wizardError ? <section className="message error wizard-error">{wizardError}</section> : null}

          <div className="wizard-actions">
            <button type="button" className="ghost" onClick={skipSetupForTesting}>
              Skip for dev/testing
            </button>
            <div>
              <button type="button" onClick={goBack} disabled={!canGoBack}>
                Back
              </button>
              <button type="button" className="primary" onClick={goNext}>
                {isLastStep ? 'Finish setup' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
