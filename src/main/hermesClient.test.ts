import { describe, expect, it } from 'vitest';

import {
  buildHermesPayload,
  parseHermesResponse,
  resolveHermesEndpoint
} from './hermesClient';

describe('resolveHermesEndpoint', () => {
  it('uses /coach when the user configures only a gateway origin', () => {
    expect(resolveHermesEndpoint('http://localhost:8787')).toBe('http://localhost:8787/coach');
  });

  it('keeps an explicit gateway path intact', () => {
    expect(resolveHermesEndpoint('http://localhost:8787/api/ask')).toBe('http://localhost:8787/api/ask');
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

  it('rejects unknown response shapes with a useful error', () => {
    expect(() => parseHermesResponse({ ok: true })).toThrow('Hermes gateway response did not include readable text');
  });
});
