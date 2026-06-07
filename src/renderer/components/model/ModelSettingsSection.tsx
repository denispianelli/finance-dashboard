import { ArrowDownToLine, Play, RotateCw } from 'lucide-react';
import type { ModelStatus } from '@shared/types/model';
import { modelPercent } from '@renderer/lib/modelFormat';
import { Button } from '@renderer/components/ui/button';

export function ModelSettingsSection({
  status,
  onDownload,
  onRemove,
}: {
  status: ModelStatus;
  onDownload: () => void;
  onRemove: () => void;
}) {
  if (status.state === 'ready') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-line-2 bg-ink-3 px-2 py-0.5 font-mono text-[10px] text-paper-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          Présent · ~1,9 Go
        </span>
        <Button variant="destructive" size="sm" onClick={onRemove}>
          Supprimer le modèle
        </Button>
      </div>
    );
  }

  if (status.state === 'absent') {
    return (
      <Button variant="secondary" size="sm" onClick={onDownload}>
        <ArrowDownToLine size={13} strokeWidth={1.7} />
        Télécharger le modèle (~1,9 Go)
      </Button>
    );
  }

  if (status.state === 'paused') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-sans text-[12px] text-paper-mute">En pause</span>
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Play size={13} strokeWidth={1.7} />
          Reprendre
        </Button>
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-sans text-[12px] text-coral">Échec</span>
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <RotateCw size={13} strokeWidth={1.7} />
          Réessayer
        </Button>
      </div>
    );
  }

  // downloading
  const percent = modelPercent(status);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-[12px] text-paper-mute">Téléchargement… {percent} %</span>
      <div className="h-0.5 w-40 rounded-full bg-ink-4">
        <div
          className="h-full rounded-full bg-brass transition-[width] duration-300 ease-out"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}
