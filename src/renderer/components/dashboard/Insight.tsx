import type { ReactNode } from 'react';
import { Overline } from '../ui/overline';

export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-lg border border-line-2 bg-ink-2 py-[18px] pl-8 pr-5 before:absolute before:bottom-[18px] before:left-3.5 before:top-[18px] before:w-px before:bg-brass before:content-['']">
      <Overline>Insights</Overline>
      {children}
    </div>
  );
}

export function Quote({ children, size = 17 }: { children: ReactNode; size?: number }) {
  return (
    <p className="font-sans font-semibold leading-snug text-paper" style={{ fontSize: size }}>
      {children}
    </p>
  );
}

export function QuoteNum({ children }: { children: ReactNode }) {
  return <span className="font-mono text-brass">{children}</span>;
}
