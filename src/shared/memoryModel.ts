import type { MemoryContext } from './types';

export function createEmptyMemoryContext(): MemoryContext {
  return {
    matchedPatterns: [],
    recentNotes: []
  };
}

export function hasMemoryContextContent(memoryContext: MemoryContext): boolean {
  return (
    memoryContext.matchedPatterns.length > 0 ||
    memoryContext.recentNotes.length > 0 ||
    (memoryContext.postmortemSummaries?.length ?? 0) > 0 ||
    memoryContext.tradeHistorySummary !== undefined ||
    memoryContext.tradeBehaviorStats !== undefined ||
    (memoryContext.personalRules?.matchedRules.length ?? 0) > 0
  );
}
