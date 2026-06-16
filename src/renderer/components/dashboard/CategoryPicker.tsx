import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { CategoryForm } from '../categories/CategoryForm';
import { cn } from '../../lib/utils';

interface CategoryPickerProps {
  categories: CategoryDTO[];
  current: { name: string; color: string };
  onSelect: (categoryId: string) => void;
  onCreate: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

const MENU_WIDTH = 240;
const MENU_MAX_HEIGHT = 320;
const GAP = 4;

/** Where the portalled menu sits. `flip` = anchored by its bottom edge above the
 *  trigger (when there isn't room below); otherwise anchored by its top below it. */
interface MenuPos {
  left: number;
  y: number;
  flip: boolean;
}

/** Inline category control for a transaction row: click to pick another
 *  category, or create one on the fly and assign it.
 *
 *  The menu is rendered in a portal with fixed positioning so it escapes the
 *  virtualized transaction list's `overflow` / `transform` stacking context —
 *  an in-flow `absolute` dropdown gets clipped and mis-layered there. */
export function CategoryPicker({ categories, current, onSelect, onCreate }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8));
    const flip = window.innerHeight - r.bottom < MENU_MAX_HEIGHT + GAP;
    const y = flip ? window.innerHeight - r.top + GAP : r.bottom + GAP;
    setPos({ left, y, flip });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setCreating(false);
    setPos(null);
  }

  // Close on scroll / resize rather than chase the trigger — the list scrolls
  // underneath and a detached menu would drift out of alignment. But ignore
  // scrolls that happen *inside* the menu's own category list.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      close();
    };
    const onResize = () => {
      close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

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
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (open) close();
          else openMenu();
        }}
        className={cn(
          'inline-flex w-[176px] items-center gap-[7px] rounded-full border px-[11px] py-[6px] font-sans text-[12px] text-paper-soft transition-colors',
          open ? 'border-line-3 bg-surface-2' : 'border-line-2 bg-surface hover:bg-surface-2',
        )}
      >
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: current.color }}
        />
        <span className="min-w-0 flex-1 truncate text-left">{current.name}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.8}
          className={cn('shrink-0 text-paper-dim transition-transform', open && 'rotate-180')}
        />
      </button>

      {open &&
        pos !== null &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[100]" onClick={close} aria-hidden />
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                left: pos.left,
                width: MENU_WIDTH,
                ...(pos.flip ? { bottom: pos.y } : { top: pos.y }),
              }}
              className="z-[101] rounded-lg border border-line-2 bg-ink-3 p-1.5 shadow-2"
            >
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
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.name === current.name && (
                          <Check size={12} strokeWidth={2} className="shrink-0 text-brass" />
                        )}
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
          </>,
          document.body,
        )}
    </span>
  );
}
