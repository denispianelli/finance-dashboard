import { it, expect } from 'vitest';
import { shouldShowCategorizationPrompt } from '@renderer/components/model/triggerLogic';

const base = {
  state: 'absent' as const,
  pendingCount: 5,
  optOut: false,
  dismissedThisSession: false,
};

it('shows when model absent, pending>0, not opted out, not dismissed', () => {
  expect(shouldShowCategorizationPrompt(base)).toBe(true);
});
it('shows when model paused too', () => {
  expect(shouldShowCategorizationPrompt({ ...base, state: 'paused' })).toBe(true);
});
it('hides when no pending', () => {
  expect(shouldShowCategorizationPrompt({ ...base, pendingCount: 0 })).toBe(false);
});
it('hides when opted out', () => {
  expect(shouldShowCategorizationPrompt({ ...base, optOut: true })).toBe(false);
});
it('hides when dismissed this session', () => {
  expect(shouldShowCategorizationPrompt({ ...base, dismissedThisSession: true })).toBe(false);
});
it('hides when model is ready or downloading', () => {
  expect(shouldShowCategorizationPrompt({ ...base, state: 'ready' })).toBe(false);
  expect(shouldShowCategorizationPrompt({ ...base, state: 'downloading' })).toBe(false);
});
it('hides when model errored', () => {
  expect(shouldShowCategorizationPrompt({ ...base, state: 'error' })).toBe(false);
});
