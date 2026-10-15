import {
  ArrowLeftRight,
  Landmark,
  LayoutDashboard,
  LineChart,
  Settings,
  Tags,
  Upload,
  Wallet,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import pkg from '../../../package.json';
import { cn } from '../lib/utils';
import { NetWorthAnchor } from './NetWorthAnchor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

type IconComponent = ComponentType<{ size: number; strokeWidth: number; className?: string }>;

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
        { kind: 'route', path: '/patrimoine', label: 'Patrimoine', Icon: Wallet, enabled: true },
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
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="40" height="40" rx="12" fill="var(--accent-brand)" />
      <g transform="translate(8,8)">
        <polyline
          points="3,17 9,11 13,14 21,5"
          fill="none"
          stroke="var(--accent-ink)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="21" cy="5" r="2.4" fill="var(--accent-ink)" />
      </g>
    </svg>
  );
}

interface NavRowProps {
  item: NavItem;
  collapsed: boolean;
}

// Rows keep a CONSTANT left padding in both states (no justify-center switch). The icon
// is shrink-0 at a fixed offset, and the label is always mounted — it fades and gets
// clipped by the shrinking rail width rather than being unmounted. So when the sidebar
// collapses the icons stay put and the text "slides out" (shadcn collapsible="icon"
// behaviour) instead of teleporting. The collapsed rail width is tuned so the fixed-offset
// icon lands dead-centre (see w-[54px] below): left inset mx-2(8)+px-3(12)=20, icon 14 →
// 20+14+20 = 54.
const ROW_BASE =
  'nav-item group relative mx-2 flex h-9 items-center gap-2 overflow-hidden rounded-md px-3 text-[13px] transition-colors';

function NavRow({ item, collapsed }: NavRowProps) {
  const { Icon, label } = item;
  const labelSpan = (
    <span
      className={cn('whitespace-nowrap transition-opacity duration-200', collapsed && 'opacity-0')}
    >
      {label}
    </span>
  );

  let row: ReactNode;
  if (item.kind === 'action') {
    row = (
      <button
        type="button"
        onClick={item.onClick}
        className={cn(ROW_BASE, 'border-0 bg-transparent text-paper-mute hover:text-paper')}
      >
        <Icon size={14} strokeWidth={1.6} className="shrink-0" />
        {labelSpan}
      </button>
    );
  } else if (!item.enabled) {
    row = (
      <button
        type="button"
        disabled
        className={cn(
          ROW_BASE,
          'cursor-not-allowed border-0 bg-transparent text-paper-dim opacity-50',
        )}
      >
        <Icon size={14} strokeWidth={1.6} className="shrink-0" />
        {labelSpan}
      </button>
    );
  } else {
    // String className (not the function form): when collapsed this NavLink is wrapped in
    // a Radix Tooltip trigger (asChild → Slot), and Slot only merges *string* classNames —
    // a function className gets stringified, dropping every layout class. NavLink sets
    // aria-current="page" when active, so the active state is styled via that variant.
    row = (
      <NavLink
        to={item.path}
        end={item.path === '/'}
        className={cn(
          ROW_BASE,
          'no-underline text-paper-mute aria-[current=page]:bg-brass-soft aria-[current=page]:text-paper',
        )}
      >
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-transparent group-aria-[current=page]:bg-brass" />
        <Icon size={14} strokeWidth={1.6} className="shrink-0" />
        {labelSpan}
      </NavLink>
    );
  }

  if (!collapsed) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
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
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label="Barre latérale"
        data-collapsed={collapsed}
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden border-r border-line-2 bg-ink-2 transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-[54px]' : 'w-[232px]',
        )}
      >
        {/* Constant px so the mark stays put (its centre sits on the same x as the nav
            icons in both states); the wordmark stays mounted and fades + is clipped by the
            shrinking rail rather than being unmounted — so the logo slides, never teleports. */}
        <div className="flex items-center gap-3 overflow-hidden px-[13px] pb-[18px] pt-5">
          <span className="flex shrink-0">
            <BrandMark />
          </span>
          <div
            className={cn(
              'flex shrink-0 flex-col gap-1 whitespace-nowrap leading-none transition-opacity duration-200',
              collapsed && 'opacity-0',
            )}
          >
            <span className="font-sans text-[13px] font-medium leading-none tracking-[-0.015em] text-paper">
              Finance
            </span>
            <span className="font-sans text-[14px] font-semibold leading-none tracking-[-0.015em] text-paper-soft">
              Dashboard
            </span>
          </div>
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
            // flex-col so every row stretches to the same width — a bare <button> would
            // otherwise shrink to its icon (UA control sizing) and sit left of the rail,
            // unlike the block-level <a> rows.
            <div key={group.key} className="flex flex-col pb-2">
              {/* Animate the label's vertical space to 0 (grid-rows 1fr→0fr) + fade, so the
                  rows below slide up smoothly on collapse instead of snapping. */}
              <div
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-200 ease-in-out',
                  collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
                )}
              >
                <span className="block overflow-hidden px-4 pb-1.5 pt-3 font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-dim">
                  {group.label}
                </span>
              </div>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="local · privé"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage"
                />
              </TooltipTrigger>
              <TooltipContent side="right">local · privé</TooltipContent>
            </Tooltip>
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
    </TooltipProvider>
  );
}
