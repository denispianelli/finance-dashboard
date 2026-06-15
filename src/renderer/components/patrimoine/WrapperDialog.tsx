import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { AssetClass } from '@shared/types/patrimoine';
import type { CreateSupportInput, CreateWrapperInput, WrapperType } from '@shared/types/investment';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

const WRAPPER_TYPE_LABELS: Record<WrapperType, string> = {
  pea: 'PEA',
  av: 'Assurance-vie',
  cto: 'CTO',
  other: 'Autre',
};

export function WrapperDialog({
  open,
  onOpenChange,
  classes,
  onCreateWrapper,
  onCreateSupport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classes: AssetClass[];
  onCreateWrapper: (input: CreateWrapperInput) => Promise<{ id: string }>;
  onCreateSupport: (input: CreateSupportInput) => void;
}) {
  // Stage 1: create wrapper
  const [wrapperName, setWrapperName] = useState('');
  const [wrapperType, setWrapperType] = useState<WrapperType>('pea');
  const [creating, setCreating] = useState(false);

  // Stage 2: add supports (wrapperId set after creation)
  const [wrapperId, setWrapperId] = useState<string | null>(null);
  const [supportName, setSupportName] = useState('');
  const [supportIsin, setSupportIsin] = useState('');
  const [supportClassId, setSupportClassId] = useState<string>('');

  function reset() {
    setWrapperName('');
    setWrapperType('pea');
    setCreating(false);
    setWrapperId(null);
    setSupportName('');
    setSupportIsin('');
    setSupportClassId('');
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  async function handleCreateWrapper() {
    const name = wrapperName.trim() || 'Nouvelle enveloppe';
    setCreating(true);
    try {
      const result = await onCreateWrapper({ name, type: wrapperType });
      setWrapperId(result.id);
    } finally {
      setCreating(false);
    }
  }

  function handleAddSupport() {
    if (!wrapperId) return;
    const name = supportName.trim();
    if (!name) return;
    onCreateSupport({
      wrapperId,
      name,
      isin: supportIsin.trim() || null,
      classId: supportClassId || null,
    });
    setSupportName('');
    setSupportIsin('');
    setSupportClassId('');
  }

  const wrapperCreated = wrapperId !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle enveloppe</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Stage 1 — create wrapper */}
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
              Nom
              <input
                autoFocus={!wrapperCreated}
                className={INPUT}
                value={wrapperName}
                placeholder="Mon PEA"
                disabled={wrapperCreated}
                onChange={(e) => {
                  setWrapperName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !wrapperCreated) void handleCreateWrapper();
                }}
              />
            </label>

            <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
              Type
              <select
                className={INPUT}
                value={wrapperType}
                disabled={wrapperCreated}
                onChange={(e) => {
                  setWrapperType(e.target.value as WrapperType);
                }}
              >
                {(Object.entries(WRAPPER_TYPE_LABELS) as [WrapperType, string][]).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            {!wrapperCreated && (
              <Button
                variant="secondary"
                size="sm"
                disabled={creating}
                onClick={() => {
                  void handleCreateWrapper();
                }}
              >
                Créer l&apos;enveloppe
              </Button>
            )}

            {wrapperCreated && (
              <p className="font-sans text-[12px] text-[color:var(--color-income)]">
                Enveloppe créée — ajoute des supports ci-dessous.
              </p>
            )}
          </div>

          {/* Stage 2 — add supports */}
          {wrapperCreated && (
            <div className="flex flex-col gap-3 border-t border-line-2 pt-4">
              <p className="font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
                Ajouter des supports
              </p>

              <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                Nom du support
                <input
                  autoFocus
                  className={INPUT}
                  value={supportName}
                  placeholder="World ETF"
                  onChange={(e) => {
                    setSupportName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSupport();
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                ISIN (optionnel)
                <input
                  className={INPUT}
                  value={supportIsin}
                  placeholder="IE00B4L5Y983"
                  onChange={(e) => {
                    setSupportIsin(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSupport();
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                Classe d&apos;actif (optionnel)
                <select
                  className={INPUT}
                  value={supportClassId}
                  onChange={(e) => {
                    setSupportClassId(e.target.value);
                  }}
                >
                  <option value="">Non classé</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddSupport}
                  disabled={!supportName.trim()}
                >
                  <Plus size={13} strokeWidth={1.8} />
                  Ajouter un support
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    handleOpenChange(false);
                  }}
                >
                  Terminer
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
