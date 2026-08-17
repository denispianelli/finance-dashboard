export interface CategoryDTO {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly parentId: string | null;
  readonly isDefault: boolean;
  readonly position: number;
  /** Number of transactions assigned to this category. Set by listCategories;
   *  omitted by other constructors (treat as 0). */
  readonly txCount?: number;
}

export interface RenameCategoryInput {
  readonly id: string;
  readonly newName: string;
}

export interface CreateCategoryInput {
  readonly name: string;
  readonly color: string;
  readonly icon: string;
}

export interface SetTransactionCategoryInput {
  readonly transactionId: string;
  readonly categoryId: string;
}
