import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { HermesConnectionReport, HermesConnectionSettings } from '../shared/types';
import { GatewaySettingsPanel } from './GatewaySettingsPanel';

const localConnection: HermesConnectionSettings = {
  connectionKind: 'local',
  endpointMode: 'auto',
  baseUrl: 'http://localhost:8642',
  modelId: 'hermes-agent',
  bearerToken: ''
};

const connectedReport: HermesConnectionReport = {
  status: 'connected',
  activeAdapter: 'openai-chat',
  textCapable: true,
  imageCapable: true,
  models: ['hermes-agent', 'coach-v1'],
  attempts: [],
  summary: 'Gateway is ready.',
  debugReport: 'Hermes gateway debug report'
};

const noopProps = {
  onConnectionChange: vi.fn(),
  onConnectionKindChange: vi.fn(),
  onHostedTokenDraftChange: vi.fn(),
  onSaveHostedToken: vi.fn(),
  onClearHostedToken: vi.fn(),
  onTestConnection: vi.fn(),
  onCopyDebugReport: vi.fn()
};

describe('GatewaySettingsPanel', () => {
  it('renders local gateway settings without hosted token storage', () => {
    const markup = renderToStaticMarkup(
      <GatewaySettingsPanel
        connection={localConnection}
        usesSecureHostedTokenStore={false}
        hostedTokenDraft=""
        hostedTokenStatusText={{ title: 'No saved token', detail: 'No hosted token needed.' }}
        hostedTokenMessage=""
        hostedTokenBusy={false}
        testingConnection={false}
        copiedReport={false}
        {...noopProps}
      />
    );

    expect(markup).toContain('Gateway');
    expect(markup).toContain('DocHermes connects to the Hermes gateway only');
    expect(markup).toContain('http://localhost:8642');
    expect(markup).toContain('Only if your local Hermes gateway requires one');
    expect(markup).toContain('Test gateway');
    expect(markup).not.toContain('Token storage');
  });

  it('renders hosted secure-token storage controls', () => {
    const markup = renderToStaticMarkup(
      <GatewaySettingsPanel
        connection={{
          ...localConnection,
          connectionKind: 'hosted',
          bearerToken: 'saved-token'
        }}
        usesSecureHostedTokenStore
        hostedTokenDraft=""
        hostedTokenStatus={{
          available: true,
          hasToken: true,
          updatedAt: '2026-05-25T10:00:00.000Z'
        }}
        hostedTokenStatusText={{ title: 'Saved securely', detail: 'A bearer token is saved.' }}
        hostedTokenMessage="Bearer token saved to secure storage."
        hostedTokenBusy={false}
        testingConnection={false}
        copiedReport={false}
        {...noopProps}
      />
    );

    expect(markup).toContain('Hosted bearer token');
    expect(markup).toContain('Saved securely. Enter a new token to replace it.');
    expect(markup).toContain('Token storage');
    expect(markup).toContain('Bearer token saved to secure storage.');
    expect(markup).toContain('Save token');
    expect(markup).toContain('Clear token');
  });

  it('renders connection diagnostics and copied report state', () => {
    const markup = renderToStaticMarkup(
      <GatewaySettingsPanel
        connection={localConnection}
        usesSecureHostedTokenStore={false}
        hostedTokenDraft=""
        hostedTokenStatusText={{ title: 'No saved token', detail: 'No hosted token needed.' }}
        hostedTokenMessage=""
        hostedTokenBusy={false}
        testingConnection={false}
        connectionReport={connectedReport}
        copiedReport
        {...noopProps}
      />
    );

    expect(markup).toContain('Gateway is ready.');
    expect(markup).toContain('Status: connected');
    expect(markup).toContain('openai-chat');
    expect(markup).toContain('Text route OK');
    expect(markup).toContain('Image route OK');
    expect(markup).toContain('2 discovered route/profiles');
    expect(markup).toContain('Hermes gateway debug report');
    expect(markup).toContain('Copied');
  });

  it('renders advanced compatibility settings', () => {
    const markup = renderToStaticMarkup(
      <GatewaySettingsPanel
        connection={{
          ...localConnection,
          endpointMode: 'custom',
          modelId: 'custom-route'
        }}
        usesSecureHostedTokenStore={false}
        hostedTokenDraft=""
        hostedTokenStatusText={{ title: 'No saved token', detail: 'No hosted token needed.' }}
        hostedTokenMessage=""
        hostedTokenBusy={false}
        testingConnection={false}
        copiedReport={false}
        {...noopProps}
      />
    );

    expect(markup).toContain('Advanced gateway compatibility');
    expect(markup).toContain('Exact custom endpoint');
    expect(markup).toContain('Route/profile token');
    expect(markup).toContain('custom-route');
    expect(markup).toContain('The active provider and model still live in Hermes.');
  });
});
