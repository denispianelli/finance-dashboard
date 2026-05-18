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
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-sm border px-[9px] font-sans text-[11px] font-medium transition-colors',
        active
          ? 'border-[rgba(212,176,98,0.4)] bg-brass-soft text-paper'
          : 'border-line-2 bg-ink-3 text-paper-soft hover:bg-ink-4',
      )}
    >
      {dotColor ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      ) : null}
      {children}
    </button>
  );
}
