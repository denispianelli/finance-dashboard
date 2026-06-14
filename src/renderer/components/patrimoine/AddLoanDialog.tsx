import { useState } from 'react';
import { ipc } from '../../ipc/client';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const ERR: Record<string, string> = {
  not_pdf: 'Ce fichier n’est pas un PDF.',
  no_text: 'Ce PDF n’a pas de couche texte (scan ?).',
  unrecognized_format: 'Format non reconnu — ce n’est pas un tableau d’amortissement LCL.',
};

export function AddLoanDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [parsed, setParsed] = useState<ParsedLoanTable | null>(null);
  const [name, setName] = useState('');
  const [sharePct, setSharePct] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function parseFromPath(path: string) {
    setError(null);
    const res = await ipc.invoke('patrimoine:parseLoanFile', { path });
    if (!res.ok) {
      setError(ERR[res.error] ?? 'Erreur de lecture.');
      return;
    }
    setParsed(res.parsed);
    setName(res.parsed.name);
  }

  async function pickAndParse() {
    const picked = await ipc.invoke('patrimoine:pickLoanFile', {});
    if (picked.cancelled) return;
    await parseFromPath(picked.path);
  }

  // Reuse the statement-import drag-and-drop: the preload turns each dropped File
  // into an absolute path via webUtils.getPathForFile (see ImportModal).
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const paths = window.electronAPI
      .getDroppedPaths(Array.from(e.dataTransfer.files))
      .filter(Boolean);
    if (paths[0]) void parseFromPath(paths[0]);
  }

  async function create() {
    if (!parsed) return;
    await ipc.invoke('patrimoine:createLoan', { parsed, name, share: sharePct / 100 });
    onCreated();
    onClose();
  }

  const first = parsed?.installments[0];
  const last = parsed ? parsed.installments[parsed.installments.length - 1] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line-2 bg-ink-2 p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 className="pb-3 font-sans text-sm font-medium text-paper">Ajouter un prêt</h2>
        {!parsed ? (
          <div
            className={cn(
              'flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors',
              dragOver ? 'border-brass bg-ink-3' : 'border-line-2',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => {
              setDragOver(false);
            }}
            onDrop={onDrop}
          >
            <p className="font-sans text-[13px] text-paper-soft">
              Glisse le tableau d&apos;amortissement PDF de ta banque (LCL) ici, ou
            </p>
            {error && <p className="font-sans text-[12px] text-coral">{error}</p>}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void pickAndParse();
              }}
            >
              Choisir le PDF…
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 font-mono text-[12px] text-paper">
            <div>
              Montant&nbsp;: {parsed.principal.toLocaleString('fr-FR')} € · Taux{' '}
              {parsed.nominalRate}&nbsp;% · {parsed.termMonths} mois
            </div>
            <div>
              1ʳᵉ échéance&nbsp;: {first?.dueDate} · CRD{' '}
              {first?.balanceAfter.toLocaleString('fr-FR')} €
            </div>
            <div>
              Dernière&nbsp;: {last?.dueDate} · CRD {last?.balanceAfter.toLocaleString('fr-FR')} €
            </div>
            <div>Total intérêts&nbsp;: {parsed.totals.interest.toLocaleString('fr-FR')} €</div>
            <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
              Nom
              <input
                className="h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-paper"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
              Quote-part (%)
              <input
                type="number"
                min={0}
                max={100}
                className="h-8 w-24 rounded-md border border-line-2 bg-ink-3 px-2 text-paper"
                value={sharePct}
                onChange={(e) => {
                  setSharePct(Number(e.target.value));
                }}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void create();
                }}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
