import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/utils';

export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-brass',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-paper-mute',
        className,
      )}
    >
      {children}
    </span>
  );
}
