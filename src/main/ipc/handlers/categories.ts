import type {
  CategoryDTO,
  CreateCategoryInput,
  RenameCategoryInput,
  SetTransactionCategoryInput,
} from '@shared/types/category';
import { getDb } from '../../db';
import {
  listCategories,
  createCategory,
  deleteCategory,
  setTransactionCategory,
} from '../../categorize/manage';
import { renameCategory } from '../../taxonomy/renameCategory';

export function handleCategoriesList(): { categories: CategoryDTO[] } {
  return { categories: listCategories(getDb()) };
}

export function handleCategoriesRename(payload: RenameCategoryInput): {
  categories: CategoryDTO[];
} {
  const db = getDb();
  renameCategory(db, { id: payload.id, newName: payload.newName });
  return { categories: listCategories(db) };
}

export function handleCategoriesCreate(payload: CreateCategoryInput): { category: CategoryDTO } {
  return { category: createCategory(getDb(), payload) };
}

export function handleCategoriesDelete(payload: { id: string }): { uncategorizedCount: number } {
  return deleteCategory(getDb(), payload.id);
}

export function handleTransactionsSetCategory(payload: SetTransactionCategoryInput): { ok: true } {
  setTransactionCategory(getDb(), payload);
  return { ok: true };
}
