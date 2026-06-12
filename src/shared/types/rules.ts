/** How a categorization rule matches a (normalized) transaction label. */
export type RuleMatchType = 'contains' | 'exact' | 'regex';

/** A categorization rule as exposed to the renderer (audit view + dialog). */
export interface RuleDTO {
  readonly id: string;
  readonly matchType: RuleMatchType;
  readonly matchValue: string;
  readonly categoryId: string;
  readonly hitCount: number;
  readonly createdAt: string;
}

/** Create/update input — id-less; update carries the id in its payload. */
export interface RuleInput {
  readonly matchType: RuleMatchType;
  readonly matchValue: string;
  readonly categoryId: string;
}
