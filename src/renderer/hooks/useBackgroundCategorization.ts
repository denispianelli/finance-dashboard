import { useCallback, useRef, useState } from 'react';
import type { CategorizeItem } from '@shared/types/import';
import { ipc } from '@renderer/ipc/client';

/** Items per LLM batch — small so views refresh progressively as categories land. */
const LLM_BATCH_SIZE = 12;

export interface BackgroundCategorization {
  /** True while a categorization pass is in flight. Drives the Topbar chip's visibility. */
  running: boolean;
  /** Transactions still to process. Drives the chip's count. */
  remaining: number;
  /** Start a pass. Idempotent: a no-op while one is already running. */
  run: () => Promise<void>;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Background classifier for the residual (uncategorized) transactions left after an
 * import. Pulls the pending set over IPC, categorizes batch by batch in the main
 * process, and calls `onApplied` whenever a batch lands so the views refetch and show
 * the new categories. Never blocks the UI; surfaced only by the discreet Topbar chip.
 */
export function useBackgroundCategorization(opts: {
  onApplied: () => void;
}): BackgroundCategorization {
  const { onApplied } = opts;
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  // Guards idempotency (concurrent imports must not double-run) without waiting on
  // the async `running` state to settle.
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const { items } = await ipc.invoke('categorize:pending', {});
      if (items.length === 0) return;

      setRunning(true);
      setRemaining(items.length);

      const batches = chunk<CategorizeItem>(items, LLM_BATCH_SIZE);
      for (const batch of batches) {
        const res = await ipc.invoke('categorize:batch', { items: batch });

        // The model isn't installed: nothing will ever succeed, so stop the whole pass.
        if (!res.ok && res.error === 'model_unavailable') break;

        // On `inference_failed` we just skip this batch and carry on.
        if (res.ok && res.applied > 0) onApplied();

        setRemaining((r) => Math.max(0, r - batch.length));
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      setRemaining(0);
    }
  }, [onApplied]);

  return { running, remaining, run };
}
