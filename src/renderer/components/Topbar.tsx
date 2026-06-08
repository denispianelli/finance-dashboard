import { PanelLeft, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from './ui/button';

interface PageMeta {
  title: string;
  breadcrumb: string[];
}

// One entry per route. The serif page title + breadcrumb live in the Topbar
// (the screens never repeat the page title); keep this in lockstep with the
// router in App.tsx and the design-system kit's per-screen contract.
const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'Tableau de bord',
    breadcrumb: ['Vue', 'Dashboard'],
  },
  '/transactions': { title: 'Transactions', breadcrumb: ['Vue', 'Transactions'] },
  '/accounts': { title: 'Comptes', breadcrumb: ['Vue', 'Comptes'] },
  '/categories': { title: 'Catégories', breadcrumb: ['Vue', 'Catégories'] },
  '/reports': { title: 'Rapports', breadcrumb: ['Vue', 'Rapports'] },
  '/settings': { title: 'Paramètres', breadcrumb: ['Outils', 'Paramètres'] },
};

export function Topbar({
  onImport,
  onToggleSidebar,
  sidebarCollapsed = false,
  categorizing = false,
  categorizeRemaining = 0,
  pendingCount = 0,
  onCategorize,
}: {
  onImport: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  categorizing?: boolean;
  categorizeRemaining?: number;
  pendingCount?: number;
  onCategorize?: () => void;
}) {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: 'Finance Dashboard', breadcrumb: [] };
  const toggleLabel = sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale';

  return (
    <header
      aria-label="En-tête de l'application"
      className="flex min-h-[70px] items-center gap-3 border-b border-line-2 bg-ink-1 px-5 py-[18px] xl:gap-[18px] xl:px-7"
    >
      {onToggleSidebar ? (
        <>
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={toggleLabel}
            aria-expanded={!sidebarCollapsed}
            title={toggleLabel}
            className="hidden size-7 shrink-0 items-center justify-center rounded-md text-paper-mute transition-colors hover:bg-ink-3 hover:text-paper focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass xl:inline-flex"
          >
            <PanelLeft size={16} strokeWidth={1.7} />
          </button>
          <span className="hidden h-5 w-px shrink-0 bg-line-2 xl:block" aria-hidden />
        </>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1.5">
        {meta.breadcrumb.length > 0 ? (
          <span className="hidden font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-paper-mute xl:block">
            {meta.breadcrumb.map((b, i) => (
              <span key={b}>
                {i > 0 ? <span className="mx-2 text-paper-dim">/</span> : null}
                {b}
              </span>
            ))}
          </span>
        ) : null}
        <h1 className="truncate font-serif text-[22px] italic leading-[1.05] tracking-[-0.02em] text-paper xl:text-[26px]">
          {meta.title}
        </h1>
      </div>
      <span className="flex-1" />
      {categorizing ? (
        <span
          aria-live="polite"
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border border-line-2 bg-ink-3 px-[9px] font-sans text-[11px] font-medium text-paper-soft"
        >
          <Sparkles size={12} strokeWidth={1.6} className="shrink-0 text-brass" />
          <span>Catégorisation IA… ({categorizeRemaining})</span>
        </span>
      ) : pendingCount > 0 && onCategorize ? (
        <button
          type="button"
          onClick={onCategorize}
          aria-label={`Catégoriser ${String(pendingCount)} transactions avec l'IA`}
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border border-line-2 bg-ink-3 px-[9px] font-sans text-[11px] font-medium text-paper-soft transition-colors hover:border-brass hover:text-paper"
        >
          <Sparkles size={12} strokeWidth={1.6} className="shrink-0 text-brass" />
          <span>Catégoriser ({pendingCount})</span>
        </button>
      ) : null}
      <Button onClick={onImport} className="shrink-0">
        Importer un relevé
      </Button>
    </header>
  );
}
