import { ArrowDownToLine, Pause, Play, RotateCw, TriangleAlert } from 'lucide-react';
import type { ModelStatus } from '@shared/types/model';
import { formatModelSize, modelPercent } from '@renderer/lib/modelFormat';
import { cn } from '@renderer/lib/utils';

interface ModelDownloadIndicatorProps {
  status: ModelStatus;
  onResume?: () => void;
}

const NBSP = ' ';

export function ModelDownloadIndicator({ status, onResume }: ModelDownloadIndicatorProps) {
  // Discret par conception : invisible quand il n'y a rien à signaler.
  if (status.state === 'ready' || status.state === 'absent') return null;

  const percent = modelPercent(status);
  const showBar = status.state === 'downloading' || status.state === 'paused';

  return (
    <div className="relative border-b border-line-2 bg-ink-2">
      <div className="flex min-h-[38px] items-center gap-2.5 px-7 py-2">
        {status.state === 'downloading' && (
          <>
            <ArrowDownToLine size={13} strokeWidth={1.7} className="shrink-0 text-brass" />
            <span className="font-sans text-[12px] text-paper-soft">
              Téléchargement du modèle local
            </span>
            <span className="font-mono text-[12px] tabular-nums text-paper-mute">
              {percent}
              {NBSP}%{NBSP}·{NBSP}
              {formatModelSize(status.receivedBytes ?? 0)}
              {NBSP}/{NBSP}
              {formatModelSize(status.totalBytes ?? 0)}
            </span>
          </>
        )}

        {status.state === 'paused' && (
          <>
            <Pause size={13} strokeWidth={1.7} className="shrink-0 text-paper-mute" />
            <span className="font-sans text-[12px] text-paper-soft">Téléchargement en pause</span>
          </>
        )}

        {status.state === 'error' && (
          <>
            <TriangleAlert size={13} strokeWidth={1.7} className="shrink-0 text-coral" />
            <span className="font-sans text-[12px] text-paper-soft">
              {status.error ?? 'Échec du téléchargement'}
            </span>
          </>
        )}

        <span className="flex-1" />

        {status.state === 'paused' && (
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-1.5 font-sans text-[12px] font-medium text-brass transition-colors hover:text-brass-hi focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass"
          >
            <Play size={12} strokeWidth={1.8} />
            Reprendre
          </button>
        )}

        {status.state === 'error' && (
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-1.5 font-sans text-[12px] font-medium text-brass transition-colors hover:text-brass-hi focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass"
          >
            <RotateCw size={12} strokeWidth={1.8} />
            Réessayer
          </button>
        )}
      </div>

      {showBar && (
        <div className="absolute inset-x-0 -bottom-px h-0.5 bg-ink-4">
          <div
            className={cn(
              'h-full transition-[width] duration-300 ease-out',
              status.state === 'paused' ? 'bg-paper-mute' : 'bg-brass',
            )}
            style={{ width: `${String(percent)}%` }}
          />
        </div>
      )}
    </div>
  );
}
