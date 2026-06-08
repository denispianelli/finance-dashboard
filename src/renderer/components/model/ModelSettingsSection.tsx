import { ArrowDownToLine, Play, RotateCw, Sparkles } from 'lucide-react';
import type { ModelStatus } from '@shared/types/model';
import { formatModelSize, modelPercent } from '@renderer/lib/modelFormat';
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
    const label = status.active?.label ?? 'Modèle';
    const size = status.active ? `~${formatModelSize(status.active.sizeBytes)}` : '';
    return (
      <div className="flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-line-2 bg-ink-3 px-2 py-0.5 font-mono text-[10px] text-paper-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            Présent · {label}
            {size ? <> · {size}</> : null}
          </span>
          <Button variant="destructive" size="sm" onClick={onRemove}>
            Supprimer le modèle
          </Button>
        </div>
        {status.upgrade ? (
          <div className="flex items-center gap-2.5 rounded-sm border border-line-2 bg-brass-soft px-2.5 py-1.5">
            <Sparkles size={13} strokeWidth={1.7} className="shrink-0 text-brass" />
            <span className="font-sans text-[11px] leading-snug text-paper-soft">
              Un meilleur modèle est disponible pour ta machine — {status.upgrade.label} (~
              {formatModelSize(status.upgrade.sizeBytes)})
            </span>
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <ArrowDownToLine size={13} strokeWidth={1.7} />
              Télécharger
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (status.state === 'absent') {
    const target = status.target;
    const label = target ? `${target.label} (~${formatModelSize(target.sizeBytes)})` : 'le modèle';
    return (
      <Button variant="secondary" size="sm" onClick={onDownload}>
        <ArrowDownToLine size={13} strokeWidth={1.7} />
        Télécharger {label}
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
