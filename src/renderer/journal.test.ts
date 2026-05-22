import { describe, expect, it } from 'vitest';

import { buildJournalEntry, clearJournalEntries, JOURNAL_KEY, parseJournalEntries, serializeJournalEntries } from './journal';

describe('buildJournalEntry', () => {
  it('captures question, response, notes, and screenshot metadata without storing image bytes', () => {
    const entry = buildJournalEntry(
      {
        question: 'Should I enter?',
        response: 'Wait for confirmation.',
        notes: 'Good reminder.',
        selectedWindow: {
          id: 'window:1',
          name: 'Trading Window',
          kind: 'window',
          thumbnailDataUrl: 'data:image/png;base64,preview'
        },
        screenshotCaptured: true
      },
      {
        now: () => new Date('2026-05-18T20:00:00.000Z'),
        createId: () => 'entry-1'
      }
    );

    expect(entry).toEqual({
      id: 'entry-1',
      createdAt: '2026-05-18T20:00:00.000Z',
      question: 'Should I enter?',
      response: 'Wait for confirmation.',
      notes: 'Good reminder.',
      selectedWindow: {
        id: 'window:1',
        name: 'Trading Window',
        kind: 'window'
      },
      screenshot: {
        captured: true,
        imageStored: false
      }
    });
  });

  it('stores masked monitoring metadata when provided', () => {
    const entry = buildJournalEntry(
      {
        question: 'Should I enter now?',
        response: 'Wait for confirmation.',
        notes: 'Observed a token candidate.',
        selectedWindow: {
          id: 'screen:0',
          name: 'Desktop',
          kind: 'screen',
          thumbnailDataUrl: 'data:image/png;base64,preview'
        },
        screenshotCaptured: true,
        monitoring: {
          localWarnings: ['Immediate-entry question detected; local guardrail suggests avoiding first-tick fills.'],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: '0x12...abcd',
              confidence: 'high',
              detectedAt: '2026-05-20T01:20:00.000Z',
              message: 'Detected token candidate'
            }
          ]
        }
      },
      {
        now: () => new Date('2026-05-20T01:20:00.000Z'),
        createId: () => 'entry-2'
      }
    );

    expect(entry).toMatchObject({
      id: 'entry-2',
      createdAt: '2026-05-20T01:20:00.000Z',
      question: 'Should I enter now?',
      response: 'Wait for confirmation.',
      notes: 'Observed a token candidate.',
      monitoring: {
        localWarnings: ['Immediate-entry question detected; local guardrail suggests avoiding first-tick fills.'],
        signals: [
          {
            source: 'clipboard',
            kind: 'evm-address',
            maskedValue: '0x12...abcd',
            confidence: 'high',
            detectedAt: '2026-05-20T01:20:00.000Z'
          }
        ]
      },
      selectedWindow: {
        id: 'screen:0',
        name: 'Desktop',
        kind: 'screen'
      }
    });
  });

  it('stores source context when provided', () => {
    const entry = buildJournalEntry(
      {
        question: 'Should I buy?',
        response: 'Wait for confirmation.',
        notes: 'Copied from Telegram',
        selectedWindow: {
          id: 'window:2',
          name: 'Trading Window',
          kind: 'window',
          thumbnailDataUrl: 'data:image/png;base64,preview'
        },
        screenshotCaptured: true,
        sourceContext: {
          category: 'telegram',
          outcome: 'bad',
          tokenHint: 'ABC1234567890'
        }
      },
      {
        now: () => new Date('2026-05-20T02:00:00.000Z'),
        createId: () => 'entry-3'
      }
    );

    expect(entry).toMatchObject({
      id: 'entry-3',
      createdAt: '2026-05-20T02:00:00.000Z',
      sourceContext: {
        category: 'telegram',
        outcome: 'bad',
        tokenHint: 'ABC1234567890'
      }
    });
  });
});

describe('parseJournalEntries', () => {
  it('returns newest valid entries and drops malformed records', () => {
    const entries = parseJournalEntries(
      JSON.stringify([
        {
          id: 'old',
          createdAt: '2026-05-18T19:00:00.000Z',
          question: 'Old?',
          response: 'Old response',
          notes: '',
          selectedWindow: {
            id: 'window:1',
            name: 'Old Window',
            kind: 'window'
          },
          screenshot: {
            captured: true,
            imageStored: false
          }
        },
        {
          nope: true
        },
        {
          id: 'new',
          createdAt: '2026-05-18T21:00:00.000Z',
          question: 'New?',
          response: 'New response',
          notes: 'Reviewed',
          selectedWindow: {
            id: 'screen:0',
            name: 'Entire Screen',
            kind: 'screen'
          },
          screenshot: {
            captured: false,
            imageStored: false
          }
        }
      ])
    );

    expect(entries.map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('drops malformed source profile data when parsing journal entries', () => {
    const entries = parseJournalEntries(
      JSON.stringify([
        {
          id: 'good',
          createdAt: '2026-05-18T19:00:00.000Z',
          question: 'Old?',
          response: 'Old response',
          notes: '',
          selectedWindow: {
            id: 'window:1',
            name: 'Old Window',
            kind: 'window'
          },
          screenshot: {
            captured: true,
            imageStored: false
          },
          sourceContext: {
            category: 'bad',
            outcome: 'great'
          }
        },
        {
          id: 'new',
          createdAt: '2026-05-18T21:00:00.000Z',
          question: 'New?',
          response: 'New response',
          notes: 'Reviewed',
          selectedWindow: {
            id: 'screen:0',
            name: 'Entire Screen',
            kind: 'screen'
          },
          screenshot: {
            captured: false,
            imageStored: false
          },
          sourceContext: {
            category: 'wallet',
            outcome: 'neutral',
            tokenHint: '0xabc'
          }
        }
      ])
    );

    expect(entries.map((entry) => entry.id)).toEqual(['new']);
  });

  it('accepts source-quality monitoring metadata', () => {
    const entries = parseJournalEntries(
      JSON.stringify([
        {
          id: 'checked',
          createdAt: '2026-05-18T19:00:00.000Z',
          question: 'New?',
          response: 'New response',
          notes: 'Reviewed',
          selectedWindow: {
            id: 'window:1',
            name: 'Old Window',
            kind: 'window'
          },
          screenshot: {
            captured: true,
            imageStored: false
          },
          monitoring: {
            localWarnings: ['Source quality warning'],
            signals: [],
            sourceQuality: [
              {
                category: 'discord',
                confidence: 'medium',
                provenance: 'Clipboard link',
                reason: 'Repeated signal with prior bad outcome.',
                tokenHint: '0x123'
              }
            ]
          }
        }
      ])
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.monitoring?.sourceQuality?.[0]).toEqual({
      category: 'discord',
      confidence: 'medium',
      provenance: 'Clipboard link',
      reason: 'Repeated signal with prior bad outcome.',
      tokenHint: '0x123'
    });
  });
});

describe('serializeJournalEntries', () => {
  it('keeps the newest entries within the requested cap', () => {
    const serialized = serializeJournalEntries(
      [
        {
          id: 'old',
          createdAt: '2026-05-18T19:00:00.000Z',
          question: 'Old?',
          response: 'Old response',
          notes: '',
          selectedWindow: {
            id: 'window:1',
            name: 'Old Window',
            kind: 'window'
          },
          screenshot: {
            captured: true,
            imageStored: false
          }
        },
        {
          id: 'new',
          createdAt: '2026-05-18T21:00:00.000Z',
          question: 'New?',
          response: 'New response',
          notes: '',
          selectedWindow: {
            id: 'window:2',
            name: 'New Window',
            kind: 'window'
          },
          screenshot: {
            captured: true,
            imageStored: false
          }
        }
      ],
      1
    );

    expect(JSON.parse(serialized)).toHaveLength(1);
    expect(JSON.parse(serialized)[0].id).toBe('new');
  });
});

describe('clearJournalEntries', () => {
  it('removes local journal entries from storage and returns an empty list', () => {
    const storage = new MapBackedStorage();
    storage.setItem(JOURNAL_KEY, serializeJournalEntries([
      {
        id: 'entry-1',
        createdAt: '2026-05-18T21:00:00.000Z',
        question: 'Should I buy?',
        response: 'Wait.',
        notes: 'Good save.',
        selectedWindow: {
          id: 'window:1',
          name: 'Trading Window',
          kind: 'window'
        },
        screenshot: {
          captured: false,
          imageStored: false
        }
      }
    ]));

    expect(clearJournalEntries(storage)).toEqual([]);
    expect(storage.getItem(JOURNAL_KEY)).toBeNull();
  });

  it('only removes the journal key when clearing local journal entries', () => {
    const storage = new MapBackedStorage();
    storage.setItem(JOURNAL_KEY, '[]');
    storage.setItem('hermes.settings.v1', '{"keepAlwaysOnTop":true}');

    expect(clearJournalEntries(storage)).toEqual([]);
    expect(storage.getItem(JOURNAL_KEY)).toBeNull();
    expect(storage.getItem('hermes.settings.v1')).toBe('{"keepAlwaysOnTop":true}');
  });
});

class MapBackedStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
