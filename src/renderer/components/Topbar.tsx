import { Moon, PanelLeft, Sun, Upload } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTheme } from './ThemeProvider';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

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
  '/patrimoine': { title: 'Patrimoine', breadcrumb: ['Vue', 'Patrimoine'] },
  '/settings': { title: 'Paramètres', breadcrumb: ['Outils', 'Paramètres'] },
};

export function Topbar({
  onImport,
  onToggleSidebar,
  sidebarCollapsed = false,
}: {
  onImport: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: 'Finance Dashboard', breadcrumb: [] };
  const toggleLabel = sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale';
  const { theme, toggleTheme } = useTheme();
  const themeLabel = theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';

  return (
    <header
      aria-label="En-tête de l'application"
      className="flex min-h-[70px] items-center gap-3 border-b border-line-2 bg-ink-1 px-5 py-[18px] xl:gap-[18px] xl:px-7"
    >
      {onToggleSidebar ? (
        <>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  aria-label={toggleLabel}
                  aria-expanded={!sidebarCollapsed}
                  className="hidden size-7 shrink-0 items-center justify-center rounded-md text-paper-mute transition-colors hover:bg-ink-3 hover:text-paper focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass xl:inline-flex"
                >
                  <PanelLeft size={16} strokeWidth={1.7} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
        <h1 className="truncate font-sans text-[22px] font-semibold leading-[1.05] tracking-[-0.015em] text-paper xl:text-[26px]">
          {meta.title}
        </h1>
      </div>
      <span className="flex-1" />
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-paper-mute transition-colors hover:bg-surface-2 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              {theme === 'dark' ? (
                <Sun size={17} strokeWidth={1.7} />
              ) : (
                <Moon size={17} strokeWidth={1.7} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{themeLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button onClick={onImport} className="shrink-0">
        <Upload size={16} strokeWidth={1.7} />
        Importer un relevé
      </Button>
    </header>
  );
}
