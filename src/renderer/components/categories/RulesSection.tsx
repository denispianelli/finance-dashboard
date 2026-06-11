import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import type { CategoryDTO } from '@shared/types/category';
import type { RuleDTO, RuleMatchType } from '@shared/types/rules';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Overline } from '../ui/overline';
import { useRules } from '../../hooks/useRules';
import { cn } from '../../lib/utils';

const FIELD =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[12px] text-paper focus:outline-none focus:ring-1 focus:ring-brass';
const ICON_BTN = 'rounded p-1 text-paper-dim hover:text-paper hover:bg-ink-2';

const TYPE_LABEL: Record<RuleMatchType, string> = {
  contains: 'contient',
  exact: 'exact',
  regex: 'regex',
};

/**
 * Audit/repair surface for the categorization rules (ADR-019: rules are the
 * engine now). Lists ALL rules — seed and user — in matching order (first match
 * wins); creation stays contextual (RuleDialog from the reassign toast).
 */
export function RulesSection({ categories }: { categories: CategoryDTO[] }) {
  const { rules, updateRule, deleteRule } = useRules();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3.5">
          <Overline>— II</Overline>
          <CardTitle>Règles</CardTitle>
        </div>
      </CardHeader>
      <p className="pb-1 font-sans text-[11px] text-paper-dim">
        Appliquées dans l'ordre à l'import (première règle qui matche). Crée une règle depuis une
        correction : reclasse une transaction, puis « Créer une règle » dans la notification.
      </p>
      <div className="flex flex-col">
        {rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            categories={categories}
            onUpdate={updateRule}
            onDelete={deleteRule}
          />
        ))}
      </div>
    </Card>
  );
}

function RuleRow({
  rule,
  categories,
  onUpdate,
  onDelete,
}: {
  rule: RuleDTO;
  categories: CategoryDTO[];
  onUpdate: (input: {
    id: string;
    matchType: RuleMatchType;
    matchValue: string;
    categoryId: string;
  }) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [matchType, setMatchType] = useState<RuleMatchType>(rule.matchType);
  const [matchValue, setMatchValue] = useState(rule.matchValue);
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const category = categories.find((c) => c.id === rule.categoryId);

  if (editing) {
    return (
      <div className="flex items-center gap-2 border-b border-line-1 py-2">
        <select
          aria-label="Type de la règle"
          className={FIELD}
          value={matchType}
          onChange={(e) => {
            setMatchType(e.target.value as RuleMatchType);
          }}
        >
          <option value="contains">Contient</option>
          <option value="exact">Exact</option>
          <option value="regex">Regex</option>
        </select>
        <input
          aria-label="Valeur de la règle"
          className={cn(FIELD, 'min-w-0 flex-1')}
          value={matchValue}
          onChange={(e) => {
            setMatchValue(e.target.value);
          }}
        />
        <select
          aria-label="Catégorie de la règle"
          className={FIELD}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
          }}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Enregistrer la règle"
          className={ICON_BTN}
          onClick={() => {
            void onUpdate({ id: rule.id, matchType, matchValue, categoryId }).then((ok) => {
              if (ok) setEditing(false);
            });
          }}
        >
          <Check size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Annuler la modification"
          className={ICON_BTN}
          onClick={() => {
            setEditing(false);
            setConfirming(false);
            setMatchType(rule.matchType);
            setMatchValue(rule.matchValue);
            setCategoryId(rule.categoryId);
          }}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2.5 border-b border-line-1 py-2">
      <span className="w-16 shrink-0 rounded-sm border border-line-2 bg-ink-3 px-1.5 py-0.5 text-center font-sans text-[10px] uppercase tracking-[0.08em] text-paper-mute">
        {TYPE_LABEL[rule.matchType]}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-paper">
        {rule.matchValue}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-sans text-[11px] text-paper-soft">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: category?.color ?? '#888888' }}
        />
        {category?.name ?? rule.categoryId}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-paper-dim">
        {rule.hitCount} ×
      </span>
      <span className="hidden w-20 shrink-0 text-right font-mono text-[10px] text-paper-dim xl:block">
        {rule.createdAt.slice(0, 10)}
      </span>
      <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Modifier la règle"
          className={ICON_BTN}
          onClick={() => {
            setEditing(true);
            setConfirming(false);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
        </button>
        {confirming ? (
          <button
            type="button"
            aria-label="Confirmer la suppression"
            className={cn(ICON_BTN, 'text-flag')}
            onClick={() => {
              void onDelete(rule.id);
            }}
          >
            <Check size={14} strokeWidth={1.8} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Supprimer la règle"
            className={ICON_BTN}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}
      </span>
    </div>
  );
}
