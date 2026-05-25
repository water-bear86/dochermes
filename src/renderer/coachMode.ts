import type { CoachMode, SessionRiskPolicyLevel } from '../shared/types';

export interface CoachModeCopy {
  mode: CoachMode;
  label: string;
  selectLabel: string;
  settingDetail: string;
  policyBlockBehavior: string;
  boundary: string;
}

export interface CoachModePolicyGate {
  mode: CoachMode;
  shouldBlock: boolean;
  blockers: string[];
  summary: string;
}

export const COACH_MODE_OPTIONS: CoachModeCopy[] = [
  {
    mode: 'advisory',
    label: 'Advisory',
    selectLabel: 'Advisory - recommendations only',
    settingDetail: 'Shows recommendations and local risk context. It never pauses a request.',
    policyBlockBehavior: 'No override required.',
    boundary: advisoryOnlyBoundary()
  },
  {
    mode: 'guardrail',
    label: 'Guardrail',
    selectLabel: 'Guardrail - warnings plus suggestions',
    settingDetail: 'Shows warnings and sizing discipline when rules are hit. It still lets the request continue.',
    policyBlockBehavior: 'No override required.',
    boundary: advisoryOnlyBoundary()
  },
  {
    mode: 'policy',
    label: 'Policy',
    selectLabel: 'Policy - override required',
    settingDetail: 'Pauses policy-level violations until you write an override note.',
    policyBlockBehavior: 'Override note required before sending blocked prompts.',
    boundary: advisoryOnlyBoundary()
  }
];

export function getCoachModeCopy(mode: CoachMode): CoachModeCopy {
  return COACH_MODE_OPTIONS.find((option) => option.mode === mode) ?? COACH_MODE_OPTIONS[0];
}

export function buildCoachModePolicyGate(input: { mode: CoachMode; policyWarnings: string[] }): CoachModePolicyGate {
  const blockers = sanitizePolicyWarnings(input.policyWarnings);
  const shouldBlock = input.mode === 'policy' && blockers.length > 0;

  return {
    mode: input.mode,
    shouldBlock,
    blockers,
    summary: shouldBlock
      ? 'Policy mode will pause this request until you write an override note.'
      : `${getCoachModeCopy(input.mode).label} mode will not pause this request.`
  };
}

export function formatPolicyLevelSignalSummary(policyLevels: SessionRiskPolicyLevel[]): string {
  if (policyLevels.length === 0) {
    return 'Session budget engine returned no advisory, guardrail, or policy signals for this question.';
  }

  const counts = {
    policy: policyLevels.filter((level) => level === 'policy').length,
    guardrail: policyLevels.filter((level) => level === 'guardrail').length,
    advisory: policyLevels.filter((level) => level === 'advisory').length
  };
  const parts = [
    formatCount(counts.policy, 'policy'),
    formatCount(counts.guardrail, 'guardrail'),
    formatCount(counts.advisory, 'advisory')
  ].filter((part): part is string => Boolean(part));

  return `Session budget engine returned ${joinNaturalList(parts)} signal${policyLevels.length === 1 ? '' : 's'} for this question.`;
}

function sanitizePolicyWarnings(policyWarnings: string[]): string[] {
  const seen = new Set<string>();
  const blockers: string[] = [];

  for (const warning of policyWarnings) {
    const trimmed = warning.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    blockers.push(trimmed);
  }

  return blockers;
}

function advisoryOnlyBoundary(): string {
  return 'DocHermes is advisory-only: no wallet control, signing, routing, or trade execution.';
}

function formatCount(count: number, label: string): string | undefined {
  return count > 0 ? `${count} ${label}` : undefined;
}

function joinNaturalList(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
