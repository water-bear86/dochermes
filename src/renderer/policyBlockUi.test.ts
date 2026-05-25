import { describe, expect, it } from 'vitest';

import { buildPolicyBlockUiCopy } from './policyBlockUi';

describe('buildPolicyBlockUiCopy', () => {
  it('requires an override note and labels the local audit trail clearly', () => {
    expect(
      buildPolicyBlockUiCopy({
        blockerCount: 2,
        overrideNote: ''
      })
    ).toEqual({
      title: 'Policy mode block',
      summary: 'Policy mode paused this request because 2 policy conditions require review before sending to Hermes.',
      boundary: 'DocHermes records the override decision only. It cannot route, sign, execute, or enforce trades in your wallet.',
      blockerHeading: 'Policy conditions requiring override',
      contextHeading: 'Context used for the block',
      noteLabel: 'Override note (required)',
      notePlaceholder: 'State why this policy override is acceptable right now.',
      noteHint: 'Write a short override reason before sending is enabled.',
      auditLabel: 'Local audit trail',
      auditDetail: 'The override note and blocked conditions will be saved locally.',
      canOverride: false
    });

    expect(
      buildPolicyBlockUiCopy({
        blockerCount: 1,
        overrideNote: 'Defined invalidation and reduced size.'
      })
    ).toMatchObject({
      summary: 'Policy mode paused this request because 1 policy condition requires review before sending to Hermes.',
      noteHint: 'This override will be saved to the local audit trail.',
      canOverride: true
    });
  });
});
