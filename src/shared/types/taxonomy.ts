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
