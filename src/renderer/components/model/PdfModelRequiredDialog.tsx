import { ArrowDownToLine, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';

interface PdfModelRequiredDialogProps {
  open: boolean;
  sizeLabel: string; // e.g. "~4,7 Go" — from the parent's modelStatus.target
  onInstall: () => void;
  onClose: () => void;
}

export function PdfModelRequiredDialog({
  open,
  sizeLabel,
  onInstall,
  onClose,
}: PdfModelRequiredDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line-2 bg-brass-soft text-brass">
              <FileText size={17} strokeWidth={1.6} />
            </span>
            <DialogTitle className="font-serif text-[23px] italic leading-tight tracking-figure text-paper">
              Ce relevé PDF nécessite le modèle
            </DialogTitle>
          </div>

          <DialogDescription className="pt-1 font-sans text-[13px] leading-relaxed text-paper-soft">
            Lire la mise en page d'une banque inconnue requiert le modèle local ({sizeLabel},
            hors-ligne). Tu peux l'installer — l'import reprendra automatiquement — ou réimporter ce
            relevé en <span className="text-paper">CSV</span> ou{' '}
            <span className="text-paper">OFX</span> exporté depuis ta banque : ces formats ne
            nécessitent pas le modèle.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            Importer en CSV/OFX
          </Button>
          <Button onClick={onInstall}>
            <ArrowDownToLine size={14} strokeWidth={1.8} />
            Installer le modèle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
