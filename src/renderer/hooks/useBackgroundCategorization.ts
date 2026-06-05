import { useCallback, useRef, useState } from 'react';
import type { CategorizeItem } from '@shared/types/import';
import { ipc } from '@renderer/ipc/client';

/** Items per LLM batch — small so views refresh progressively as categories land. */
const LLM_BATCH_SIZE = 12;

export interface BackgroundCategorization {
  /** True while a categorization pass is in flight. */
  running: boolean;
  /** Count of uncategorized transactions — drives the Topbar trigger button. */
  pending: number;
  /** Transactions still to process in the active pass. Drives the running count. */
  remaining: number;
  /** Recompute the pending count (cheap — a COUNT, never loads the model). */
  refresh: () => Promise<void>;
  /** Run a pass over the residual. Idempotent: a no-op while one is already running. */
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
 * Background classifier for the residual (uncategorized) transactions. The heavy
 * LLM pass is **user-triggered** (the Topbar button) — it never runs on its own, so
 * the user keeps control of when the 1.9 GB model spins up. `refresh()` keeps a cheap
 * count of pending rows so the button can offer "Catégoriser (N)"; `run()` pulls the
 * pending set and categorizes batch by batch in main, calling `onApplied` as each
 * batch lands so the views refetch.
 */
export function useBackgroundCategorization(opts: {
  onApplied: () => void;
}): BackgroundCategorization {
  const { onApplied } = opts;
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(0);
  // Guards idempotency (a second trigger mid-pass must not double-run) without
  // waiting on the async `running` state to settle.
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    const { items } = await ipc.invoke('categorize:pending', {});
    setPending(items.length);
  }, []);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const { items } = await ipc.invoke('categorize:pending', {});
      if (items.length === 0) {
        setPending(0);
        return;
      }

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
      await refresh();
    }
  }, [onApplied, refresh]);

  return { running, pending, remaining, refresh, run };
}
