import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AssetClass, AssetDTO, UpsertAssetInput } from '@shared/types/patrimoine';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Overline } from '../ui/overline';
import { Money } from '../ui/money';
import { Select } from '../ui/select';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

// A declared asset's `kind` is vestigial (kept for data, no longer surfaced): an
// asset is categorised by its allocation CLASS, not a separate type label. New
// assets get this stable default; edits preserve whatever was stored.
const DEFAULT_KIND = 'declared';

export function AssetsCard({
  assets,
  classes,
  onSave,
  onDelete,
}: {
  assets: AssetDTO[];
  classes: AssetClass[];
  onSave: (input: UpsertAssetInput) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Draft fields shared by add and edit forms
  const [draftName, setDraftName] = useState('');
  const [draftClassId, setDraftClassId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState(0);
  const [draftSharePct, setDraftSharePct] = useState(100);

  const classOf = (id: string | null): AssetClass | undefined =>
    id === null ? undefined : classes.find((c) => c.id === id);

  function openAdd() {
    setEditingId(null);
    setConfirmingDeleteId(null);
    setDraftName('');
    setDraftClassId(classes[0]?.id ?? null);
    setDraftValue(0);
    setDraftSharePct(100);
    setAdding(true);
  }

  function openEdit(asset: AssetDTO) {
    setAdding(false);
    setConfirmingDeleteId(null);
    setDraftName(asset.name);
    setDraftClassId(asset.classId);
    setDraftValue(asset.declaredValue);
    setDraftSharePct(Math.round(asset.share * 100));
    setEditingId(asset.id);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
  }

  function save() {
    const isEdit = editingId !== null;
    const existingAsset = isEdit ? assets.find((a) => a.id === editingId) : null;
    const input: UpsertAssetInput = {
      ...(isEdit && editingId ? { id: editingId } : {}),
      name: draftName.trim() || 'Actif',
      kind: existingAsset?.kind ?? DEFAULT_KIND,
      declaredValue: draftValue,
      share: draftSharePct / 100,
      valuedAt: new Date().toISOString().slice(0, 10),
      classId: draftClassId,
    };
    onSave(input);
    cancelForm();
  }

  const formOpen = adding || editingId !== null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancelForm();
  };

  const formProps = {
    draftName,
    draftClassId,
    draftValue,
    draftSharePct,
    classes,
    onChangeName: setDraftName,
    onChangeClassId: setDraftClassId,
    onChangeValue: setDraftValue,
    onChangeSharePct: setDraftSharePct,
    onSave: save,
    onCancel: cancelForm,
    onKeyDown: handleKeyDown,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3.5">
          <Overline>Hors comptes</Overline>
          <CardTitle>Actifs déclarés</CardTitle>
        </div>
        {!formOpen && (
          <Button variant="secondary" size="sm" onClick={openAdd}>
            <Plus size={14} strokeWidth={1.8} />
            Ajouter un bien
          </Button>
        )}
      </CardHeader>

      <p className="-mt-1 font-sans text-[12px] text-paper-mute">
        Valorisés à la main, sans suivi de performance — résidence, immobilier. Pour un placement
        suivi en performance (PEA, AV…), utilise « Placements ».
      </p>

      {assets.length === 0 && !formOpen ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-center font-sans text-[13px] text-paper-mute">
            Aucun bien — déclare ta résidence, un bien immobilier…
          </p>
          <Button variant="secondary" size="sm" onClick={openAdd}>
            <Plus size={14} strokeWidth={1.8} />
            Ajouter
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {assets.map((asset) => {
            if (editingId === asset.id) {
              return <AssetForm key={asset.id} {...formProps} />;
            }

            if (confirmingDeleteId === asset.id) {
              return (
                <div key={asset.id} className="flex items-center gap-3">
                  <span className="flex-1 font-sans text-[13px] text-paper-soft">
                    Supprimer « {asset.name} » ?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(asset.id);
                      setConfirmingDeleteId(null);
                    }}
                    className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-ink-3"
                  >
                    Supprimer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDeleteId(null);
                    }}
                    className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-ink-3"
                  >
                    Annuler
                  </button>
                </div>
              );
            }

            const cls = classOf(asset.classId);
            return (
              <div key={asset.id} className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-sans text-[11px] text-paper-dim">
                    {cls ? (
                      <>
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                          style={{ background: cls.color }}
                          aria-hidden
                        />
                        {cls.name}
                      </>
                    ) : (
                      'Non classé'
                    )}
                  </span>
                  <span className="truncate font-sans text-[13px] text-paper">{asset.name}</span>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 text-right">
                  <Money value={asset.declaredValue} className="text-[13px]" />
                  <span className="font-sans text-[11px] text-paper-dim">
                    {String(Math.round(asset.share * 100))} %
                  </span>
                </div>
                <span className="hidden shrink-0 font-sans text-[11px] text-paper-dim sm:inline">
                  {asset.valuedAt}
                </span>
                {!formOpen && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        openEdit(asset);
                      }}
                      aria-label={`Modifier ${asset.name}`}
                    >
                      <Pencil size={14} strokeWidth={1.8} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setConfirmingDeleteId(asset.id);
                      }}
                      aria-label={`Supprimer ${asset.name}`}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {adding && <AssetForm {...formProps} />}
        </div>
      )}
    </Card>
  );
}

function AssetForm({
  draftName,
  draftClassId,
  draftValue,
  draftSharePct,
  classes,
  onChangeName,
  onChangeClassId,
  onChangeValue,
  onChangeSharePct,
  onSave,
  onCancel,
  onKeyDown,
}: {
  draftName: string;
  draftClassId: string | null;
  draftValue: number;
  draftSharePct: number;
  classes: AssetClass[];
  onChangeName: (v: string) => void;
  onChangeClassId: (v: string | null) => void;
  onChangeValue: (v: number) => void;
  onChangeSharePct: (v: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
        Nom
        <input
          autoFocus
          className={INPUT}
          value={draftName}
          placeholder="Actif"
          onChange={(e) => {
            onChangeName(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <div className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
        <span>Classe</span>
        <Select
          ariaLabel="Classe"
          value={draftClassId ?? ''}
          onValueChange={(v) => {
            onChangeClassId(v === '' ? null : v);
          }}
          options={[
            { value: '', label: 'Non classé' },
            ...classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
          className="h-9 w-full text-[13px]"
        />
        {classes.length === 0 && (
          <span className="font-sans text-[11px] text-paper-dim">
            Crée tes classes dans « Gérer les classes » sur la carte Allocation.
          </span>
        )}
      </div>
      <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
        Valeur déclarée (€)
        <input
          type="number"
          min={0}
          className={INPUT}
          value={draftValue}
          onChange={(e) => {
            onChangeValue(Number(e.target.value));
          }}
          onKeyDown={onKeyDown}
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
            onChangeSharePct(Number(e.target.value));
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Valider"
          onClick={onSave}
          className="flex h-7 w-7 items-center justify-center rounded-md text-sage hover:bg-ink-3"
        >
          <Check size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Annuler"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-ink-3"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
