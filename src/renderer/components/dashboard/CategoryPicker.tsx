import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { CategoryForm } from '../categories/CategoryForm';
import { cn } from '../../lib/utils';

interface CategoryPickerProps {
  categories: CategoryDTO[];
  current: { name: string; color: string };
  onSelect: (categoryId: string) => void;
  onCreate: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

/** Inline category control for a transaction row: click to pick another
 *  category, or create one on the fly and assign it. */
export function CategoryPicker({ categories, current, onSelect, onCreate }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  function close() {
    setOpen(false);
    setCreating(false);
  }

  async function createAndAssign(input: CreateCategoryInput) {
    try {
      const cat = await onCreate(input);
      onSelect(cat.id);
      close();
    } catch {
      // hook already surfaced the error via toast
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 font-sans text-[11px] font-medium text-paper-soft hover:bg-ink-4"
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: current.color }} />
        {current.name}
        <ChevronDown size={11} strokeWidth={1.8} className="text-paper-dim" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-lg border border-line-2 bg-ink-3 p-1.5 shadow-xl">
            {creating ? (
              <div className="p-1.5">
                <CategoryForm
                  autoFocus
                  submitLabel="Créer et assigner"
                  onSubmit={createAndAssign}
                />
              </div>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelect(c.id);
                        close();
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-[12px] text-paper-soft hover:bg-ink-4',
                        c.name === current.name && 'text-paper',
                      )}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: c.color ?? '#6E6E78' }}
                      />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1 border-t border-line-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-[12px] text-brass hover:bg-ink-4"
                  >
                    <Plus size={13} strokeWidth={1.8} />
                    Nouvelle catégorie…
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </span>
  );
}
