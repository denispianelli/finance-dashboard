import { useState } from 'react';
import type { SupportUpdateInput, SupportWithPerf } from '@shared/types/investment';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

/**
 * Inner form — keyed on support.id so React re-mounts and re-initialises state
 * whenever the support changes, avoiding synchronous setState inside effects.
 */
function UpdateSupportForm({
  support,
  onSubmit,
  onCancel,
}: {
  support: SupportWithPerf;
  onSubmit: (input: SupportUpdateInput) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState(support.currentValue);
  const [flow, setFlow] = useState(0);

  function handleSubmit() {
    onSubmit({ supportId: support.id, asOf: date, value, flow });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
        Date
        <input
          type="date"
          className={INPUT}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
        />
      </label>

      <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
        Valeur actuelle (€)
        <input
          autoFocus
          type="number"
          min={0}
          step="0.01"
          className={INPUT}
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
      </label>

      <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
        Flux net depuis la dernière fois (€)
        <input
          type="number"
          step="0.01"
          className={INPUT}
          value={flow}
          onChange={(e) => {
            setFlow(Number(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
        <span className="font-sans text-[11px] text-paper-dim">
          Versement positif, retrait négatif
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSubmit}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

export function UpdateSupportDialog({
  open,
  onOpenChange,
  support,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  support: SupportWithPerf | null;
  onSubmit: (input: SupportUpdateInput) => void;
}) {
  if (!support) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mettre à jour {support.name}</DialogTitle>
        </DialogHeader>
        {/* key={support.id} ensures the form re-mounts with fresh state for each support */}
        <UpdateSupportForm
          key={support.id}
          support={support}
          onSubmit={(i) => {
            onSubmit(i);
            onOpenChange(false);
          }}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
