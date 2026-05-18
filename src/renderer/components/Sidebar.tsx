import { LayoutDashboard, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Separator } from './ui/separator';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const items: NavItem[] = [
  { path: '/', label: 'Tableau de bord', icon: <LayoutDashboard size={16} strokeWidth={1.6} /> },
  { path: '/settings', label: 'Paramètres', icon: <Settings size={16} strokeWidth={1.6} /> },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-border bg-card">
      <div className="p-4 font-semibold tracking-tight text-primary">
        <span className="font-serif italic">ƒ</span> Finance Dashboard
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 p-2">
        {items.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            end={it.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            {it.icon}
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 text-xs text-muted-foreground">local · privé · v0.1.0</div>
    </aside>
  );
}
