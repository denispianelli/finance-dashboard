import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/utils';

export function Chip({
  active = false,
  dotColor,
  children,
  onClick,
}: {
  active?: boolean;
  dotColor?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] items-center gap-[7px] rounded-full border px-[11px] font-sans text-[12.5px] font-medium transition-colors',
        active
          ? 'border-transparent bg-brass text-accent-ink'
          : 'border-line-2 bg-surface text-paper-soft hover:bg-surface-2',
      )}
    >
      {dotColor ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      ) : null}
      {children}
    </button>
  );
}
