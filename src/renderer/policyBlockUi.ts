export interface PolicyBlockUiCopy {
  title: string;
  summary: string;
  boundary: string;
  blockerHeading: string;
  contextHeading: string;
  noteLabel: string;
  notePlaceholder: string;
  noteHint: string;
  auditLabel: string;
  auditDetail: string;
  canOverride: boolean;
}

export function buildPolicyBlockUiCopy(input: { blockerCount: number; overrideNote: string }): PolicyBlockUiCopy {
  const blockerText =
    input.blockerCount === 1 ? '1 policy condition requires' : `${input.blockerCount} policy conditions require`;
  const canOverride = input.overrideNote.trim().length > 0;

  return {
    title: 'Policy mode block',
    summary: `Policy mode paused this request because ${blockerText} review before sending to Hermes.`,
    boundary: 'DocHermes records the override decision only. It cannot route, sign, execute, or enforce trades in your wallet.',
    blockerHeading: 'Policy conditions requiring override',
    contextHeading: 'Context used for the block',
    noteLabel: 'Override note (required)',
    notePlaceholder: 'State why this policy override is acceptable right now.',
    noteHint: canOverride
      ? 'This override will be saved to the local audit trail.'
      : 'Write a short override reason before sending is enabled.',
    auditLabel: 'Local audit trail',
    auditDetail: 'The override note and blocked conditions will be saved locally.',
    canOverride
  };
}
