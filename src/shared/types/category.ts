export interface CategoryDTO {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly parentId: string | null;
  readonly isDefault: boolean;
  readonly position: number;
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
