import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AssetDTO, UpsertAssetInput } from '@shared/types/patrimoine';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Overline } from '../ui/overline';
import { formatEuro } from '../../lib/euro';

const eur = formatEuro;

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

export function PropertyCard({
  asset,
  onSave,
  onDelete,
}: {
  asset: AssetDTO | null;
  onSave: (input: UpsertAssetInput) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draftName, setDraftName] = useState(asset?.name ?? 'Résidence principale');
  const [draftValue, setDraftValue] = useState(asset?.declaredValue ?? 0);
  const [draftSharePct, setDraftSharePct] = useState(asset ? Math.round(asset.share * 100) : 50);

  function openEdit() {
    setDraftName(asset?.name ?? 'Résidence principale');
    setDraftValue(asset?.declaredValue ?? 0);
    setDraftSharePct(asset ? Math.round(asset.share * 100) : 50);
    setEditing(true);
  }

  function save() {
    const input: UpsertAssetInput = {
      ...(asset ? { id: asset.id } : {}),
      name: draftName.trim() || 'Résidence principale',
      kind: 'property',
      declaredValue: draftValue,
      share: draftSharePct / 100,
      valuedAt: new Date().toISOString().slice(0, 10),
    };
    onSave(input);
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3.5">
          <Overline>— II</Overline>
          <CardTitle>Bien immobilier</CardTitle>
        </div>
        {asset && !editing && !confirmingDelete && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={openEdit}
              aria-label="Modifier la valeur déclarée"
            >
              <Pencil size={14} strokeWidth={1.8} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              aria-label="Supprimer le bien"
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </Button>
          </div>
        )}
      </CardHeader>

      {confirmingDelete && asset ? (
        <div className="flex items-center gap-3">
          <span className="flex-1 font-sans text-[13px] text-paper-soft">
            Supprimer « {asset.name} » ?
          </span>
          <button
            type="button"
            onClick={() => {
              onDelete(asset.id);
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
      ) : editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
            Nom du bien
            <input
              autoFocus
              className={INPUT}
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
            Valeur déclarée (€)
            <input
              type="number"
              min={0}
              className={INPUT}
              value={draftValue}
              onChange={(e) => {
                setDraftValue(Number(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
            Quote-part (%)
            <input
              type="number"
              min={0}
              max={100}
              className={`${INPUT} w-24`}
              value={draftSharePct}
              onChange={(e) => {
                setDraftSharePct(Number(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Valider"
              onClick={save}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sage hover:bg-ink-3"
            >
              <Check size={14} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Annuler"
              onClick={() => {
                setEditing(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-ink-3"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      ) : asset ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[11px] text-paper-dim">{asset.name}</span>
            <span className="font-mono text-[13px] text-paper">{eur(asset.declaredValue)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[11px] text-paper-dim">Quote-part</span>
            <span className="font-mono text-[13px] text-paper">
              {String(Math.round(asset.share * 100))} %
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[11px] text-paper-dim">Valorisé le</span>
            <span className="font-mono text-[13px] text-paper">{asset.valuedAt}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-center font-sans text-[13px] text-paper-mute">
            Déclare la valeur de ton bien pour l&apos;inclure dans ton patrimoine net.
          </p>
          <Button variant="secondary" size="sm" onClick={openEdit}>
            <Plus size={14} strokeWidth={1.8} />
            Ajouter
          </Button>
        </div>
      )}
    </Card>
  );
}
