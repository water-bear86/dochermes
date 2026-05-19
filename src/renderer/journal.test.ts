import { describe, expect, it } from 'vitest';

import { buildJournalEntry, parseJournalEntries, serializeJournalEntries } from './journal';

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
