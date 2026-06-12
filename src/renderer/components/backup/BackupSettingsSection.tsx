import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BackupFileInfo, BackupStatusView } from '@shared/types/backup';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ipc } from '../../ipc/client';

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function formatTs(iso: string): string {
  return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

const RESTORE_ERRORS: Record<string, string> = {
  file_unavailable: 'Fichier introuvable.',
  not_a_database: "Ce fichier n'est pas une base de données de l'application.",
  integrity_failed: 'Sauvegarde corrompue — la base actuelle est intacte.',
  schema_too_new: "Sauvegarde créée par une version plus récente de l'application.",
};

export function BackupSettingsSection({ Row }: { Row: React.ComponentType<RowProps> }) {
  const [status, setStatus] = useState<BackupStatusView | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupFileInfo | null>(null);

  useEffect(() => {
    void ipc.invoke('backup:getStatus', {}).then(setStatus);
  }, []);

  function refresh() {
    void ipc.invoke('backup:getStatus', {}).then(setStatus);
  }

  if (status === null) return null;

  async function handlePickFolder() {
    const result = await ipc.invoke('backup:pickFolder', {});
    if (result.cancelled) return;
    await ipc.invoke('backup:setFolder', { folderPath: result.path });
    refresh();
    toast.success('Dossier de sauvegarde modifié.');
  }

  async function handleCreateNow() {
    const result = await ipc.invoke('backup:create', {});
    if (result.ok) {
      toast.success('Sauvegarde écrite.');
    } else {
      toast.error('Échec d’écriture de la sauvegarde.');
    }
    refresh();
  }

  async function handleRestoreConfirm() {
    if (pendingRestore === null) return;
    const fileName = pendingRestore.fileName;
    setPendingRestore(null);
    const result = await ipc.invoke('backup:restore', { fileName });
    if (result.ok) {
      toast.success('Sauvegarde restaurée.');
      window.location.reload();
    } else if (result.error !== 'cancelled') {
      toast.error(RESTORE_ERRORS[result.error] ?? result.error);
    }
  }

  async function handleRestoreFromFile() {
    const result = await ipc.invoke('backup:restoreFromFile', {});
    if (result.ok) {
      toast.success('Sauvegarde restaurée.');
      window.location.reload();
    } else if (result.error !== 'cancelled') {
      toast.error(RESTORE_ERRORS[result.error] ?? result.error);
    }
  }

  return (
    <>
      {/* Row: Dossier de sauvegarde */}
      <Row label="Dossier de sauvegarde">
        <div className="flex items-center gap-2">
          <span className="max-w-[260px] truncate font-mono text-[12px] text-paper-soft">
            {status.folderPath}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void handlePickFolder();
            }}
          >
            Modifier
          </Button>
        </div>
      </Row>

      {/* Row: Sauvegarde automatique */}
      <Row
        label="Sauvegarde automatique"
        hint="Un snapshot par jour au lancement, un avant chaque import · 15 conservés."
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void handleCreateNow();
          }}
        >
          Sauvegarder maintenant
        </Button>
      </Row>
      {status.lastError !== null ? (
        <span className="font-sans text-[11px] text-coral">
          Dernière sauvegarde automatique échouée : {status.lastError}
        </span>
      ) : null}

      {/* Row: Snapshots */}
      <Row label="Snapshots">
        {status.backups.length === 0 ? (
          <span className="text-paper-dim">Aucune sauvegarde pour l'instant.</span>
        ) : (
          <div className="flex flex-col gap-1">
            {status.backups.map((b) => (
              <div key={b.fileName} className="flex items-center gap-3">
                <span className="font-mono text-[12px] text-paper-soft">
                  {formatTs(b.createdAt)}
                </span>
                <span className="font-mono text-[12px] text-paper-soft">
                  {Math.max(1, Math.round(b.sizeBytes / 1024))} Ko
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPendingRestore(b);
                  }}
                >
                  Restaurer
                </Button>
              </div>
            ))}
          </div>
        )}
      </Row>

      {/* Row: Restaurer depuis un fichier */}
      <Row
        label="Restaurer depuis un fichier"
        hint="Pour un snapshot copié depuis un autre disque."
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void handleRestoreFromFile();
          }}
        >
          Choisir un fichier…
        </Button>
      </Row>

      {/* Restore confirmation dialog */}
      <Dialog
        open={pendingRestore !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRestore(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurer cette sauvegarde ?</DialogTitle>
            <DialogDescription>
              La base actuelle sera remplacée par le snapshot du{' '}
              {pendingRestore !== null ? formatTs(pendingRestore.createdAt) : ''}. Une copie .bak
              est conservée à côté de la base.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPendingRestore(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                void handleRestoreConfirm();
              }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
