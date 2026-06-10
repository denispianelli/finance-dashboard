import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SyncLaunchCheck } from '@shared/types/sync';
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

const RESTORE_ERRORS: Record<string, string> = {
  disabled: 'La synchronisation est désactivée.',
  folder_unavailable: 'Dossier de synchronisation introuvable.',
  snapshot_invalid: 'Le fichier de snapshot est invalide.',
  wrong_passphrase_or_corrupt: 'Passphrase incorrecte ou fichier corrompu/incomplet.',
  integrity_failed: "La base restaurée a échoué la vérification d'intégrité.",
  schema_too_new: "Snapshot créé par une version plus récente de l'app.",
};

const KEEP_LOCAL_ERRORS: Record<string, string> = {
  disabled: 'La synchronisation est désactivée.',
  folder_unavailable: 'Dossier de synchronisation introuvable.',
  write_failed: "Échec d'écriture du snapshot.",
};

function describeSnapshot(machineName: string, createdAt: string): string {
  const ts = format(new Date(createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr });
  return `${machineName}, le ${ts}`;
}

// ---- Blocking dialog helper --------------------------------------------------------

function GateDialog({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>{children}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main component ----------------------------------------------------------------

function fetchAndApplyCheck(setCheck: (c: SyncLaunchCheck) => void) {
  void ipc.invoke('sync:launchCheck', {}).then((result) => {
    if (result.kind === 'folder_unavailable') {
      toast.warning('Dossier de synchronisation introuvable — snapshot ignoré.');
    }
    setCheck(result);
  });
}

export function SyncLaunchGate() {
  const [check, setCheck] = useState<SyncLaunchCheck | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAndApplyCheck(setCheck);
    const handler = () => {
      fetchAndApplyCheck(setCheck);
    };
    window.addEventListener('sync:recheck', handler);
    return () => {
      window.removeEventListener('sync:recheck', handler);
    };
  }, []);

  function dismiss() {
    setCheck({ kind: 'up_to_date' });
  }

  async function doRestore() {
    setBusy(true);
    try {
      const result = await ipc.invoke('sync:restore', {});
      if (result.ok) {
        // Full reload on purpose: the on-disk DB was swapped — every page
        // must refetch; a React state refresh would be incomplete.
        window.location.reload();
      } else {
        toast.error(RESTORE_ERRORS[result.error] ?? result.error);
        setBusy(false);
      }
    } catch {
      toast.error('Erreur inattendue lors de la restauration.');
      setBusy(false);
    }
  }

  async function doKeepLocal() {
    setBusy(true);
    try {
      const result = await ipc.invoke('sync:keepLocal', {});
      if (result.ok) {
        toast.success('Snapshot du dossier remplacé par les données de cette machine.');
      } else {
        toast.error(KEEP_LOCAL_ERRORS[result.error] ?? result.error);
      }
    } catch {
      toast.error('Erreur inattendue.');
    } finally {
      dismiss();
      setBusy(false);
    }
  }

  if (check === null) return null;

  if (check.kind === 'restore_available') {
    const snap = describeSnapshot(check.machineName, check.createdAt);
    return (
      <GateDialog
        title="Données plus récentes trouvées"
        description={`Un snapshot plus récent existe (${snap}). Restaurer ces données sur cette machine ? Une sauvegarde locale est créée avant.`}
      >
        <Button variant="secondary" size="sm" disabled={busy} onClick={dismiss}>
          Ignorer
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void doRestore();
          }}
        >
          Restaurer
        </Button>
      </GateDialog>
    );
  }

  if (check.kind === 'conflict') {
    const snap = describeSnapshot(check.machineName, check.createdAt);
    return (
      <GateDialog
        title="Conflit de synchronisation"
        description={`Cette machine a des modifications locales ET un snapshot plus récent existe (${snap}). Choisis la version à garder — l'autre est sauvegardée avant d'être remplacée.`}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            void doKeepLocal();
          }}
        >
          Garder cette machine
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void doRestore();
          }}
        >
          {"Prendre l'autre"}
        </Button>
      </GateDialog>
    );
  }

  if (check.kind === 'schema_too_new') {
    const snap = describeSnapshot(check.machineName, check.createdAt);
    return (
      <GateDialog
        title="Snapshot plus récent que l'app"
        description={`Le snapshot (${snap}) vient d'une version plus récente de l'app. Mets à jour l'app sur cette machine pour le restaurer.`}
      >
        <Button size="sm" onClick={dismiss}>
          Continuer sans restaurer
        </Button>
      </GateDialog>
    );
  }

  if (check.kind === 'snapshot_invalid') {
    return (
      <GateDialog
        title="Snapshot illisible"
        description="Le fichier finance.fbk du dossier de synchronisation est invalide ou incomplet (synchronisation en cours ?). Les données locales sont conservées."
      >
        <Button size="sm" onClick={dismiss}>
          Continuer
        </Button>
      </GateDialog>
    );
  }

  // disabled / up_to_date / no_snapshot / folder_unavailable → nothing
  return null;
}
