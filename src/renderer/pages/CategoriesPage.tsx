import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryDTO } from '@shared/types/category';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { CategoryIconTile } from '../lib/categoryIcon';
import { CategoryForm } from '../components/categories/CategoryForm';
import { RulesSection } from '../components/categories/RulesSection';
import { useCategories } from '../hooks/useCategories';
import { cn } from '../lib/utils';

const INPUT =
  'h-9 rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

export function CategoriesPage() {
  const { categories, createCategory, deleteCategory, renameCategory } = useCategories();
  const [adding, setAdding] = useState(false);
  const n = categories.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="tile p-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Overline>
              {n} catégorie{n > 1 ? 's' : ''}
            </Overline>
            <h2 className="mt-1 font-sans text-base font-semibold tracking-[-0.015em] text-paper">
              Catégories
            </h2>
            <p className="mt-1 max-w-[560px] font-sans text-[11px] text-paper-dim">
              La catégorisation est déterministe : tes règles à l'import, puis l'apprentissage de
              tes corrections. Les règles se gèrent dans la section ci-dessous.
            </p>
          </div>
          <Button
            onClick={() => {
              setAdding((a) => !a);
            }}
          >
            <Plus size={14} strokeWidth={1.8} />
            Nouvelle catégorie
          </Button>
        </div>

        {adding && (
          <div className="mt-4 rounded-md border border-line-2 bg-ink-3/60 p-3">
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              onRename={renameCategory}
              onDelete={deleteCategory}
            />
          ))}
        </div>
      </div>
      <RulesSection categories={categories} />
    </div>
  );
}

function CategoryCard({
  category,
  onRename,
  onDelete,
}: {
  category: CategoryDTO;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const count = category.txCount ?? 0;

  function save() {
    const next = draft.trim();
    if (next !== '' && next !== category.name) void onRename(category.id, next);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="tile flex items-center gap-2 p-[14px]">
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
          className={cn(INPUT, 'min-w-0 flex-1')}
        />
        <button
          type="button"
          aria-label="Valider"
          onClick={save}
          className="flex h-7 w-7 items-center justify-center rounded-md text-sage hover:bg-surface-2"
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
          className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-surface-2"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="tile flex flex-col gap-2 p-[14px]">
        <span className="font-sans text-[12px] text-paper-soft">
          Supprimer « {category.name} » ? Les transactions associées repassent en « non catégorisé
          ».
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void onDelete(category.id);
              setConfirmingDelete(false);
            }}
            className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-surface-2"
          >
            Supprimer
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(false);
            }}
            className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-surface-2"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group tile tile-hover flex items-center gap-3 p-[14px]">
      <CategoryIconTile name={category.icon ?? 'wallet'} color={category.color} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-sm text-paper">{category.name}</div>
        <div className="font-mono text-[11px] text-paper-dim">
          {count} transaction{count !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Renommer ${category.name}`}
          onClick={() => {
            setEditing(true);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-surface-2 hover:text-paper"
        >
          <Pencil size={13} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          aria-label={`Supprimer ${category.name}`}
          onClick={() => {
            setConfirmingDelete(true);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-surface-2 hover:text-coral"
        >
          <Trash2 size={13} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}
