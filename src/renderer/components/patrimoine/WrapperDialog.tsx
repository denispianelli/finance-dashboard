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

/**
 * Two modes:
 * - create a new wrapper then add supports to it (default), or
 * - `existingWrapper` set → skip wrapper creation and add supports straight to it.
 * The parent remounts this with a `key` per target so the initial state is fresh each open.
 */
export function WrapperDialog({
  open,
  onOpenChange,
  classes,
  existingWrapper = null,
  onCreateWrapper,
  onCreateSupport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classes: AssetClass[];
  existingWrapper?: { id: string; name: string } | null;
  onCreateWrapper: (input: CreateWrapperInput) => Promise<{ id: string }>;
  onCreateSupport: (input: CreateSupportInput) => void;
}) {
  const isExisting = existingWrapper !== null;

  // Stage 1: create wrapper (skipped in existing-wrapper mode).
  const [wrapperName, setWrapperName] = useState('');
  const [wrapperType, setWrapperType] = useState<WrapperType>('pea');
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Stage 2: add supports.
  const [supportName, setSupportName] = useState('');
  const [supportIsin, setSupportIsin] = useState('');
  const [supportClassId, setSupportClassId] = useState<string>('');

  const wrapperId = existingWrapper?.id ?? createdId;
  const wrapperReady = wrapperId !== null;

  function resetSupportFields() {
    setSupportName('');
    setSupportIsin('');
    setSupportClassId('');
  }

  function handleOpenChange(o: boolean) {
    if (!o) {
      setWrapperName('');
      setWrapperType('pea');
      setCreating(false);
      setCreatedId(null);
      resetSupportFields();
    }
    onOpenChange(o);
  }

  async function handleCreateWrapper() {
    const name = wrapperName.trim() || 'Nouvelle enveloppe';
    setCreating(true);
    try {
      const result = await onCreateWrapper({ name, type: wrapperType });
      setCreatedId(result.id);
    } finally {
      setCreating(false);
    }
  }

  function handleAddSupport() {
    if (wrapperId === null) return;
    const name = supportName.trim();
    if (!name) return;
    onCreateSupport({
      wrapperId,
      name,
      isin: supportIsin.trim() || null,
      classId: supportClassId || null,
    });
    resetSupportFields();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isExisting ? `Ajouter un support — ${existingWrapper.name}` : 'Nouvelle enveloppe'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Stage 1 — create wrapper (only in new-wrapper mode) */}
          {!isExisting && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                Nom
                <input
                  autoFocus={!wrapperReady}
                  className={INPUT}
                  value={wrapperName}
                  placeholder="Mon PEA"
                  disabled={wrapperReady}
                  onChange={(e) => {
                    setWrapperName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !wrapperReady) void handleCreateWrapper();
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                Type
                <select
                  className={INPUT}
                  value={wrapperType}
                  disabled={wrapperReady}
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

              {!wrapperReady && (
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

              {wrapperReady && (
                <p className="font-sans text-[12px] text-[color:var(--color-income)]">
                  Enveloppe créée — ajoute des supports ci-dessous.
                </p>
              )}
            </div>
          )}

          {/* Stage 2 — add supports */}
          {wrapperReady && (
            <div
              className={
                isExisting
                  ? 'flex flex-col gap-3'
                  : 'flex flex-col gap-3 border-t border-line-2 pt-4'
              }
            >
              {!isExisting && (
                <p className="font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
                  Ajouter des supports
                </p>
              )}

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
