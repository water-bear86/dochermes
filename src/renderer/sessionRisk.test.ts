import { describe, expect, it } from 'vitest';

import type { JournalEntry, SessionBudgetSettings, SourceQualityFinding } from '../shared/types';
import { DEFAULT_RISK_BUDGET_SETTINGS } from './localSettings';
import { buildSessionRiskAssessment } from './sessionRisk';

const baseWindow = {
  id: 'window-1',
  name: 'Trading Window',
  kind: 'window' as const
} as const;

const sourceFinding: SourceQualityFinding = {
  category: 'telegram',
  confidence: 'medium',
  provenance: 'Question text',
  reason: 'Telegram signal'
};

const defaultBudget: SessionBudgetSettings = {
  enabled: true,
  maxTradesPerSession: 4,
  maxLossPerSessionPercent: 12,
  cooldownMinutesAfterLoss: 45,
  maxSizeMultiplier: 1.5,
  tiltSensitivity: 'standard',
  sourceConstraints: DEFAULT_RISK_BUDGET_SETTINGS.sourceConstraints
};

function makeEntry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'entry-0',
    createdAt: '2026-05-21T09:00:00.000Z',
    question: '',
    response: '',
    notes: '',
    selectedWindow: baseWindow,
    screenshot: { captured: false, imageStored: false },
    ...overrides
  };
}

describe('buildSessionRiskAssessment', () => {
  it('returns no warnings when risk budget is disabled', () => {
    const result = buildSessionRiskAssessment({
      question: 'Buy 0.5 SOL now',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T10:00:00.000Z',
          question: 'Buy 1 SOL',
          response: 'Closed +2%'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        enabled: false
      }
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.status.enabled).toBe(false);
  });

  it('warns at trade budget cap and on exceed', () => {
    const nearCap = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T11:00:00.000Z'),
      question: 'Buy 0.1 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T10:00:00.000Z',
          question: 'Buy 0.3 SOL',
          response: 'closed'
        }),
        makeEntry({
          id: '2',
          createdAt: '2026-05-21T10:10:00.000Z',
          question: 'Buy 0.4 SOL',
          response: 'closed'
        }),
        makeEntry({
          id: '3',
          createdAt: '2026-05-21T10:20:00.000Z',
          question: 'Buy 0.2 SOL',
          response: 'closed'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxTradesPerSession: 5
      }
    });

    expect(
      nearCap.warnings.some((warning) =>
        warning.text.includes('Session trades are near limit')
      )
    ).toBe(true);
    expect(nearCap.status.tradeCount).toBe(3);

    const overCap = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T11:00:00.000Z'),
      question: 'Buy 0.1 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T10:00:00.000Z',
          question: 'Buy 0.3 SOL',
          response: 'closed'
        }),
        makeEntry({
          id: '2',
          createdAt: '2026-05-21T10:10:00.000Z',
          question: 'Buy 0.4 SOL',
          response: 'closed'
        }),
        makeEntry({
          id: '3',
          createdAt: '2026-05-21T10:20:00.000Z',
          question: 'Buy 0.2 SOL',
          response: 'closed'
        }),
        makeEntry({
          id: '4',
          createdAt: '2026-05-21T10:30:00.000Z',
          question: 'Buy 0.2 SOL',
          response: 'closed'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxTradesPerSession: 4
      }
    });

    expect(
      overCap.warnings.some((warning) =>
        warning.text.includes('Trade budget exceeded')
      )
    ).toBe(true);
    expect(overCap.status.tradeCount).toBe(4);
  });

  it('tracks loss budget usage and alerts when near/exceeded', () => {
    const approaching = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T09:10:00.000Z'),
      question: 'Buy 1 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T08:00:00.000Z',
          notes: 'Result: -9% loss on momentum entry'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxLossPerSessionPercent: 10
      }
    });

    expect(
      approaching.warnings.some((warning) =>
        warning.text.includes('loss budget nearing limit')
      )
    ).toBe(true);

    const exceeded = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T09:10:00.000Z'),
      question: 'Buy 1 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T08:00:00.000Z',
          notes: 'Closed -11% loss after liquidity dropped'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxLossPerSessionPercent: 10
      }
    });

    expect(
      exceeded.warnings.some((warning) =>
        warning.text.includes('Session max-loss budget exceeded')
      )
    ).toBe(true);
  });

  it('surfaces cooldown while loss is within the window', () => {
    const now = () => new Date('2026-05-21T12:05:00.000Z');
    const result = buildSessionRiskAssessment({
      now,
      question: 'Buy 1 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T12:00:00.000Z',
          notes: 'Exited -4% and moved on'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        cooldownMinutesAfterLoss: 45
      }
    });

    expect(result.warnings.some((warning) => warning.text.startsWith('Cooldown active after recent loss'))).toBe(true);
  });

  it('warns on oversized position size versus session median', () => {
    const result = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T09:30:00.000Z'),
      question: 'Buy 3 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T09:00:00.000Z',
          question: 'Buy 1 SOL',
          response: 'closed +1%'
        }),
        makeEntry({
          id: '2',
          createdAt: '2026-05-21T09:10:00.000Z',
          response: 'Buy 1.2 SOL and hold',
          question: '',
          notes: ''
        }),
        makeEntry({
          id: '3',
          createdAt: '2026-05-21T09:20:00.000Z',
          question: 'Hold',
          response: 'Buy 0.9 SOL now'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxSizeMultiplier: 2
      }
    });

    expect(result.status.candidateSize).toBe('3 sol');
    expect(result.status.medianSize).toBe('1');
    expect(result.warnings.some((warning) => warning.text.includes('Trade size may be oversized'))).toBe(true);
  });

  it('warns when size rule is active but no same-unit baseline exists', () => {
    const result = buildSessionRiskAssessment({
      question: 'Buy 1 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T09:00:00.000Z',
          question: 'Buy 10 USDC',
          response: 'Closed +1%'
        }),
        makeEntry({
          id: '2',
          createdAt: '2026-05-21T09:20:00.000Z',
          question: 'Buy 20 USDC',
          response: 'Closed +1%'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxSizeMultiplier: 2
      }
    });

    expect(
      result.warnings.some((warning) => warning.text.includes('no baseline for SOL sizes'))
    ).toBe(true);
  });

  it('emits tilt warning when urgent language appears after recent loss', () => {
    const result = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T10:30:00.000Z'),
      question: 'Buy now - I cannot lose right now',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T09:55:00.000Z',
          notes: 'Exited -8% after weak volume'
        })
      ],
      riskBudget: defaultBudget
    });

    expect(
      result.warnings.some((warning) => warning.text.includes('urgent language after 1 recent loss'))
    ).toBe(true);
  });

  it('warns on rapid sequential trades in the configured sensitivity window', () => {
    const result = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T10:30:00.000Z'),
      question: 'Buy 0.3 SOL',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T10:00:00.000Z',
          question: 'Buy 0.2 SOL'
        }),
        makeEntry({
          id: '2',
          createdAt: '2026-05-21T10:17:00.000Z',
          question: 'Buy 0.1 SOL'
        }),
        makeEntry({
          id: '3',
          createdAt: '2026-05-21T10:25:00.000Z',
          question: 'Buy 0.25 SOL'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        tiltSensitivity: 'high'
      }
    });

    expect(
      result.warnings.some((warning) => warning.text.includes('High trading pace detected'))
    ).toBe(true);
  });

  it('warns when a candidate token appeared recently in session history', () => {
    const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const result = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T10:30:00.000Z'),
      question: `Buy this ${token} now`,
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T09:45:00.000Z',
          question: `Watch ${token}`
        }),
        makeEntry({
          id: '2',
          createdAt: '2026-05-21T09:50:00.000Z',
          response: `Copied ${token}`
        })
      ],
      riskBudget: defaultBudget
    });

    expect(
      result.warnings.some((warning) => warning.text.includes('Tilt-risk pattern'))
    ).toBe(true);
    expect(result.status.tiltSensitivity).toBe('standard');
  });

  it('applies source-specific source-size constraints as policy-level warnings', () => {
    const result = buildSessionRiskAssessment({
      now: () => new Date('2026-05-21T10:30:00.000Z'),
      question: 'Buy 4 SOL now',
      journalEntries: [
        makeEntry({
          id: '1',
          createdAt: '2026-05-21T10:00:00.000Z',
          question: 'Buy 2 SOL'
        })
      ],
      riskBudget: {
        ...defaultBudget,
        maxSizeMultiplier: 2,
        sourceConstraints: {
          ...defaultBudget.sourceConstraints,
          telegram: {
            enabled: true,
            maxSizeMultiplier: 1
          }
        }
      },
      sourceFindings: [sourceFinding]
    });

    expect(result.warnings.some((warning) => warning.text.includes('Trade size may be oversized'))).toBe(true);
    expect(result.warnings.some((warning) => warning.policyLevel === 'policy')).toBe(true);
  });
});
