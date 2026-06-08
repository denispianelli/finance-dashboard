import type { ComponentProps } from 'react';
import { cn } from '@renderer/lib/utils';

/** Pulsing placeholder shown while content is being computed (e.g. a category
 *  being classified by the background LLM). Uses identity-scale tokens only. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-ink-3', className)} {...props} />;
}
