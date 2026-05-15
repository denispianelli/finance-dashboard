import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Separator } from './ui/separator';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

const items: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/settings', label: 'Paramètres', icon: '⚙️' },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r border-border bg-card flex flex-col">
      <div className="p-4 font-bold text-primary">💰 Finance Dashboard</div>
      <Separator />
      <nav className="p-2 space-y-1 flex-1">
        {items.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            end={it.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <span>{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 text-xs text-muted-foreground">v0.1.0 — Phase 0</div>
    </aside>
  );
}
