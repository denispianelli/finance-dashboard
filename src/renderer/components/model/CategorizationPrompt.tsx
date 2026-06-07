import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';

interface CategorizationPromptProps {
  pendingCount: number;
  onInstall: () => void;
  onDismiss: () => void;
  onOptOut: (value: boolean) => void;
}

export function CategorizationPrompt({
  pendingCount,
  onInstall,
  onDismiss,
  onOptOut,
}: CategorizationPromptProps) {
  const [optOut, setOptOut] = useState(false);

  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-line-2 border-l-2 border-l-brass bg-ink-2 py-3 pl-4 pr-3.5">
      <Sparkles size={16} strokeWidth={1.6} className="shrink-0 text-brass" />

      <span className="font-sans text-[13px] text-paper">
        Catégoriser ces <span className="font-mono tabular-nums">{pendingCount}</span> opérations
        automatiquement&nbsp;?
      </span>

      <span className="flex-1" />

      <label className="inline-flex cursor-pointer select-none items-center gap-2">
        <Checkbox
          checked={optOut}
          onCheckedChange={(checked) => {
            const value = checked === true;
            setOptOut(value);
            onOptOut(value);
          }}
        />
        <span className="font-sans text-[12px] text-paper-mute">Ne plus me proposer</span>
      </label>

      <Button size="sm" onClick={onInstall}>
        Activer
      </Button>

      <button
        type="button"
        aria-label="Fermer"
        onClick={onDismiss}
        className="flex shrink-0 rounded-md p-1 text-paper-dim transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass"
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
