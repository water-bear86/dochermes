import { describe, expect, it } from 'vitest';

import {
  buildCoachModePolicyGate,
  COACH_MODE_OPTIONS,
  formatPolicyLevelSignalSummary,
  getCoachModeCopy
} from './coachMode';

describe('coach mode product contract', () => {
  it('keeps the mode options in the product order with explicit behavior copy', () => {
    expect(COACH_MODE_OPTIONS.map((option) => option.mode)).toEqual(['advisory', 'guardrail', 'policy']);
    expect(COACH_MODE_OPTIONS.map((option) => option.selectLabel)).toEqual([
      'Advisory - recommendations only',
      'Guardrail - warnings plus suggestions',
      'Policy - override required'
    ]);
  });

  it('describes each mode without implying DocHermes can execute trades', () => {
    expect(getCoachModeCopy('advisory')).toMatchObject({
      label: 'Advisory',
      settingDetail: 'Shows recommendations and local risk context. It never pauses a request.',
      policyBlockBehavior: 'No override required.'
    });
    expect(getCoachModeCopy('guardrail')).toMatchObject({
      label: 'Guardrail',
      settingDetail: 'Shows warnings and sizing discipline when rules are hit. It still lets the request continue.',
      policyBlockBehavior: 'No override required.'
    });
    expect(getCoachModeCopy('policy')).toMatchObject({
      label: 'Policy',
      settingDetail: 'Pauses policy-level violations until you write an override note.',
      policyBlockBehavior: 'Override note required before sending blocked prompts.'
    });

    for (const mode of COACH_MODE_OPTIONS.map((option) => option.mode)) {
      expect(getCoachModeCopy(mode).boundary).toBe(
        'DocHermes is advisory-only: no wallet control, signing, routing, or trade execution.'
      );
    }
  });

  it('never blocks advisory or guardrail mode even when policy-level warnings exist', () => {
    const policyWarnings = [' Daily loss limit hit ', 'Daily loss limit hit', '', ' Low liquidity source policy '];

    expect(buildCoachModePolicyGate({ mode: 'advisory', policyWarnings })).toMatchObject({
      shouldBlock: false,
      blockers: ['Daily loss limit hit', 'Low liquidity source policy']
    });
    expect(buildCoachModePolicyGate({ mode: 'guardrail', policyWarnings })).toMatchObject({
      shouldBlock: false,
      blockers: ['Daily loss limit hit', 'Low liquidity source policy']
    });
  });

  it('blocks policy mode only when sanitized policy blockers remain', () => {
    expect(
      buildCoachModePolicyGate({
        mode: 'policy',
        policyWarnings: ['Daily loss limit hit', 'Low liquidity source policy']
      })
    ).toEqual({
      mode: 'policy',
      shouldBlock: true,
      blockers: ['Daily loss limit hit', 'Low liquidity source policy'],
      summary: 'Policy mode will pause this request until you write an override note.'
    });

    expect(
      buildCoachModePolicyGate({
        mode: 'policy',
        policyWarnings: [' ', '']
      })
    ).toMatchObject({
      shouldBlock: false,
      blockers: []
    });
  });

  it('summarizes advisory, guardrail, and policy signal counts without flattening severity', () => {
    expect(formatPolicyLevelSignalSummary(['policy', 'guardrail', 'advisory', 'guardrail'])).toBe(
      'Session budget engine returned 1 policy, 2 guardrail, and 1 advisory signals for this question.'
    );

    expect(formatPolicyLevelSignalSummary([])).toBe('Session budget engine returned no advisory, guardrail, or policy signals for this question.');
    expect(formatPolicyLevelSignalSummary(['policy'])).toBe('Session budget engine returned 1 policy signal for this question.');
  });
});
