import {
  ArrowLeftRight,
  Landmark,
  LayoutDashboard,
  LineChart,
  Settings,
  Tags,
  Upload,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import pkg from '../../../package.json';
import { cn } from '../lib/utils';
import { NetWorthAnchor } from './NetWorthAnchor';

type IconComponent = ComponentType<{ size: number; strokeWidth: number }>;

// A navigation destination (renders a NavLink) vs. an in-app action like opening a
// modal (renders a button). Import has no route — it opens the ImportModal owned by
// AppShell — so it must be an action, not a NavLink to a non-existent `/import`.
type NavItem =
  | { kind: 'route'; path: string; label: string; Icon: IconComponent; enabled: boolean }
  | { kind: 'action'; key: string; label: string; Icon: IconComponent; onClick: () => void };

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

function buildGroups(onImport: () => void): NavGroup[] {
  return [
    {
      key: 'vue',
      label: 'Vue',
      items: [
        {
          kind: 'route',
          path: '/',
          label: 'Tableau de bord',
          Icon: LayoutDashboard,
          enabled: true,
        },
        {
          kind: 'route',
          path: '/transactions',
          label: 'Transactions',
          Icon: ArrowLeftRight,
          enabled: true,
        },
        { kind: 'route', path: '/accounts', label: 'Comptes', Icon: Landmark, enabled: true },
        { kind: 'route', path: '/categories', label: 'Catégories', Icon: Tags, enabled: true },
        { kind: 'route', path: '/reports', label: 'Rapports', Icon: LineChart, enabled: true },
      ],
    },
    {
      key: 'outils',
      label: 'Outils',
      items: [
        { kind: 'action', key: 'import', label: 'Importer', Icon: Upload, onClick: onImport },
        { kind: 'route', path: '/settings', label: 'Paramètres', Icon: Settings, enabled: true },
      ],
    },
  ];
}

function BrandMark() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="20" cy="20" r="18.5" strokeWidth="1" />
      <text
        x="20"
        y="28"
        textAnchor="middle"
        fontFamily="serif"
        fontStyle="italic"
        fontSize="22"
        fill="currentColor"
        stroke="none"
      >
        ƒ
      </text>
    </svg>
  );
}

interface NavRowProps {
  item: NavItem;
  collapsed: boolean;
}

const ROW_BASE =
  'nav-item relative mx-2 flex h-9 items-center gap-2 rounded-md text-[13px] transition-colors';
const ROW_EXPANDED = 'px-3';
const ROW_COLLAPSED = 'justify-center px-0';

function NavRow({ item, collapsed }: NavRowProps) {
  const { Icon, label } = item;
  const sharedTitle = collapsed ? label : undefined;

  if (item.kind === 'action') {
    return (
      <button
        type="button"
        onClick={item.onClick}
        title={sharedTitle}
        aria-label={collapsed ? label : undefined}
        className={cn(
          ROW_BASE,
          collapsed ? ROW_COLLAPSED : ROW_EXPANDED,
          'border-0 bg-transparent text-left text-paper-mute transition-colors hover:text-paper',
        )}
      >
        <Icon size={14} strokeWidth={1.6} />
        {collapsed ? null : <span>{label}</span>}
      </button>
    );
  }

  if (!item.enabled) {
    return (
      <button
        type="button"
        disabled
        title={sharedTitle}
        aria-label={collapsed ? label : undefined}
        className={cn(
          ROW_BASE,
          collapsed ? ROW_COLLAPSED : ROW_EXPANDED,
          'cursor-not-allowed border-0 bg-transparent text-left text-paper-dim opacity-50',
        )}
      >
        <Icon size={14} strokeWidth={1.6} />
        {collapsed ? null : <span>{label}</span>}
      </button>
    );
  }
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={sharedTitle}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          ROW_BASE,
          collapsed ? ROW_COLLAPSED : ROW_EXPANDED,
          'no-underline',
          isActive ? 'bg-brass-soft text-paper' : 'text-paper-mute',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full',
              isActive ? 'bg-brass' : 'bg-transparent',
            )}
          />
          <Icon size={14} strokeWidth={1.6} />
          {collapsed ? null : <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({
  onImport,
  netWorth,
  monthDelta,
  collapsed,
}: {
  onImport: () => void;
  netWorth: number;
  monthDelta: number;
  collapsed: boolean;
}) {
  const groups = buildGroups(onImport);
  const navigate = useNavigate();

  return (
    <aside
      aria-label="Barre latérale"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line-2 bg-ink-2 transition-[width] duration-150',
        collapsed ? 'w-[60px]' : 'w-[232px]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 pb-[18px] pt-5',
          collapsed ? 'justify-center px-0' : 'px-[18px]',
        )}
      >
        <span className="flex text-brass">
          <BrandMark />
        </span>
        {collapsed ? null : (
          <div className="flex flex-col gap-1 leading-none">
            <span className="font-sans text-[13px] font-medium leading-none tracking-[-0.015em] text-paper">
              Finance
            </span>
            <span className="font-serif text-[15px] italic font-normal leading-none text-paper-soft">
              Dashboard
            </span>
          </div>
        )}
      </div>

      <NetWorthAnchor
        netWorth={netWorth}
        monthDelta={monthDelta}
        collapsed={collapsed}
        onNavigate={() => {
          void navigate('/');
        }}
      />

      <div className="mx-4 h-px bg-line-2" />

      <nav aria-label="Navigation principale" className="flex-1 py-2">
        {groups.map((group) => (
          <div key={group.key} className="pb-2">
            {collapsed ? (
              <div className="mx-3 my-2 h-px bg-line-2/60 first:hidden" aria-hidden />
            ) : (
              <span className="block px-4 pb-1.5 pt-3 font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-dim">
                {group.label}
              </span>
            )}
            {group.items.map((item) => (
              <NavRow
                key={item.kind === 'route' ? item.path : item.key}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'flex items-center border-t border-line-2 py-3.5',
          collapsed ? 'justify-center px-0' : 'justify-between px-[18px]',
        )}
      >
        {collapsed ? (
          <span
            aria-label="local · privé"
            title="local · privé"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage"
          />
        ) : (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium leading-none text-paper-mute">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
              local · privé
            </span>
            <span className="font-mono text-[11px] font-medium leading-none text-paper-dim">
              v{pkg.version}
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
