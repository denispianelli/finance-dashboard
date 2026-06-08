import { useCallback, useRef, useState } from 'react';
import { ipc } from '@renderer/ipc/client';

export interface BackgroundCategorization {
  /** True while a categorization pass is in flight. */
  running: boolean;
  /** Count of uncategorized transactions (Σ group counts) — drives the Topbar trigger. */
  pending: number;
  /** Distinct labels still to process in the active pass — drives the running count. */
  remaining: number;
  /** Recompute the pending count (cheap — never loads the model). */
  refresh: () => Promise<void>;
  /** Run a pass over the residual. Idempotent: a no-op while one is already running. */
  run: () => Promise<void>;
}

/**
 * Background classifier for the residual. The heavy LLM pass is user-triggered (the
 * Topbar button). Each *distinct* label is classified in its own call (no batch
 * anchoring) and the result fans out to all rows sharing it (see applyCategoryToKey),
 * with `onApplied` fired per label so the views refetch progressively.
 */
export function useBackgroundCategorization(opts: {
  onApplied: () => void;
}): BackgroundCategorization {
  const { onApplied } = opts;
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(0);
  // Guards idempotency without waiting on the async `running` state to settle.
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    const { groups } = await ipc.invoke('categorize:pending', {});
    setPending(groups.reduce((sum, g) => sum + g.count, 0));
  }, []);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const { groups } = await ipc.invoke('categorize:pending', {});
      if (groups.length === 0) {
        setPending(0);
        return;
      }

      setRunning(true);
      setRemaining(groups.length);

      for (const group of groups) {
        const res = await ipc.invoke('categorize:batch', { key: group.key, label: group.label });

        // The model isn't installed: nothing will ever succeed, so stop the pass.
        if (!res.ok && res.error === 'model_unavailable') break;
        // On `inference_failed` we just skip this label and carry on.
        if (res.ok && res.applied > 0) onApplied();

        setRemaining((r) => Math.max(0, r - 1));
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
