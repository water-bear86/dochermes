import type { ReactElement } from 'react';

import type {
  HermesConnectionKind,
  HermesConnectionReport,
  HermesConnectionSettings,
  HermesEndpointMode,
  HostedHermesTokenStatus
} from '../shared/types';

interface HostedTokenStatusText {
  title: string;
  detail: string;
}

interface GatewaySettingsPanelProps {
  connection: HermesConnectionSettings;
  usesSecureHostedTokenStore: boolean;
  hostedTokenDraft: string;
  hostedTokenStatus?: HostedHermesTokenStatus;
  hostedTokenStatusText: HostedTokenStatusText;
  hostedTokenMessage: string;
  hostedTokenBusy: boolean;
  testingConnection: boolean;
  connectionReport?: HermesConnectionReport;
  copiedReport: boolean;
  onConnectionChange: (updates: Partial<HermesConnectionSettings>) => void;
  onConnectionKindChange: (connectionKind: HermesConnectionKind) => void;
  onHostedTokenDraftChange: (value: string) => void;
  onSaveHostedToken: () => void;
  onClearHostedToken: () => void;
  onTestConnection: () => void;
  onCopyDebugReport: () => void;
}

export function GatewaySettingsPanel({
  connection,
  usesSecureHostedTokenStore,
  hostedTokenDraft,
  hostedTokenStatus,
  hostedTokenStatusText,
  hostedTokenMessage,
  hostedTokenBusy,
  testingConnection,
  connectionReport,
  copiedReport,
  onConnectionChange,
  onConnectionKindChange,
  onHostedTokenDraftChange,
  onSaveHostedToken,
  onClearHostedToken,
  onTestConnection,
  onCopyDebugReport
}: GatewaySettingsPanelProps): ReactElement {
  return (
    <>
      <div className="settings-section-heading settings-wide">
        <span className="label">Gateway</span>
        <small>Connect DocHermes to your Hermes gateway and test route compatibility.</small>
      </div>
      <label htmlFor="connection-kind">Hermes gateway</label>
      <select
        id="connection-kind"
        value={connection.connectionKind}
        onChange={(event) => onConnectionKindChange(event.target.value as HermesConnectionKind)}
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
        value={connection.baseUrl}
        onChange={(event) =>
          onConnectionChange({
            baseUrl: event.target.value
          })
        }
        spellCheck={false}
      />

      <label htmlFor="bearer-token">{usesSecureHostedTokenStore ? 'Hosted bearer token' : 'Bearer token'}</label>
      <input
        id="bearer-token"
        type="password"
        value={usesSecureHostedTokenStore ? hostedTokenDraft : connection.bearerToken}
        placeholder={
          usesSecureHostedTokenStore
            ? hostedTokenStatus?.hasToken
              ? 'Saved securely. Enter a new token to replace it.'
              : 'Enter a token, then save it securely'
            : connection.connectionKind === 'custom'
              ? 'Session-only for custom gateways in this beta'
              : 'Only if your local Hermes gateway requires one'
        }
        onChange={(event) => {
          if (usesSecureHostedTokenStore) {
            onHostedTokenDraftChange(event.target.value);
            return;
          }

          onConnectionChange({
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
            <button type="button" onClick={onSaveHostedToken} disabled={hostedTokenBusy || !hostedTokenDraft.trim()}>
              {hostedTokenBusy ? 'Saving...' : 'Save token'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onClearHostedToken}
              disabled={
                hostedTokenBusy ||
                (!hostedTokenStatus?.hasToken &&
                  !connection.bearerToken &&
                  hostedTokenStatus?.reason !== 'corrupt-token-store')
              }
            >
              Clear token
            </button>
          </div>
        </div>
      ) : null}

      <div className="button-row settings-wide">
        <button type="button" onClick={onTestConnection} disabled={testingConnection}>
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
          <button type="button" onClick={onCopyDebugReport}>
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
            value={connection.endpointMode}
            onChange={(event) =>
              onConnectionChange({
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
            value={connection.modelId}
            onChange={(event) =>
              onConnectionChange({
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
    </>
  );
}
