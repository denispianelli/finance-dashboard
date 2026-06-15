import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { QuoteSettings } from '@shared/types/investment';
import { Chip } from '../ui/chip';
import { ipc } from '../../ipc/client';
import { formatTs } from '../../lib/formatDate';

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export function QuoteSettingsSection({ Row }: { Row: React.ComponentType<RowProps> }) {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);

  useEffect(() => {
    void ipc.invoke('investment:getQuoteSettings', {}).then(setSettings);
  }, []);

  if (settings === null) return null;

  async function handleToggle() {
    if (settings === null) return;
    const enabled = !settings.enabled;
    await ipc.invoke('investment:setQuotesEnabled', { enabled });
    setSettings((prev) => (prev !== null ? { ...prev, enabled } : prev));
    toast.success(enabled ? 'Cours de marché activés.' : 'Cours de marché désactivés.');
  }

  return (
    <>
      <Row
        label="Cours de marché automatiques"
        hint="Quand c'est activé, l'application interroge portfolio-performance.info (résolution ISIN → ticker) puis Yahoo Finance (dernier cours) pour valoriser tes supports cotés. Seul l'identifiant de l'instrument (ISIN puis ticker) est transmis — jamais de montant, de quantité ni de nom de compte. La valorisation se rafraîchit à l'ouverture et via le bouton « Rafraîchir les cours ». Une valeur que tu déclares toi-même reste prioritaire. Désactivé par défaut."
      >
        <div className="flex items-center gap-2">
          <Chip
            active={settings.enabled}
            onClick={() => {
              void handleToggle();
            }}
          >
            {settings.enabled ? 'Activé' : 'Désactivé'}
          </Chip>
        </div>
      </Row>

      {settings.enabled && (
        <Row label="Dernière mise à jour">
          <span className="font-mono text-[12px] text-paper-soft">
            {formatTs(settings.lastRefreshAt)}
          </span>
        </Row>
      )}
    </>
  );
}
