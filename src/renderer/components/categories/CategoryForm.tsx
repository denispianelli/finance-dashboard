import { useState } from 'react';
import type { CreateCategoryInput } from '@shared/types/category';
import { Button } from '../ui/button';
import { CategoryIcon } from '../../lib/categoryIcon';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../lib/categoryOptions';
import { cn } from '../../lib/utils';

const INPUT =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

/** Name + color + icon form used both on the Catégories page and inline in the
 *  transaction category picker. Calls onSubmit with the chosen values. */
export function CategoryForm({
  onSubmit,
  submitLabel = 'Créer',
  autoFocus = false,
}: {
  onSubmit: (input: CreateCategoryInput) => void | Promise<void>;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState<string>('wallet');

  function submit() {
    const trimmed = name.trim();
    if (trimmed === '') return;
    void onSubmit({ name: trimmed, color, icon });
    setName('');
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input
        autoFocus={autoFocus}
        value={name}
        placeholder="Nom de la catégorie"
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className={INPUT}
      />
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Couleur ${c}`}
            aria-pressed={c === color}
            onClick={() => {
              setColor(c);
            }}
            className={cn(
              'h-5 w-5 rounded-full ring-offset-2 ring-offset-ink-2 transition-shadow',
              c === color && 'ring-2 ring-paper',
            )}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_ICONS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={`Icône ${key}`}
            aria-pressed={key === icon}
            onClick={() => {
              setIcon(key);
            }}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
              key === icon ? 'border-brass bg-brass-soft' : 'border-line-2 hover:bg-ink-3',
            )}
          >
            <CategoryIcon name={key} />
          </button>
        ))}
      </div>
      <Button size="sm" disabled={name.trim() === ''} onClick={submit} className="self-start">
        {submitLabel}
      </Button>
    </div>
  );
}
