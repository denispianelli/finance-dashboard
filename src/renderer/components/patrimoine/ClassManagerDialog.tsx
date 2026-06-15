import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  AssetClass,
  ClassifiableHolding,
  UpsertAssetClassInput,
} from '@shared/types/patrimoine';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { HoldingAssignmentList } from './HoldingAssignmentList';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

const PALETTE = [
  '#7C9A8E', // sage-ish
  '#D4B062', // brass
  '#C58B5C', // brass-brown
  '#8B8775', // paper-mute
  '#6E8FA6', // muted blue
  '#A6789B', // muted violet
];

interface ClassManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: AssetClass[];
  holdings: ClassifiableHolding[];
  onUpsertClass: (input: UpsertAssetClassInput) => void;
  onDeleteClass: (id: string) => void;
  onAssignClass: (kind: 'account' | 'asset' | 'loan', id: string, classId: string | null) => void;
}

export function ClassManagerDialog({
  open,
  onOpenChange,
  classes,
  holdings,
  onUpsertClass,
  onDeleteClass,
  onAssignClass,
}: ClassManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Classes d&apos;actifs</DialogTitle>
          <DialogDescription>
            Crée des classes, définis les cibles et affecte chaque compte ou bien.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {/* Section A — Classes */}
          <section className="mb-6">
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
              Classes
            </p>

            <div className="flex flex-col gap-1">
              {classes.map((cls) => (
                <ClassRow
                  key={cls.id}
                  cls={cls}
                  onUpsert={onUpsertClass}
                  onDelete={onDeleteClass}
                />
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                onUpsertClass({ name: 'Nouvelle classe', color: '#D4B062', targetPct: null });
              }}
            >
              <Plus size={13} strokeWidth={1.8} />
              Ajouter une classe
            </Button>
          </section>

          {/* Section B — Affectation */}
          <section>
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
              Affectation
            </p>
            <HoldingAssignmentList holdings={holdings} classes={classes} onAssign={onAssignClass} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClassRow({
  cls,
  onUpsert,
  onDelete,
}: {
  cls: AssetClass;
  onUpsert: (input: UpsertAssetClassInput) => void;
  onDelete: (id: string) => void;
}) {
  const [draftName, setDraftName] = useState(cls.name);
  const [draftColor, setDraftColor] = useState(cls.color);
  const [draftTarget, setDraftTarget] = useState(
    cls.targetPct == null ? '' : String(Math.round(cls.targetPct * 100)),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function commit() {
    const name = draftName;
    const color = draftColor;
    const targetPct = draftTarget.trim() === '' ? null : parseFloat(draftTarget) / 100;
    onUpsert({ id: cls.id, name: name.trim() || cls.name, color, targetPct });
  }

  function handleColorClick(hex: string) {
    setDraftColor(hex);
    const targetPct = draftTarget.trim() === '' ? null : parseFloat(draftTarget) / 100;
    onUpsert({ id: cls.id, name: draftName.trim() || cls.name, color: hex, targetPct });
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-line-2 bg-ink-2/60 px-2 py-1.5">
        <span className="flex-1 font-sans text-[13px] text-paper-soft">
          Supprimer « {cls.name} » ?
        </span>
        <button
          type="button"
          onClick={() => {
            onDelete(cls.id);
            setConfirmingDelete(false);
          }}
          className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-ink-3"
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmingDelete(false);
          }}
          className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-ink-3"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line-2 bg-ink-2/60 p-2">
      {/* Row 1: colour swatch + name + target + delete */}
      <div className="flex items-center gap-2">
        {/* Colour swatch */}
        <span className="h-4 w-4 shrink-0 rounded" style={{ background: draftColor }} />
        {/* Name */}
        <input
          className={`${INPUT} flex-1`}
          value={draftName}
          onChange={(e) => {
            setDraftName(e.target.value);
          }}
          onBlur={() => {
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {/* Target % */}
        <div className="relative flex shrink-0 items-center">
          <input
            type="number"
            min={0}
            max={100}
            className={`${INPUT} w-20 pr-5`}
            placeholder="—"
            value={draftTarget}
            onChange={(e) => {
              setDraftTarget(e.target.value);
            }}
            onBlur={() => {
              commit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <span className="pointer-events-none absolute right-2 font-sans text-[11px] text-paper-dim">
            %
          </span>
        </div>
        {/* Delete */}
        <button
          type="button"
          aria-label={`Supprimer ${cls.name}`}
          onClick={() => {
            setConfirmingDelete(true);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-paper-dim hover:bg-ink-3 hover:text-coral"
        >
          <Trash2 size={13} strokeWidth={1.6} />
        </button>
      </div>

      {/* Row 2: palette */}
      <div className="flex items-center gap-1.5 pl-6">
        {PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`Couleur ${hex}`}
            onClick={() => {
              handleColorClick(hex);
            }}
            className="h-4 w-4 rounded transition-transform hover:scale-110"
            style={{
              background: hex,
              outline: draftColor === hex ? '2px solid var(--paper)' : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
      </div>
    </div>
  );
}
