import { describe, expect, it } from 'vitest';

import {
  buildHermesPayload,
  buildOpenAiChatPayload,
  createDebugReport,
  askHermes,
  parseHermesResponse,
  probeHermesConnection,
  resolveHermesEndpoint
} from './hermesClient';
import type { HermesConnectionSettings } from '../shared/types';

describe('resolveHermesEndpoint', () => {
  it('uses OpenAI-compatible chat completions for the default Hermes API server', () => {
    expect(resolveHermesEndpoint(defaultConnection())).toBe('http://localhost:8642/v1/chat/completions');
  });

  it('keeps legacy coach support only in legacy adapter mode', () => {
    expect(resolveHermesEndpoint(defaultConnection({ endpointMode: 'legacy-coach', baseUrl: 'http://localhost:8787' }))).toBe(
      'http://localhost:8787/coach'
    );
  });

  it('keeps an explicit custom endpoint intact', () => {
    expect(resolveHermesEndpoint(defaultConnection({ endpointMode: 'custom', baseUrl: 'https://example.test/api/ask' }))).toBe(
      'https://example.test/api/ask'
    );
  });
});

describe('buildHermesPayload', () => {
  it('builds a platform-agnostic screenshot question payload', () => {
    const payload = buildHermesPayload({
      question: 'Should I enter now?',
      screenshotDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      selectedWindow: {
        id: 'window:42',
        name: 'Trading Terminal',
        kind: 'window',
        thumbnailDataUrl: 'data:image/png;base64,preview'
      }
    });

    expect(payload).toEqual({
      question: 'Should I enter now?',
      screenshot: {
        mimeType: 'image/png',
        dataBase64: 'iVBORw0KGgo='
      },
      selectedWindow: {
        id: 'window:42',
        name: 'Trading Terminal',
        kind: 'window'
      },
      constraints: {
        executionCapability: false,
        platformAgnostic: true,
        captureRequiresUserSelection: true
      }
    });
  });

  it('includes compact personal memory context when provided', () => {
    const payload = buildHermesPayload({
      question: 'Should I enter immediately?',
      screenshotDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      selectedWindow: {
        id: 'window:42',
        name: 'Trading Terminal',
        kind: 'window',
        thumbnailDataUrl: 'data:image/png;base64,preview'
      },
      memoryContext: {
        matchedPatterns: [
          {
            name: 'early-entry-risk',
            evidenceCount: 2,
            summary: 'This resembles prior notes where early entries performed poorly.',
            recommendation: 'Wait for confirmation.'
          }
        ],
        recentNotes: []
      }
    });

    expect(payload.memoryContext).toEqual({
      matchedPatterns: [
        {
          name: 'early-entry-risk',
          evidenceCount: 2,
          summary: 'This resembles prior notes where early entries performed poorly.',
          recommendation: 'Wait for confirmation.'
        }
      ],
      recentNotes: []
    });
  });
});

describe('buildOpenAiChatPayload', () => {
  it('converts screenshot questions into Hermes API Server chat-completion requests', () => {
    const payload = buildOpenAiChatPayload({
      modelId: 'hermes-agent',
      question: 'Should I enter now?',
      screenshotDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      selectedWindow: {
        id: 'window:42',
        name: 'Trading Terminal',
        kind: 'window',
        thumbnailDataUrl: 'data:image/png;base64,preview'
      }
    });

    expect(payload).toEqual({
      model: 'hermes-agent',
      messages: [
        {
          role: 'system',
          content:
            'You are DocHermes, a risk coach for trading workflows. You do not place trades, route orders, access wallets, or provide execution commands. Analyze the selected trading-window screenshot and the user question. Focus on risk, confirmation, invalidation, position sizing discipline, and emotional overtrading.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Should I enter now?\n\nSelected window: Trading Terminal (window)\n\nConstraints:\n- executionCapability: false\n- platformAgnostic: true\n- captureRequiresUserSelection: true'
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgo='
              }
            }
          ]
        }
      ]
    });
  });
});

describe('parseHermesResponse', () => {
  it('accepts answer, response, and message shaped gateway replies', () => {
    expect(parseHermesResponse({ answer: 'Risk: High' })).toBe('Risk: High');
    expect(parseHermesResponse({ response: 'Wait for confirmation.' })).toBe('Wait for confirmation.');
    expect(parseHermesResponse({ message: 'Reject this trade.' })).toBe('Reject this trade.');
  });

  it('accepts OpenAI-style text content when a gateway proxies model output', () => {
    expect(
      parseHermesResponse({
        choices: [
          {
            message: {
              content: 'Use 0.08 SOL max.'
            }
          }
        ]
      })
    ).toBe('Use 0.08 SOL max.');
  });

  it('accepts OpenAI content arrays and Responses-style output text', () => {
    expect(
      parseHermesResponse({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Wait for volume confirmation.'
                }
              ]
            }
          }
        ]
      })
    ).toBe('Wait for volume confirmation.');

    expect(
      parseHermesResponse({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Reduce size.'
              }
            ]
          }
        ]
      })
    ).toBe('Reduce size.');
  });

  it('rejects unknown response shapes with a useful error', () => {
    expect(() => parseHermesResponse({ ok: true })).toThrow('Hermes gateway response did not include readable text');
  });
});

describe('probeHermesConnection', () => {
  it('probes local candidates and reports a connected image-capable OpenAI adapter', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const result = await probeHermesConnection(defaultConnection({ connectionKind: 'local' }), async (url, init) => {
      requests.push({ url: String(url), init });

      if (String(url) === 'http://localhost:8642/health') {
        return jsonResponse({ ok: true });
      }

      if (String(url) === 'http://localhost:8642/v1/models') {
        return jsonResponse({ data: [{ id: 'hermes-agent' }] });
      }

      if (String(url) === 'http://localhost:8642/v1/capabilities') {
        return jsonResponse({ vision: true });
      }

      if (String(url) === 'http://localhost:8642/v1/chat/completions') {
        return jsonResponse({
          choices: [
            {
              message: {
                content: 'pong'
              }
            }
          ]
        });
      }

      return textResponse('not found', 404);
    });

    expect(result.status).toBe('connected');
    expect(result.activeAdapter).toBe('openai-chat');
    expect(result.textCapable).toBe(true);
    expect(result.imageCapable).toBe(true);
    expect(result.models).toEqual(['hermes-agent']);
    expect(result.effectiveConnection).toEqual(defaultConnection({ endpointMode: 'openai-chat' }));
    expect(result.resolvedEndpoint).toBe('http://localhost:8642/v1/chat/completions');
    expect(requests.map((request) => request.url)).toContain('http://localhost:8642/v1/chat/completions');
  });

  it('returns an effective connection for non-default local candidates and asks use it', async () => {
    const probeResult = await probeHermesConnection(defaultConnection(), async (url) => {
      if (!String(url).startsWith('http://127.0.0.1:8642')) {
        return textResponse('not here', 404);
      }

      if (String(url).endsWith('/v1/chat/completions')) {
        return jsonResponse({ choices: [{ message: { content: 'pong' } }] });
      }

      return jsonResponse({});
    });
    const askUrls: string[] = [];

    expect(probeResult.status).toBe('connected');
    expect(probeResult.effectiveConnection?.baseUrl).toBe('http://127.0.0.1:8642');

    await askHermes(
      askInput({
        connection: probeResult.effectiveConnection
      }),
      async (url) => {
        askUrls.push(String(url));
        return jsonResponse({ choices: [{ message: { content: 'answer' } }] });
      }
    );

    expect(askUrls).toEqual(['http://127.0.0.1:8642/v1/chat/completions']);
  });

  it('marks hosted auth failures and masks bearer tokens in debug reports', async () => {
    const result = await probeHermesConnection(
      defaultConnection({
        connectionKind: 'hosted',
        baseUrl: 'https://hermes.example.com',
        bearerToken: 'super-secret-token'
      }),
      async () => textResponse('unauthorized', 401)
    );

    expect(result.status).toBe('auth-error');
    expect(createDebugReport(result, defaultConnection({ bearerToken: 'super-secret-token' }))).not.toContain(
      'super-secret-token'
    );
    expect(createDebugReport(result, defaultConnection({ bearerToken: 'super-secret-token' }))).toContain('Bearer ***');
  });

  it('supports explicit legacy /coach probes', async () => {
    const requests: string[] = [];
    const result = await probeHermesConnection(
      defaultConnection({
        endpointMode: 'legacy-coach',
        baseUrl: 'http://localhost:8787'
      }),
      async (url) => {
        requests.push(String(url));
        return String(url).endsWith('/coach') ? jsonResponse({ answer: 'pong' }) : textResponse('not found', 404);
      }
    );

    expect(result.status).toBe('connected');
    expect(result.activeAdapter).toBe('legacy-coach');
    expect(result.effectiveConnection).toEqual(
      defaultConnection({
        endpointMode: 'legacy-coach',
        baseUrl: 'http://localhost:8787'
      })
    );
    expect(requests).toContain('http://localhost:8787/coach');
  });

  it('returns an effective legacy connection when auto mode falls back to /coach', async () => {
    const result = await probeHermesConnection(defaultConnection(), async (url) => {
      return String(url) === 'http://localhost:8787/coach'
        ? jsonResponse({ answer: 'pong' })
        : textResponse('not found', 404);
    });

    expect(result.status).toBe('connected');
    expect(result.activeAdapter).toBe('legacy-coach');
    expect(result.effectiveConnection?.baseUrl).toBe('http://localhost:8787');
    expect(result.effectiveConnection?.endpointMode).toBe('legacy-coach');
  });

  it('supports exact custom endpoint probes', async () => {
    const requests: string[] = [];
    const result = await probeHermesConnection(
      defaultConnection({
        endpointMode: 'custom',
        connectionKind: 'custom',
        baseUrl: 'https://example.test/custom-hermes'
      }),
      async (url) => {
        requests.push(String(url));
        return jsonResponse({ response: 'pong' });
      }
    );

    expect(result.status).toBe('connected');
    expect(result.activeAdapter).toBe('custom');
    expect(result.effectiveConnection?.baseUrl).toBe('https://example.test/custom-hermes');
    expect(requests).toContain('https://example.test/custom-hermes');
  });

  it('reports degraded text-only mode when image input fails', async () => {
    let chatCalls = 0;
    const result = await probeHermesConnection(defaultConnection(), async (url) => {
      if (!String(url).endsWith('/v1/chat/completions')) {
        return jsonResponse({});
      }

      chatCalls += 1;
      return chatCalls === 1
        ? jsonResponse({ choices: [{ message: { content: 'pong' } }] })
        : textResponse('image input unsupported', 400);
    });

    expect(result.status).toBe('degraded');
    expect(result.textCapable).toBe(true);
    expect(result.imageCapable).toBe(false);
  });

  it('reports model errors separately from unreachable servers', async () => {
    const result = await probeHermesConnection(defaultConnection({ modelId: 'missing-model' }), async (url) => {
      if (String(url).endsWith('/v1/chat/completions')) {
        return jsonResponse({ error: { message: 'model missing-model not found' } }, 400);
      }

      return jsonResponse({});
    });

    expect(result.status).toBe('model-error');
    expect(result.summary).toContain('model');
  });

  it('reports model errors when model discovery excludes the configured model', async () => {
    const result = await probeHermesConnection(defaultConnection({ modelId: 'missing-model' }), async (url) => {
      if (String(url).endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'hermes-agent' }] });
      }

      return jsonResponse({});
    });

    expect(result.status).toBe('model-error');
    expect(result.models).toEqual(['hermes-agent']);
  });

  it('parses direct text responses from custom endpoints', async () => {
    await expect(
      askHermes(
        askInput({
          connection: defaultConnection({
            connectionKind: 'custom',
            endpointMode: 'custom',
            baseUrl: 'https://example.test/direct'
          })
        }),
        async () => textResponse('Plain text coach response')
      )
    ).resolves.toBe('Plain text coach response');

    await expect(
      askHermes(askInput(), async () =>
        jsonResponse('JSON string coach response')
      )
    ).resolves.toBe('JSON string coach response');
  });

  it('sends bearer auth on probes and asks for hosted Hermes', async () => {
    const connection = defaultConnection({
      connectionKind: 'hosted',
      baseUrl: 'https://hermes.example.com',
      bearerToken: 'hosted-secret'
    });
    const authHeaders: Array<string | null> = [];

    await probeHermesConnection(connection, async (_url, init) => {
      authHeaders.push(new Headers(init?.headers).get('authorization'));
      return jsonResponse({ choices: [{ message: { content: 'pong' } }] });
    });

    await askHermes(askInput({ connection }), async (_url, init) => {
      authHeaders.push(new Headers(init?.headers).get('authorization'));
      return jsonResponse({ choices: [{ message: { content: 'answer' } }] });
    });

    expect(authHeaders.every((header) => header === 'Bearer hosted-secret')).toBe(true);
  });

  it('redacts secrets from debug URLs and response details', () => {
    const report = createDebugReport(
      {
        status: 'auth-error',
        summary: 'Auth failed',
        attempts: [
          {
            url: 'https://user:pass@example.test/path?access_token=abc&authorization=Bearer%20abc',
            method: 'POST',
            ok: false,
            status: 401,
            label: 'text ping',
            detail: 'authorization failed for hosted-secret and access_token=abc'
          }
        ]
      },
      defaultConnection({
        bearerToken: 'hosted-secret',
        baseUrl: 'https://user:pass@example.test/path?access_token=abc'
      })
    );

    expect(report).not.toContain('hosted-secret');
    expect(report).not.toContain('user:pass');
    expect(report).not.toContain('access_token=abc');
    expect(report).toContain('access_token=***');
  });

  it('does not claim dashboard confusion when port 9119 is unreachable', async () => {
    const result = await probeHermesConnection(defaultConnection(), async () => {
      throw new Error('fetch failed');
    });

    expect(result.summary).toBe('No compatible Hermes API server responded.');
  });
});

function askInput(overrides: Partial<Parameters<typeof askHermes>[0]> = {}): Parameters<typeof askHermes>[0] {
  return {
    connection: defaultConnection(),
    question: 'Should I enter now?',
    screenshotDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    selectedWindow: {
      id: 'window:42',
      name: 'Trading Terminal',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,preview'
    },
    ...overrides
  };
}

function defaultConnection(overrides: Partial<HermesConnectionSettings> = {}): HermesConnectionSettings {
  return {
    connectionKind: 'local',
    endpointMode: 'auto',
    baseUrl: 'http://localhost:8642',
    modelId: 'hermes-agent',
    bearerToken: '',
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain'
    }
  });
}
