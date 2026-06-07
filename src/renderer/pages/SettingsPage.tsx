import type { ComponentType, ReactNode } from 'react';
import { Cpu, Database, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Chip } from '../components/ui/chip';
import { Overline } from '../components/ui/overline';
import { cn } from '../lib/utils';
import { useModelStatus } from '../hooks/useModelStatus';
import { ModelSettingsSection } from '../components/model/ModelSettingsSection';
import { ipc } from '../ipc/client';

// First draft per docs/superpowers/specs/2026-06-03-settings-view-content-design.md.
// Content/structure only — nothing is wired to IPC yet. Values shown as static placeholders
// are flagged inline; "À venir" controls are disabled. UI/UX is refined separately.
const PLACEHOLDER = '—';
const SOON = 'Bientôt disponible';

export function SettingsPage() {
  return (
    <div className="flex max-w-[680px] flex-col gap-4">
      <ModelSection />
      <DataSection />
      <AppearanceSection />
    </div>
  );
}

function ModelSection() {
  const status = useModelStatus();
  return (
    <Section icon={Cpu} overline="— Local" title="Modèle LLM">
      <p className="pb-1 font-sans text-[12px] leading-relaxed text-paper-mute">
        Classifie en arrière-plan : mapping de colonnes + catégorisation. Ne dialogue jamais, ne
        raisonne jamais sur tes chiffres.
      </p>

      <Row label="Modèle">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[12px] text-paper-soft">
            Llama 3.2 3B Instruct · Q4_K_M
          </span>
          <ModelSettingsSection
            status={status}
            onDownload={() => void ipc.invoke('model:download:start', {})}
            onRemove={() => void ipc.invoke('model:remove', {})}
          />
        </div>
      </Row>

      <Row label="Emplacement du fichier">
        <span className="font-mono text-[12px] text-paper-dim">{PLACEHOLDER}</span>
      </Row>

      <Row label="Catégorisation" hint="Rejoue le classifieur sur l'historique existant.">
        <Button variant="secondary" size="sm" disabled>
          Relancer la catégorisation
          <SoonBadge />
        </Button>
      </Row>
    </Section>
  );
}

function DataSection() {
  return (
    <Section icon={Database} overline="— 100% local" title="Données & Sauvegarde">
      <Row label="Emplacement de la base">
        <span className="font-mono text-[12px] text-paper-dim">{PLACEHOLDER}</span>
      </Row>

      <Row label="Taille de la base">
        <span className="font-mono text-[12px] text-paper-dim">{PLACEHOLDER}</span>
      </Row>

      <Row label="Export" hint="Exporte tes transactions dans un fichier.">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => toast.info(SOON)}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast.info(SOON)}>
            JSON
          </Button>
        </div>
      </Row>

      <Row label="Sauvegarde" hint="Copie le fichier de base vers un dossier de ton choix.">
        <Button variant="secondary" size="sm" onClick={() => toast.info(SOON)}>
          Sauvegarder
        </Button>
      </Row>

      <Row label="Restauration" hint="Remplace la base depuis une sauvegarde.">
        <Button variant="secondary" size="sm" disabled>
          Restaurer
          <SoonBadge />
        </Button>
      </Row>

      <Separator />

      <Row
        label="Zone danger"
        labelClassName="text-coral"
        hint="Efface définitivement toutes tes données locales."
      >
        <Button variant="destructive" size="sm" disabled>
          Tout réinitialiser
          <SoonBadge />
        </Button>
      </Row>
    </Section>
  );
}

function AppearanceSection() {
  return (
    <Section icon={Palette} overline="— Interface" title="Apparence & divers">
      <Row label="Thème">
        <div className="flex items-center gap-2">
          <Chip active>Sombre</Chip>
          <span title="À venir">
            <Chip>Clair</Chip>
          </span>
          <SoonBadge />
        </div>
      </Row>

      <Row label="Langue">
        <span className="font-mono text-[12px] text-paper-soft">Français</span>
      </Row>
    </Section>
  );
}

// ---- Local presentational helpers -------------------------------------------------

function Section({
  icon: Icon,
  overline,
  title,
  children,
}: {
  icon: ComponentType<{ size: number; strokeWidth: number }>;
  overline: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3.5">
          <span className="flex text-brass">
            <Icon size={15} strokeWidth={1.7} />
          </span>
          <Overline>{overline}</Overline>
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <div className="flex flex-col">{children}</div>
    </Card>
  );
}

function Row({
  label,
  hint,
  labelClassName,
  children,
}: {
  label: string;
  hint?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line-2/60 py-3 first:border-t-0">
      <div className="flex flex-col gap-0.5">
        <span className={cn('font-sans text-[13px] text-paper', labelClassName)}>{label}</span>
        {hint ? <span className="font-sans text-[11px] text-paper-dim">{hint}</span> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SoonBadge() {
  return (
    <span className="rounded-sm bg-ink-3 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-paper-dim">
      À venir
    </span>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-line-2/60" />;
}
