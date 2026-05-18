import { useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/settings': 'Paramètres',
};

export function Topbar() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? 'Finance Dashboard';

  return (
    <header
      aria-label="En-tête de l'application"
      style={{
        height: 56,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        background: 'var(--ink-1)',
        borderBottom: '1px solid var(--line-1)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 26,
          lineHeight: 1.05,
          letterSpacing: '-0.025em',
          color: 'var(--paper)',
          margin: 0,
        }}
      >
        {title}
      </h1>
    </header>
  );
}
