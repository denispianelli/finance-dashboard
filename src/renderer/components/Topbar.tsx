import { MoreHorizontal } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from './ui/button';

interface PageMeta {
  title: string;
  breadcrumb: string[];
  account?: string;
}

const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'Tableau de bord',
    breadcrumb: ['Vue', 'Dashboard'],
    account: 'Compte joint · Boursorama',
  },
  '/settings': { title: 'Paramètres', breadcrumb: ['Outils', 'Paramètres'] },
};

export function Topbar({ onImport }: { onImport: () => void }) {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: 'Finance Dashboard', breadcrumb: [] };

  return (
    <header
      aria-label="En-tête de l'application"
      className="flex min-h-[70px] items-center gap-[18px] border-b border-line-2 bg-ink-1 px-7 py-[18px]"
    >
      <div className="flex flex-col gap-1.5">
        {meta.breadcrumb.length > 0 ? (
          <span className="font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-paper-mute">
            {meta.breadcrumb.map((b, i) => (
              <span key={b}>
                {i > 0 ? <span className="mx-2 text-paper-dim">/</span> : null}
                {b}
              </span>
            ))}
          </span>
        ) : null}
        <h1 className="whitespace-nowrap font-serif text-[26px] italic leading-[1.05] tracking-[-0.02em] text-paper">
          {meta.title}
        </h1>
      </div>
      <span className="flex-1" />
      {meta.account ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-line-2 bg-ink-2 px-3 py-[7px] font-sans text-xs font-medium text-paper-soft"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brass" />
          {meta.account}
          <MoreHorizontal size={12} strokeWidth={1.6} />
        </button>
      ) : null}
      <Button onClick={onImport}>Importer un relevé</Button>
    </header>
  );
}
