import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ipc } from '@renderer/ipc/client';

export interface BackgroundCategorization {
  /** True while a categorization pass is in flight. */
  running: boolean;
  /** Count of uncategorized transactions (Σ group counts) — drives the install banner. */
  pending: number;
  /** Distinct labels still to process in the active pass — drives the running count. */
  remaining: number;
  /** Recompute the pending count (cheap — never loads the model). */
  refresh: () => Promise<void>;
  /** Run a pass over the residual. Idempotent: a no-op while one is already running. */
  run: () => Promise<void>;
}

/**
 * Background classifier for the residual. The pass runs automatically (after an
 * import, or when the model install finishes) — never user-triggered. Each
 * *distinct* label is classified in its own call (no batch anchoring) and the
 * result fans out to all rows sharing it (see applyCategoryToKey), with
 * `onApplied` fired per label so the views refetch progressively. One summary
 * toast reports what was applied and what is left to do manually.
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

    let applied = 0;
    let residual = 0;
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

        // No model (e.g. removed in Settings mid-pass): stop silently — the
        // install banner is the call to action, not an error toast.
        if (!res.ok && res.error === 'model_unavailable') break;
        // On `inference_failed` we just skip this label and carry on.
        if (res.ok) {
          applied += res.applied;
          residual += res.residual;
          if (res.applied > 0) onApplied();
        }

        setRemaining((r) => Math.max(0, r - 1));
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      setRemaining(0);
      await refresh();
    }
    if (applied > 0 || residual > 0) {
      const s = applied > 1 ? 's' : '';
      toast.success(
        `Catégorisation terminée — ${String(applied)} transaction${s} catégorisée${s}, ${String(residual)} à classer manuellement`,
      );
    }
  }, [onApplied, refresh]);

  return { running, pending, remaining, refresh, run };
}
