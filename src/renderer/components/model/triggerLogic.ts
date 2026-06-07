import type { ModelState } from '@shared/types/ipc';

export interface PromptInputs {
  state: ModelState;
  pendingCount: number;
  optOut: boolean;
  dismissedThisSession: boolean;
}

/** Scenario (a): propose categorization only when it would actually help. */
export function shouldShowCategorizationPrompt(i: PromptInputs): boolean {
  const modelMissing = i.state === 'absent' || i.state === 'paused';
  return modelMissing && i.pendingCount > 0 && !i.optOut && !i.dismissedThisSession;
}
