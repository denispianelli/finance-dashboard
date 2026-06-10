import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SyncStatusView } from '@shared/types/sync';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../../lib/utils';
import { ipc } from '../../ipc/client';

const INPUT =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

function formatTs(iso: string | null): string {
  if (iso === null) return '—';
  return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

const ENABLE_ERRORS: Record<string, string> = {
  safe_storage_unavailable: 'Le trousseau système est indisponible sur cette machine.',
  folder_unavailable: 'Ce dossier est introuvable ou inaccessible.',
};

const SYNC_ERRORS: Record<string, string> = {
  disabled: 'La synchronisation est désactivée.',
  folder_unavailable: 'Dossier de synchronisation introuvable (Syncthing arrêté ?).',
  write_failed: "Échec d'écriture du snapshot.",
};

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

// ---- Setup dialog -----------------------------------------------------------------

function SyncSetupDialog({
  open,
  onClose,
  onEnabled,
}: {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
}) {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setFolderPath(null);
    setPassphrase('');
    setConfirm('');
    setBusy(false);
  }

  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const canSubmit = folderPath !== null && passphrase.length >= 8 && !mismatch && !busy;

  async function pickFolder() {
    const result = await ipc.invoke('sync:pickFolder', {});
    if (!result.cancelled) {
      setFolderPath(result.path);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const result = await ipc.invoke('sync:enable', { folderPath, passphrase });
      if (result.ok) {
        toast.success('Synchronisation activée.');
        reset();
        onClose();
        onEnabled();
        window.dispatchEvent(new CustomEvent('sync:recheck'));
      } else {
        toast.error(ENABLE_ERRORS[result.error] ?? result.error);
        setBusy(false);
      }
    } catch {
      toast.error('Erreur inattendue lors de l’activation.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurer la synchronisation</DialogTitle>
          <DialogDescription>
            Snapshot chiffré dans un dossier que tu fais transiter toi-même (Syncthing, cloud
            perso).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => {
                void pickFolder();
              }}
            >
              Choisir un dossier
            </Button>
            <span className="truncate font-mono text-[12px] text-paper-dim">
              {folderPath ?? 'Aucun dossier choisi'}
            </span>
          </div>

          <input
            type="password"
            value={passphrase}
            placeholder="Passphrase"
            onChange={(e) => {
              setPassphrase(e.target.value);
            }}
            className={cn(INPUT)}
          />
          <div className="flex flex-col gap-1">
            <input
              type="password"
              value={confirm}
              placeholder="Confirmer la passphrase"
              onChange={(e) => {
                setConfirm(e.target.value);
              }}
              className={cn(INPUT)}
            />
            {mismatch ? (
              <span className="font-sans text-[11px] text-coral">
                Les deux passphrases ne correspondent pas.
              </span>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => {
              void submit();
            }}
          >
            Activer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main section -----------------------------------------------------------------

export function SyncSettingsSection({ Row }: { Row: React.ComponentType<RowProps> }) {
  const [status, setStatus] = useState<SyncStatusView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void ipc.invoke('sync:getStatus', {}).then(setStatus);
  }, []);

  function refresh() {
    void ipc.invoke('sync:getStatus', {}).then(setStatus);
  }

  if (status === null) return null;

  if (!status.enabled) {
    return (
      <>
        <Row
          label="Synchronisation entre machines"
          hint="Snapshot chiffré dans un dossier que tu fais transiter toi-même (Syncthing, cloud perso)."
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            Configurer
          </Button>
        </Row>

        <SyncSetupDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
          }}
          onEnabled={() => {
            refresh();
          }}
        />
      </>
    );
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await ipc.invoke('sync:now', {});
      if (result.ok) {
        toast.success('Snapshot écrit.');
      } else {
        toast.error(SYNC_ERRORS[result.error] ?? result.error);
      }
    } catch {
      toast.error('Erreur inattendue lors de la synchronisation.');
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  async function disable() {
    if (syncing) return;
    setSyncing(true);
    try {
      await ipc.invoke('sync:disable', {});
      toast.info('Synchronisation désactivée.');
      refresh();
    } finally {
      setSyncing(false);
    }
  }

  const writeLabel = status.dirty
    ? `${formatTs(status.lastWriteAt)} · modifications en attente`
    : formatTs(status.lastWriteAt);

  const restoreLabel =
    status.lastRestoreFromMachine !== null
      ? `${formatTs(status.lastRestoreAt)} (${status.lastRestoreFromMachine})`
      : formatTs(status.lastRestoreAt);

  return (
    <>
      <Row label="Dossier de synchronisation">
        <span className="max-w-[260px] truncate font-mono text-[12px] text-paper-soft">
          {status.folderPath ?? '—'}
        </span>
      </Row>

      <Row label="Dernier snapshot écrit">
        <span className="font-mono text-[12px] text-paper-soft">{writeLabel}</span>
      </Row>

      <Row label="Dernière restauration">
        <span className="font-mono text-[12px] text-paper-soft">{restoreLabel}</span>
      </Row>

      <Row label="Actions">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={syncing}
            onClick={() => {
              void syncNow();
            }}
          >
            Synchroniser maintenant
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={syncing}
            onClick={() => {
              void disable();
            }}
          >
            Désactiver
          </Button>
        </div>
      </Row>
    </>
  );
}
