import { describe, expect, it } from 'vitest';

import type { JournalEntry } from '../shared/types';
import { buildSourceQualityAssessment } from './sourceQuality';

describe('buildSourceQualityAssessment', () => {
  it('returns no warning when only unknown source text appears', () => {
    const assessment = buildSourceQualityAssessment({
      question: 'Review this generic chart and momentum signal.',
      monitorSignals: [],
      journalEntries: []
    });

    expect(assessment.warnings).toEqual([]);
    expect(assessment.findings).toEqual([]);
  });

  it('warns when current token previously had bad outcomes', () => {
    const token = '0x1234567890abcdef1234567890abcdef12345678';
    const priorEntries: JournalEntry[] = [
      {
        id: 'prior',
        createdAt: '2026-05-18T20:00:00.000Z',
        question: 'Should I enter this token?',
        response: 'I entered and got hurt.',
        notes: 'Initial copy from social.',
        selectedWindow: {
          id: 'window:1',
          name: 'Trading Window',
          kind: 'window'
        },
        screenshot: {
          captured: true,
          imageStored: false
        },
        sourceContext: {
          category: 'telegram',
          outcome: 'bad',
          tokenHint: token
        }
      }
    ];

    const assessment = buildSourceQualityAssessment({
      question: `Review ${token} before buying.`,
      monitorSignals: [],
      journalEntries: priorEntries
    });

    expect(assessment.findings).toHaveLength(1);
    expect(assessment.warnings.join(' ')).toContain('prior poor outcomes');
  });

  it('warns on repeated copied token without good outcome yet', () => {
    const token = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const priorEntries: JournalEntry[] = [
      {
        id: 'prior-a',
        createdAt: '2026-05-18T20:00:00.000Z',
        question: `Consider ${token}`,
        response: 'Tracked closely.',
        notes: 'No entry executed.',
        selectedWindow: {
          id: 'window:1',
          name: 'Trading Window',
          kind: 'window'
        },
        screenshot: {
          captured: true,
          imageStored: false
        },
        monitoring: {
          localWarnings: [],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: `${token.slice(0, 6)}...${token.slice(-4)}`,
              confidence: 'high',
              detectedAt: '2026-05-18T20:01:00.000Z'
            }
          ]
        }
      },
      {
        id: 'prior-b',
        createdAt: '2026-05-18T20:10:00.000Z',
        question: `${token} from a different note`,
        response: 'No entry yet.',
        notes: 'Re-checking again.',
        selectedWindow: {
          id: 'window:1',
          name: 'Trading Window',
          kind: 'window'
        },
        screenshot: {
          captured: true,
          imageStored: false
        },
        monitoring: {
          localWarnings: [],
          signals: [
            {
              source: 'clipboard',
              kind: 'evm-address',
              maskedValue: `${token.slice(0, 6)}...${token.slice(-4)}`,
              confidence: 'high',
              detectedAt: '2026-05-18T20:11:00.000Z'
            }
          ]
        }
      }
    ];

    const assessment = buildSourceQualityAssessment({
      question: `Another pass on ${token}`,
      monitorSignals: [
        {
          source: 'clipboard',
          kind: 'evm-address',
          value: token,
          maskedValue: `${token.slice(0, 6)}...${token.slice(-4)}`,
          confidence: 'high',
          detectedAt: '2026-05-18T21:00:00.000Z'
        }
      ],
      journalEntries: priorEntries
    });

    expect(assessment.warnings.join(' ')).toContain('repeatedly');
  });
});
