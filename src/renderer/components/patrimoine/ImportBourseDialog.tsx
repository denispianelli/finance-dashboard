import { useState } from 'react';
import { Upload } from 'lucide-react';
import type {
  CreateWrapperInput,
  ImportBourseResult,
  WrapperType,
  WrapperWithSupports,
} from '@shared/types/investment';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select } from '../ui/select';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

const WRAPPER_TYPE_LABELS: Record<WrapperType, string> = {
  pea: 'PEA',
  av: 'Assurance-vie',
  cto: 'CTO',
  other: 'Autre',
};

function basename(path: string): string {
  return path.replace(/.*[\\/]/, '');
}

export function ImportBourseDialog({
  open,
  onOpenChange,
  wrappers,
  onPickFile,
  onCreateWrapper,
  onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wrappers: WrapperWithSupports[];
  onPickFile: () => Promise<{ cancelled: true } | { cancelled: false; path: string }>;
  onCreateWrapper: (input: CreateWrapperInput) => Promise<{ id: string }>;
  onImport: (path: string, wrapperId: string) => Promise<ImportBourseResult>;
}) {
  const [csvPath, setCsvPath] = useState<string | null>(null);
  const [wrapperId, setWrapperId] = useState<string>('');
  const [newWrapperName, setNewWrapperName] = useState('');
  const [newWrapperType, setNewWrapperType] = useState<WrapperType>('pea');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportBourseResult | null>(null);

  const isNewWrapper = wrapperId === '__new__';
  const canImport =
    csvPath !== null &&
    (isNewWrapper ? newWrapperName.trim().length > 0 : wrapperId.length > 0) &&
    !importing;

  function resetState() {
    setCsvPath(null);
    setWrapperId('');
    setNewWrapperName('');
    setNewWrapperType('pea');
    setImporting(false);
    setResult(null);
  }

  function handleOpenChange(o: boolean) {
    if (!o) resetState();
    onOpenChange(o);
  }

  async function handlePickFile() {
    const r = await onPickFile();
    if (!r.cancelled) {
      setCsvPath(r.path);
    }
  }

  async function handleImport() {
    if (!csvPath) return;
    setImporting(true);
    try {
      let targetId = wrapperId;
      if (isNewWrapper) {
        const created = await onCreateWrapper({
          name: newWrapperName.trim(),
          type: newWrapperType,
        });
        targetId = created.id;
      }
      const res = await onImport(csvPath, targetId);
      setResult(res);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importer un relevé d&apos;opérations</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-[13px] text-paper-soft">
              {result.operationsImported} opération{result.operationsImported !== 1 ? 's' : ''}{' '}
              importée{result.operationsImported !== 1 ? 's' : ''} · {result.alreadyPresent} déjà
              présente{result.alreadyPresent !== 1 ? 's' : ''} · {result.skippedRows} ignorée
              {result.skippedRows !== 1 ? 's' : ''} · {result.createdSupports.length} support
              {result.createdSupports.length !== 1 ? 's' : ''} créé
              {result.createdSupports.length !== 1 ? 's' : ''}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Fermer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Step 1 — pick file */}
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void handlePickFile();
                }}
              >
                <Upload size={13} strokeWidth={1.8} />
                Choisir un fichier CSV
              </Button>
              {csvPath && (
                <p className="break-all font-mono text-[12px] text-paper-soft">
                  {basename(csvPath)}
                </p>
              )}
            </div>

            {/* Step 2 — target wrapper (only shown once a file is selected) */}
            {csvPath && (
              <div className="flex flex-col gap-3 border-t border-line-2 pt-3">
                <div className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                  <span>Enveloppe cible</span>
                  <Select
                    ariaLabel="Enveloppe cible"
                    value={wrapperId}
                    onValueChange={setWrapperId}
                    options={[
                      { value: '', label: '— choisir —' },
                      ...wrappers.map((w) => ({ value: w.id, label: w.name })),
                      { value: '__new__', label: '+ Nouvelle enveloppe' },
                    ]}
                    className="h-9 w-full text-[13px]"
                  />
                </div>

                {isNewWrapper && (
                  <>
                    <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                      Nom
                      <input
                        autoFocus
                        className={INPUT}
                        value={newWrapperName}
                        placeholder="Mon PEA"
                        onChange={(e) => {
                          setNewWrapperName(e.target.value);
                        }}
                      />
                    </label>
                    <div className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
                      <span>Type</span>
                      <Select
                        ariaLabel="Type"
                        value={newWrapperType}
                        onValueChange={(v) => {
                          setNewWrapperType(v as WrapperType);
                        }}
                        options={(
                          Object.entries(WRAPPER_TYPE_LABELS) as [WrapperType, string][]
                        ).map(([value, label]) => ({ value, label }))}
                        className="h-9 w-full text-[13px]"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 3 — import button */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canImport}
                onClick={() => {
                  void handleImport();
                }}
              >
                {importing ? 'Importation…' : 'Importer'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  handleOpenChange(false);
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
