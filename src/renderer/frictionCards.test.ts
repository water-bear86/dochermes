import { describe, expect, it } from 'vitest';

import { buildFrictionCard } from './frictionCards';

describe('buildFrictionCard', () => {
  it('builds a blocking prompt for urgent trade language in standard mode', () => {
    const card = buildFrictionCard(
      {
        question: 'Should I ape this momentum entry right now?',
        localWarnings: ['Prior early entries lost money.'],
        matchedPatternCount: 1,
        frictionEnabled: true,
        frictionStrictness: 'standard'
      },
      {
        createId: () => 'friction-1'
      }
    );

    expect(card).toEqual({
      id: 'friction-1',
      question: 'Should I ape this momentum entry right now?',
      warnings: ['Prior early entries lost money.'],
      prompts: [
        'Why now? What changed in the last 30 seconds that would invalidate this setup?',
        'What confirms you are wrong before entering? What is your invalidation plan?',
        'What is the max loss and first action if that threshold is hit?',
        'Do you still have session risk budget for this entry?'
      ]
    });
  });

  it('does not show friction when disabled or when low strictness has no urgent signal', () => {
    expect(
      buildFrictionCard({
        question: 'Should I buy after confirmation?',
        localWarnings: ['Prior early entries lost money.'],
        matchedPatternCount: 1,
        frictionEnabled: false,
        frictionStrictness: 'standard'
      })
    ).toBeUndefined();

    expect(
      buildFrictionCard({
        question: 'Should I buy after confirmation?',
        localWarnings: ['Prior early entries lost money.'],
        matchedPatternCount: 1,
        frictionEnabled: true,
        frictionStrictness: 'low'
      })
    ).toBeUndefined();
  });

  it('catches normal trade intent in high strictness mode', () => {
    const card = buildFrictionCard(
      {
        question: 'Should I enter this setup after support holds?',
        localWarnings: [],
        matchedPatternCount: 0,
        frictionEnabled: true,
        frictionStrictness: 'high'
      },
      {
        createId: () => 'friction-high'
      }
    );

    expect(card?.id).toBe('friction-high');
    expect(card?.warnings).toEqual([]);
  });
});
