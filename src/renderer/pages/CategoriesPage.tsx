import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryDTO } from '@shared/types/category';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { CategoryIcon } from '../lib/categoryIcon';
import { CategoryForm } from '../components/categories/CategoryForm';
import { RulesSection } from '../components/categories/RulesSection';
import { useCategories } from '../hooks/useCategories';
import { cn } from '../lib/utils';

const INPUT =
  'h-9 rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

export function CategoriesPage() {
  const { categories, createCategory, deleteCategory, renameCategory } = useCategories();
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

        <p className="pb-1 font-sans text-[11px] text-paper-dim">
          La catégorisation est déterministe : tes règles à l'import, puis l'apprentissage de tes
          corrections. Les règles se gèrent dans la section ci-dessous.
        </p>

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
            <CategoryRow
              key={c.id}
              category={c}
              onRename={renameCategory}
              onDelete={deleteCategory}
            />
          ))}
        </div>
      </Card>
      <RulesSection categories={categories} />
    </>
  );
}

function CategoryRow({
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
      ) : confirmingDelete ? (
        <>
          <span className="flex-1 font-sans text-[13px] text-paper-soft">
            Supprimer « {category.name} » ? Les transactions associées repassent en « non catégorisé
            ».
          </span>
          <button
            type="button"
            onClick={() => {
              void onDelete(category.id);
              setConfirmingDelete(false);
            }}
            className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-ink-3"
          >
            Supprimer
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(false);
            }}
            className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-ink-3"
          >
            Annuler
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
          <button
            type="button"
            aria-label={`Supprimer ${category.name}`}
            onClick={() => {
              setConfirmingDelete(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim opacity-0 transition-opacity hover:bg-ink-3 hover:text-coral group-hover:opacity-100"
          >
            <Trash2 size={13} strokeWidth={1.6} />
          </button>
        </>
      )}
    </div>
  );
}
