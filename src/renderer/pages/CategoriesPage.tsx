import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryDTO, RuleMatchType } from '@shared/types/category';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Chip } from '../components/ui/chip';
import { Overline } from '../components/ui/overline';
import { CategoryIcon } from '../lib/categoryIcon';
import { CategoryForm } from '../components/categories/CategoryForm';
import { useCategories } from '../hooks/useCategories';
import { cn } from '../lib/utils';

const INPUT =
  'h-9 rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';
const MATCH_LABELS: Record<RuleMatchType, string> = {
  contains: 'contient',
  exact: 'exact',
  regex: 'regex',
};

export function CategoriesPage() {
  const { categories, rules, createCategory, createRule, deleteRule, renameCategory } =
    useCategories();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— I</Overline>
            <CardTitle>Catégories</CardTitle>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAdding((a) => !a);
            }}
          >
            <Plus size={14} strokeWidth={1.8} />
            Nouvelle catégorie
          </Button>
        </CardHeader>
        {adding && (
          <div className="mb-2 rounded-md border border-line-2 bg-ink-2/60 p-3">
            <CategoryForm
              autoFocus
              submitLabel="Créer la catégorie"
              onSubmit={(input) => {
                void createCategory(input);
                setAdding(false);
              }}
            />
          </div>
        )}
        <div className="flex flex-col">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} onRename={renameCategory} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— II</Overline>
            <CardTitle>Règles de catégorisation</CardTitle>
          </div>
          <span className="font-sans text-[11px] text-paper-dim">
            appliquées aux prochains imports
          </span>
        </CardHeader>

        <AddRuleForm
          categories={categories}
          onAdd={(input) => {
            void createRule(input);
          }}
        />

        <div className="mt-3 flex flex-col">
          {rules.map((r) => (
            <div
              key={r.id}
              className="group grid grid-cols-[1fr_88px_minmax(0,1fr)_48px_32px] items-center gap-3 border-b border-line-1 py-2"
            >
              <span className="truncate font-mono text-[12px] text-paper">{r.matchValue}</span>
              <Chip>{MATCH_LABELS[r.matchType]}</Chip>
              <span className="inline-flex min-w-0 items-center gap-1.5 font-sans text-[12px] text-paper-soft">
                <CategoryIcon name={iconFor(categories, r.categoryId)} />
                <span className="truncate">{r.categoryName ?? '(supprimée)'}</span>
              </span>
              <span className="text-right font-mono text-[11px] text-paper-mute" title="hits">
                {r.hitCount}
              </span>
              <button
                type="button"
                aria-label={`Supprimer la règle ${r.matchValue}`}
                onClick={() => {
                  void deleteRule(r.id);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim opacity-0 transition-opacity hover:bg-ink-3 hover:text-coral group-hover:opacity-100"
              >
                <Trash2 size={14} strokeWidth={1.6} />
              </button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="py-6 text-center text-sm text-paper-mute">Aucune règle.</p>
          )}
        </div>
      </Card>
    </>
  );
}

function iconFor(categories: CategoryDTO[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.icon ?? 'wallet';
}

function CategoryRow({
  category,
  onRename,
}: {
  category: CategoryDTO;
  onRename: (id: string, newName: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  function save() {
    const next = draft.trim();
    if (next !== '' && next !== category.name) void onRename(category.id, next);
    setEditing(false);
  }

  return (
    <div className="group flex items-center gap-2.5 border-b border-line-1 py-2">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: category.color ?? '#6E6E78' }}
      />
      <CategoryIcon name={category.icon ?? 'wallet'} />
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            className={cn(INPUT, 'flex-1')}
          />
          <button
            type="button"
            aria-label="Valider"
            onClick={save}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sage hover:bg-ink-3"
          >
            <Check size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Annuler"
            onClick={() => {
              setEditing(false);
              setDraft(category.name);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-ink-3"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 font-sans text-[13px] text-paper">{category.name}</span>
          <button
            type="button"
            aria-label={`Renommer ${category.name}`}
            onClick={() => {
              setEditing(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim opacity-0 transition-opacity hover:bg-ink-3 hover:text-paper group-hover:opacity-100"
          >
            <Pencil size={13} strokeWidth={1.6} />
          </button>
        </>
      )}
    </div>
  );
}

function AddRuleForm({
  categories,
  onAdd,
}: {
  categories: CategoryDTO[];
  onAdd: (input: { matchType: RuleMatchType; matchValue: string; categoryId: string }) => void;
}) {
  const [matchValue, setMatchValue] = useState('');
  const [matchType, setMatchType] = useState<RuleMatchType>('contains');
  const [categoryId, setCategoryId] = useState('');

  const canAdd = matchValue.trim() !== '' && categoryId !== '';

  function submit() {
    if (!canAdd) return;
    onAdd({ matchType, matchValue, categoryId });
    setMatchValue('');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-2 bg-ink-2/60 p-2.5">
      <input
        value={matchValue}
        placeholder="Libellé contient… (ex. IKEA)"
        onChange={(e) => {
          setMatchValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className={cn(INPUT, 'min-w-[180px] flex-1')}
      />
      <select
        value={matchType}
        aria-label="Type de correspondance"
        onChange={(e) => {
          setMatchType(e.target.value as RuleMatchType);
        }}
        className={INPUT}
      >
        <option value="contains">contient</option>
        <option value="exact">exact</option>
        <option value="regex">regex</option>
      </select>
      <select
        value={categoryId}
        aria-label="Catégorie"
        onChange={(e) => {
          setCategoryId(e.target.value);
        }}
        className={INPUT}
      >
        <option value="">Catégorie…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!canAdd} onClick={submit}>
        <Plus size={14} strokeWidth={1.8} />
        Ajouter
      </Button>
    </div>
  );
}
