import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  CategoryDTO,
  CreateCategoryInput,
  CreateRuleInput,
  RuleDTO,
} from '@shared/types/category';
import { ipc } from '@renderer/ipc/client';

export interface UseCategories {
  categories: CategoryDTO[];
  rules: RuleDTO[];
  createCategory: (input: CreateCategoryInput) => Promise<void>;
  createRule: (input: CreateRuleInput) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  renameCategory: (id: string, newName: string) => Promise<void>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^[a-zA-Z]+:\s*/, '') : 'Erreur inattendue';
}

async function fetchAll(): Promise<{ categories: CategoryDTO[]; rules: RuleDTO[] }> {
  const [c, r] = await Promise.all([
    ipc.invoke('categories:list', {}),
    ipc.invoke('rules:list', {}),
  ]);
  return { categories: c.categories, rules: r.rules };
}

/** Loads categories + rules and exposes the rule/category mutations the
 *  Catégories page needs. Each mutation refetches and toasts the outcome. */
export function useCategories(): UseCategories {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [rules, setRules] = useState<RuleDTO[]>([]);

  const reload = useCallback(async () => {
    const data = await fetchAll();
    setCategories(data.categories);
    setRules(data.rules);
  }, []);

  // Initial load — setState lives in the promise callback (not a synchronous
  // effect body) so it doesn't trip react-hooks/set-state-in-effect.
  useEffect(() => {
    let active = true;
    void fetchAll().then((data) => {
      if (!active) return;
      setCategories(data.categories);
      setRules(data.rules);
    });
    return () => {
      active = false;
    };
  }, []);

  const createCategory = useCallback(
    async (input: CreateCategoryInput) => {
      try {
        const { category } = await ipc.invoke('categories:create', input);
        await reload();
        toast.success(`Catégorie « ${category.name} » créée`);
      } catch (e) {
        toast.error(`Catégorie non créée : ${message(e)}`);
      }
    },
    [reload],
  );

  const createRule = useCallback(
    async (input: CreateRuleInput) => {
      try {
        await ipc.invoke('rules:create', input);
        await reload();
        toast.success('Règle ajoutée — appliquée aux prochains imports');
      } catch (e) {
        toast.error(`Règle non créée : ${message(e)}`);
      }
    },
    [reload],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      try {
        await ipc.invoke('rules:delete', { id });
        await reload();
      } catch (e) {
        toast.error(`Suppression impossible : ${message(e)}`);
      }
    },
    [reload],
  );

  const renameCategory = useCallback(
    async (id: string, newName: string) => {
      try {
        const { categories: next } = await ipc.invoke('categories:rename', { id, newName });
        setCategories(next);
        await reload();
      } catch (e) {
        toast.error(`Renommage impossible : ${message(e)}`);
      }
    },
    [reload],
  );

  return { categories, rules, createCategory, createRule, deleteRule, renameCategory };
}
