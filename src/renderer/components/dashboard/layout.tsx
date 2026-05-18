import type { ReactNode } from 'react';

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-4 gap-3.5">{children}</div>;
}

export function Row2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[1.6fr_1fr] gap-3.5">{children}</div>;
}
