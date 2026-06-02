import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { ipc } from '@renderer/ipc/client';

export interface UseCategories {
  categories: CategoryDTO[];
  createCategory: (input: CreateCategoryInput) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  renameCategory: (id: string, newName: string) => Promise<void>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^[a-zA-Z]+:\s*/, '') : 'Erreur inattendue';
}

async function fetchCategories(): Promise<CategoryDTO[]> {
  const { categories } = await ipc.invoke('categories:list', {});
  return categories;
}

/** Loads categories and exposes create / delete / rename for the Catégories page. */
export function useCategories(): UseCategories {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);

  const reload = useCallback(async () => {
    setCategories(await fetchCategories());
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCategories().then((next) => {
      if (active) setCategories(next);
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

  const deleteCategory = useCallback(
    async (id: string) => {
      try {
        const { uncategorizedCount } = await ipc.invoke('categories:delete', { id });
        await reload();
        toast.success(
          uncategorizedCount > 0
            ? `Catégorie supprimée — ${String(uncategorizedCount)} transaction(s) en « non catégorisé »`
            : 'Catégorie supprimée',
        );
      } catch (e) {
        toast.error(`Suppression impossible : ${message(e)}`);
      }
    },
    [reload],
  );

  const renameCategory = useCallback(async (id: string, newName: string) => {
    try {
      const { categories: next } = await ipc.invoke('categories:rename', { id, newName });
      setCategories(next);
    } catch (e) {
      toast.error(`Renommage impossible : ${message(e)}`);
    }
  }, []);

  return { categories, createCategory, deleteCategory, renameCategory };
}
