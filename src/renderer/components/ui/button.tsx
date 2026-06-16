import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@renderer/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-[13px] font-medium tracking-[-0.005em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // accent-ink (not ink-1): stays dark on the lime fill in BOTH themes.
        // ink-1 is theme-flipped (near-white in light) → white-on-lime bug.
        default: 'bg-brass text-accent-ink hover:bg-brass-hi',
        destructive:
          'border border-line-2 bg-transparent text-coral hover:border-coral hover:bg-coral-soft',
        outline: 'border border-line-2 bg-ink-3 text-paper hover:bg-ink-4',
        secondary: 'border border-line-2 bg-ink-3 text-paper hover:bg-ink-4',
        ghost: 'bg-transparent text-paper-soft hover:bg-ink-3 hover:text-paper',
        link: 'text-brass underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-[14px]',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-11 px-[18px] text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
