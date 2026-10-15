import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@renderer/lib/utils';

interface BentoProps {
  children: ReactNode;
  className?: string;
}

export function Bento({ children, className }: BentoProps) {
  return <div className={cn('grid grid-cols-12 items-start gap-4', className)}>{children}</div>;
}

interface TileProps extends HTMLAttributes<HTMLDivElement> {
  span: number;
  rowSpan?: number;
  children: ReactNode;
}

export function Tile({ span, rowSpan, className, style, children, ...rest }: TileProps) {
  return (
    <div
      className={cn('tile tile-hover p-[22px]', className)}
      style={{
        gridColumn: `span ${String(span)}`,
        gridRow: rowSpan ? `span ${String(rowSpan)}` : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
