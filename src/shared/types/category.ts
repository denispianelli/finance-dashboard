export type RuleMatchType = 'contains' | 'exact' | 'regex';

export interface CategoryDTO {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly parentId: string | null;
  readonly isDefault: boolean;
  readonly position: number;
}

export interface RuleDTO {
  readonly id: string;
  readonly matchType: RuleMatchType;
  readonly matchValue: string;
  readonly categoryId: string;
  /** Resolved category name for display, null if the category is missing. */
  readonly categoryName: string | null;
  readonly hitCount: number;
}

export interface CreateRuleInput {
  readonly matchType: RuleMatchType;
  readonly matchValue: string;
  readonly categoryId: string;
}

export interface RenameCategoryInput {
  readonly id: string;
  readonly newName: string;
}
