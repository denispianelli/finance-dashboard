import type {
  CategoryDTO,
  CreateCategoryInput,
  CreateRuleInput,
  RenameCategoryInput,
  RuleDTO,
  SetTransactionCategoryInput,
} from '@shared/types/category';
import { getDb } from '../../db';
import {
  listCategories,
  listRules,
  createRule,
  deleteRule,
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

export function handleRulesList(): { rules: RuleDTO[] } {
  return { rules: listRules(getDb()) };
}

export function handleRulesCreate(payload: CreateRuleInput): { rule: RuleDTO } {
  return { rule: createRule(getDb(), payload) };
}

export function handleRulesDelete(payload: { id: string }): { ok: true } {
  deleteRule(getDb(), payload.id);
  return { ok: true };
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
