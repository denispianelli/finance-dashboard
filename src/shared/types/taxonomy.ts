export interface MappingRule {
  readonly kind: 'label-regex';
  readonly rules: readonly { readonly pattern: string; readonly target_id: string }[];
}

export interface RenamePayload {
  readonly kind: 'rename';
  readonly old_name: string;
  readonly new_name: string;
}

export type SplitPayload = MappingRule;

export type TaxonomyEventKind = 'rename' | 'split' | 'merge';

export type ResolvedCategory =
  | { readonly id: string; readonly name: string }
  | {
      readonly id: string;
      readonly name: string;
      readonly splitInto: readonly { readonly id: string; readonly name: string }[];
    };

export type AggregationMode = 'as_of_period' | 'as_of_now';

export interface AggregationBucket {
  readonly categoryId: string;
  readonly name: string;
  readonly total: number;
  readonly count: number;
}
