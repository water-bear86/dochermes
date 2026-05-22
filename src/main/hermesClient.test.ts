import { describe, expect, it } from 'vitest';

import {
  buildHermesPayload,
  buildOpenAiChatPayload,
  createDebugReport,
  askHermes,
  parseHermesResponse,
  probeHermesConnection,
  resolveHermesEndpoint,
  MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL
} from './hermesClient';
import type { HermesConnectionSettings, JournalMonitoringSignal } from '../shared/types';

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

  it('includes monitoring signals in the compact prompt context for openai-chat payloads', async () => {
    let capturedPrompt = '';

    await askHermes(
      askInput({
        monitoringContext: {
          localWarnings: [],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: '0xAbCdEf0123456789abcdef0123456789abcdef0123',
              confidence: 'high',
              detectedAt: '2026-05-21T12:00:00.000Z',
              message: 'wallet detected'
            } as JournalMonitoringSignal
          ],
          warningEvidence: [
            {
              warningText: 'recent duplicate',
              source: 'clipboard',
              detail: 'Seen three times this minute',
              confidence: 'medium',
              detectedAt: '2026-05-21T12:01:00.000Z'
            }
          ],
          sourceQuality: [
            {
              category: 'token-address',
              confidence: 'low',
              provenance: 'clipboard',
              tokenHint: '0xAbCdEf0123456789abcdef0123456789abcdef0123',
              reason: 'low confidence parse from copy event'
            }
          ]
        }
      }),
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const message = (body.messages as Array<{ content?: unknown }>)[1];
        if (!message || typeof message !== 'object' || !('content' in message) || !Array.isArray(message.content)) {
          throw new Error('Malformed request');
        }

        const textItem = (message.content as Array<{ type: string; text?: string }>).find((item) => item.type === 'text');
        capturedPrompt = textItem?.text ?? '';
        return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
      }
    );

    expect(capturedPrompt).toContain('"signals"');
    expect(capturedPrompt).toContain('"source":"clipboard"');
    expect(capturedPrompt).toContain('"kind":"evm-address"');
    expect(capturedPrompt).toContain('"confidence":"high"');
    expect(capturedPrompt).toContain('"maskedValue":"0xAbCdEf0123456789abcdef0123456789abcdef0123"');
    expect(capturedPrompt).toContain('"warningEvidence"');
    expect(capturedPrompt).toContain('"sourceQuality"');
    expect(capturedPrompt).toContain('Monitoring summary (compact provenance):');
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

    const imagePingBody = requests
      .filter((request) => request.url === 'http://localhost:8642/v1/chat/completions')
      .map((request) => JSON.parse(String(request.init?.body)))
      .find((body) => Array.isArray(body.messages?.[1]?.content));
    const imageUrl = imagePingBody?.messages[1].content.find((item: { type?: string }) => item.type === 'image_url')
      ?.image_url.url;
    const png = Buffer.from(String(imageUrl).replace('data:image/png;base64,', ''), 'base64');

    expect(imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(48);
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

  it('returns timed out probes as a disconnection with actionable summary', async () => {
    const timeout = new Error('Request timed out');
    timeout.name = 'AbortError';

    const result = await probeHermesConnection(
      defaultConnection(),
      async () => {
        throw timeout;
      }
    );

    expect(result.status).toBe('disconnected');
    expect(result.summary).toContain('did not respond before the request timeout');
    expect(result.attempts[0]?.errorKind).toBe('timeout');
  });

  it('reports unreachable local servers separately from timeouts', async () => {
    const result = await probeHermesConnection(
      defaultConnection(),
      async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8642');
      }
    );

    expect(result.status).toBe('disconnected');
    expect(result.summary).toContain('local Hermes server was unreachable');
    expect(result.attempts[0]?.errorKind).toBe('network');
    expect(result.attempts[0]?.detail).toContain('Unreachable local Hermes server');
  });

  it('reports local auth failures as missing or rejected bearer tokens', async () => {
    const result = await probeHermesConnection(defaultConnection(), async (url) => {
      if (String(url).endsWith('/v1/chat/completions')) {
        return textResponse('missing bearer token', 401);
      }

      return jsonResponse({});
    });

    expect(result.status).toBe('auth-error');
    expect(result.summary).toContain('bearer token is missing or rejected');
    expect(result.attempts.find((attempt) => attempt.label === 'text ping')?.errorKind).toBe('auth');
  });

  it('reports endpoint mode mismatch when the configured OpenAI route is unavailable', async () => {
    const connection = defaultConnection({ endpointMode: 'openai-chat' });
    const result = await probeHermesConnection(connection, async (url) => {
      return String(url).endsWith('/v1/chat/completions') ? textResponse('not found', 404) : jsonResponse({});
    });

    expect(result.status).toBe('incompatible');
    expect(result.summary).toContain('endpoint mode mismatch');
    expect(result.attempts.find((attempt) => attempt.label === 'text ping')?.errorKind).toBe('incompatible');
    expect(result.attempts.find((attempt) => attempt.label === 'text ping')?.detail).toContain('endpoint mode mismatch');

    await expect(
      askHermes(
        askInput({ connection }),
        async () => textResponse('not found', 404)
      )
    ).rejects.toThrowError(/endpoint mode mismatch/i);
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
    expect(result.attempts.some((attempt) => attempt.errorKind === 'auth')).toBe(true);
    expect(createDebugReport(result, defaultConnection({ bearerToken: 'super-secret-token' }))).not.toContain(
      'super-secret-token'
    );
    expect(createDebugReport(result, defaultConnection({ bearerToken: 'super-secret-token' }))).toContain('Bearer ***');
  });

  it('classifies ask failures for auth and model rejections', async () => {
    await expect(
      askHermes(
        askInput(),
        async () => textResponse('wrong token', 401)
      )
    ).rejects.toThrowError(/authentication/i);

    await expect(
      askHermes(
        askInput({ connection: defaultConnection({ modelId: 'missing-model' }) }),
        async () => jsonResponse({ error: { message: 'model missing-model not found' } }, 400)
      )
    ).rejects.toThrowError(/configured model id/i);
  });

  it('classifies local ask network failures separately from timeouts', async () => {
    await expect(
      askHermes(
        askInput(),
        async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:8642');
        }
      )
    ).rejects.toThrowError(/local Hermes server is unreachable/i);

    const timeout = new Error('Request timed out');
    timeout.name = 'AbortError';

    await expect(
      askHermes(
        askInput(),
        async () => {
          throw timeout;
        }
      )
    ).rejects.toThrowError(/timed out/i);
  });

  it('classifies 2xx ask responses with invalid JSON separately from unexpected response shapes', async () => {
    await expect(
      askHermes(
        askInput(),
        async () => invalidJsonResponse('{"choices":')
      )
    ).rejects.toThrowError(/invalid JSON/i);

    await expect(
      askHermes(
        askInput(),
        async () => jsonResponse({ ok: true })
      )
    ).rejects.toThrowError(/unexpected response shape/i);
  });

  it('sends maximum privacy placeholder and drops local monitoring summary', async () => {
    let capturedRequestBody: Record<string, unknown> | undefined;
    await askHermes(
      askInput({
        privacy: {
          preset: 'maximum',
          redaction: {
            redactAddresses: true,
            redactBalances: true,
            redactUsernames: true,
            redactAmounts: true
          }
        },
        memoryContext: {
          matchedPatterns: [
            {
              name: 'private-pattern',
              evidenceCount: 1,
              summary: 'Do not leak this private prior note.',
              recommendation: 'Keep it local.'
            }
          ],
          recentNotes: [
            {
              createdAt: '2026-05-21T12:00:00.000Z',
              question: 'Prior private question',
              response: 'Prior private response',
              notes: 'Prior private notes',
              selectedWindowName: 'Private Trading Terminal'
            }
          ]
        },
        monitoringContext: {
          localWarnings: ['Potential duplicate signal'],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: '0xAbCdEf0123456789abcdef0123456789abcdef0123',
              confidence: 'high',
              detectedAt: '2026-05-21T12:00:00.000Z',
              message: 'wallet detected'
            }
          ]
        }
      }),
      async (_url, init) => {
        capturedRequestBody = JSON.parse(String(init?.body));
        return jsonResponse({ choices: [{ message: { content: 'ack' } }] });
      }
    );

    const messageContent = (capturedRequestBody?.messages as Array<{
      content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>)[1]?.content;
    const imageUrl = messageContent?.find((entry) => entry.type === 'image_url')?.image_url?.url;
    const promptText = messageContent?.find((entry) => entry.type === 'text')?.text;

    expect(imageUrl).toBe(MAX_PRIVACY_SCREENSHOT_PLACEHOLDER_DATA_URL);
    expect(promptText).not.toContain('Monitoring summary');
    expect(promptText).not.toContain('Compact personal memory context');
    expect(promptText).not.toContain('Private Trading Terminal');
    expect(promptText).not.toContain('Prior private question');
    expect(promptText).toContain('Selected window: Local context selected (window)');
  });

  it('redacts configured entities from question, memory, and monitoring payloads', async () => {
    let capturedPrompt = '';

    await askHermes(
      askInput({
        question: 'Enter at 2.5 SOL for @trader with wallet 0xAbCdEf0123456789abcdef0123456789abcdef0123 immediately.',
        privacy: {
          preset: 'full',
          redaction: {
            redactAddresses: true,
            redactBalances: true,
            redactUsernames: true,
            redactAmounts: true
          }
        },
        memoryContext: {
          matchedPatterns: [
            {
              name: 'pattern-1',
              evidenceCount: 2,
              summary: 'Recent note tied to 0xAbCdEf0123456789abcdef0123456789abcdef0123',
              recommendation: 'Wait for confirmation before sending 1000 USDC.'
            }
          ],
          recentNotes: []
        },
        monitoringContext: {
          localWarnings: ['Detected wallet 0x1111111111111111111111111111111111111111'],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: '@trader',
              confidence: 'low',
              detectedAt: '2026-05-21T12:00:00.000Z',
              message: 'user seen'
            } as JournalMonitoringSignal
          ],
          sourceQuality: [
            {
              category: 'token-address',
              confidence: 'high',
              provenance: 'clipboard',
              tokenHint: '0x1111111111111111111111111111111111111111',
              reason: 'Repeated copied token with prior low outcome'
            }
          ]
        }
      }),
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const message = (body.messages as Array<{ content?: unknown }>)[1];
        if (!message || typeof message !== 'object' || !('content' in message) || !Array.isArray(message.content)) {
          throw new Error('Malformed request');
        }

        const textItem = (message.content as Array<{ type: string; text?: string }>).find((item) => item.type === 'text');
        capturedPrompt = textItem?.text ?? '';
        return jsonResponse({ choices: [{ message: { content: 'ack' } }] });
      }
    );

    expect(capturedPrompt).toContain('[redacted address]');
    expect(capturedPrompt).toContain('[redacted username]');
    expect(capturedPrompt).toContain('[redacted amount]');
    expect(capturedPrompt).not.toContain('1111111111111111111111111111111111111111');
  });

  it('forces full redaction for maximum privacy regardless of redaction toggles', async () => {
    let capturedPrompt = '';

    await askHermes(
      askInput({
        privacy: {
          preset: 'maximum',
          redaction: {
            redactAddresses: false,
            redactBalances: false,
            redactUsernames: false,
            redactAmounts: false
          }
        },
        question: 'Enter 12 SOL with @alpha bot address 0xAbCdEf0123456789abcdef0123456789abcdef0123',
        memoryContext: {
          matchedPatterns: [
            {
              name: 'pattern-1',
              evidenceCount: 2,
              summary: 'Wallet 0xAbCdEf0123456789abcdef0123456789abcdef0123 appeared in prior notes.',
              recommendation: 'Wait for confirmation.'
            }
          ],
          recentNotes: []
        },
        monitoringContext: {
          localWarnings: ['Potential immediate entry around 0xAbCdEf0123456789abcdef0123456789abcdef0123'],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: '0xAbCdEf0123456789abcdef0123456789abcdef0123',
              confidence: 'high',
              detectedAt: '2026-05-21T12:00:00.000Z',
              message: 'wallet detected'
            } as JournalMonitoringSignal
          ],
          sourceQuality: [
            {
              category: 'token-address',
              confidence: 'high',
              provenance: 'question',
              reason: `Repeatedly pasted wallet 0xAbCdEf0123456789abcdef0123456789abcdef0123`,
              tokenHint: '0xAbCdEf0123456789abcdef0123456789abcdef0123'
            }
          ]
        }
      }),
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const message = (body.messages as Array<{ content?: unknown }>)[1];
        if (!message || typeof message !== 'object' || !('content' in message) || !Array.isArray(message.content)) {
          throw new Error('Malformed request');
        }

        const textItem = (message.content as Array<{ type: string; text?: string }>).find((item) => item.type === 'text');
        capturedPrompt = textItem?.text ?? '';
        return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
      }
    );

    expect(capturedPrompt).toContain('[redacted address]');
    expect(capturedPrompt).toContain('[redacted amount]');
    expect(capturedPrompt).toContain('[redacted username]');
    expect(capturedPrompt).not.toContain('0xAbCdEf0123456789abcdef0123456789abcdef0123');
  });

  it('redacts source-quality token hints before sending legacy payloads', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const tokenHint = '0x1111111111111111111111111111111111111111';

    await askHermes(
      askInput({
        connection: defaultConnection({
          connectionKind: 'custom',
          endpointMode: 'legacy-coach'
        }),
        privacy: {
          preset: 'full',
          redaction: {
            redactAddresses: true,
            redactBalances: true,
            redactUsernames: true,
            redactAmounts: true
          }
        },
        monitoringContext: {
          localWarnings: ['Potential duplicate token'],
          signals: [],
          sourceQuality: [
            {
              category: 'token-address',
              confidence: 'high',
              provenance: 'Question text',
              tokenHint,
              reason: `Observed copied token ${tokenHint} from prior context`
            }
          ]
        }
      }),
      async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return jsonResponse({ answer: 'ok' });
      }
    );

    const monitoringContext = capturedBody?.monitoringContext as Record<string, unknown> | undefined;
    const sourceQuality = monitoringContext?.sourceQuality as Array<Record<string, unknown>> | undefined;
    const finding = sourceQuality?.[0];

    expect(finding?.tokenHint).not.toBe(tokenHint);
    expect(finding?.tokenHint).toContain('[redacted address]');
    expect(String(finding?.reason)).not.toContain(tokenHint);
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

  it('does not fall back to /coach on auth errors when auto mode is selected', async () => {
    const requests: string[] = [];

    const result = await probeHermesConnection(defaultConnection(), async (url) => {
      const nextUrl = String(url);
      requests.push(nextUrl);

      if (nextUrl.endsWith('/health') || nextUrl.endsWith('/v1/capabilities')) {
        return jsonResponse({ ok: true });
      }

      if (nextUrl.endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'hermes-agent' }] });
      }

      if (nextUrl.endsWith('/v1/chat/completions')) {
        return textResponse('authentication failed', 401);
      }

      if (nextUrl.endsWith('/coach')) {
        return jsonResponse({ answer: 'pong' });
      }

      return textResponse('not found', 404);
    });

    expect(result.status).toBe('auth-error');
    expect(requests.some((request) => request.endsWith('/coach'))).toBe(false);
  });

  it('does not fall back to /coach when the OpenAI route returns invalid JSON', async () => {
    const requests: string[] = [];
    const result = await probeHermesConnection(defaultConnection(), async (url) => {
      const nextUrl = String(url);
      requests.push(nextUrl);

      if (!nextUrl.startsWith('http://localhost:8642')) {
        throw new Error('connect ECONNREFUSED');
      }

      if (nextUrl.endsWith('/v1/chat/completions')) {
        return invalidJsonResponse('{"choices":');
      }

      return jsonResponse({});
    });

    const chatAttempt = result.attempts.find((attempt) => attempt.label === 'text ping');

    expect(result.status).toBe('disconnected');
    expect(result.summary).toContain('invalid JSON');
    expect(chatAttempt?.errorKind).toBe('invalid-json');
    expect(chatAttempt?.detail).toContain('Invalid JSON');
    expect(result.debugReport).toContain('[invalid-json]');
    expect(requests.some((request) => request.endsWith('/coach'))).toBe(false);
  });

  it('does not fall back to /coach when the OpenAI route returns an unexpected shape', async () => {
    const requests: string[] = [];
    const result = await probeHermesConnection(defaultConnection(), async (url) => {
      const nextUrl = String(url);
      requests.push(nextUrl);

      if (!nextUrl.startsWith('http://localhost:8642')) {
        throw new Error('connect ECONNREFUSED');
      }

      if (nextUrl.endsWith('/v1/chat/completions')) {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({});
    });

    const chatAttempt = result.attempts.find((attempt) => attempt.label === 'text ping');

    expect(result.status).toBe('disconnected');
    expect(result.summary).toContain('unexpected response shape');
    expect(chatAttempt?.errorKind).toBe('unexpected-shape');
    expect(chatAttempt?.detail).toContain('Unexpected response shape');
    expect(result.debugReport).toContain('[unexpected-shape]');
    expect(requests.some((request) => request.endsWith('/coach'))).toBe(false);
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

    expect(result.summary).toContain('local Hermes server was unreachable');
    expect(result.summary).not.toContain('dashboard');
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

function invalidJsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}
