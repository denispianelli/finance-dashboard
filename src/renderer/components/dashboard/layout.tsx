import type { ReactNode } from 'react';

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function Row2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[1.6fr_1fr]">{children}</div>;
}
