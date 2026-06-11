import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { RuleDTO, RuleInput } from '@shared/types/rules';
import { ipc } from '@renderer/ipc/client';

function appliedSuffix(applied: number): string {
  if (applied === 0) return '';
  return ` — ${String(applied)} transaction${applied > 1 ? 's' : ''} catégorisée${applied > 1 ? 's' : ''}`;
}

export interface UseRules {
  rules: RuleDTO[];
  reload: () => Promise<void>;
  /** Returns false when the backend rejects the input (invalid_rule). */
  updateRule: (input: RuleInput & { id: string }) => Promise<boolean>;
  deleteRule: (id: string) => Promise<void>;
}

/** Rule list + mutations for the audit section. Creation lives in RuleDialog. */
export function useRules(): UseRules {
  const [rules, setRules] = useState<RuleDTO[]>([]);

  const reload = useCallback(async () => {
    const { rules: next } = await ipc.invoke('rules:list', {});
    setRules(next);
  }, []);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  const updateRule = useCallback(
    async (input: RuleInput & { id: string }) => {
      const res = await ipc.invoke('rules:update', input);
      if (!res.ok) return false;
      toast.success(`Règle mise à jour${appliedSuffix(res.applied)}`);
      await reload();
      return true;
    },
    [reload],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await ipc.invoke('rules:delete', { id });
      toast.success('Règle supprimée');
      await reload();
    },
    [reload],
  );

  return { rules, reload, updateRule, deleteRule };
}
