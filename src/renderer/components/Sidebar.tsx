import {
  ArrowLeftRight,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Settings,
  Tags,
  Upload,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import pkg from '../../../package.json';

interface NavItem {
  path: string;
  label: string;
  Icon: ComponentType<{ size: number; strokeWidth: number }>;
  enabled: boolean;
}

const GROUPS: { key: string; label: string; items: NavItem[] }[] = [
  {
    key: 'vue',
    label: 'Vue',
    items: [
      { path: '/', label: 'Tableau de bord', Icon: LayoutDashboard, enabled: true },
      { path: '/transactions', label: 'Transactions', Icon: ArrowLeftRight, enabled: false },
      { path: '/categories', label: 'Catégories', Icon: Tags, enabled: false },
      { path: '/reports', label: 'Rapports', Icon: LineChart, enabled: false },
    ],
  },
  {
    key: 'outils',
    label: 'Outils',
    items: [
      { path: '/import', label: 'Importer', Icon: Upload, enabled: false },
      { path: '/chat', label: 'Chat IA', Icon: MessageSquare, enabled: false },
      { path: '/settings', label: 'Paramètres', Icon: Settings, enabled: true },
    ],
  },
];

const ITEM_BASE: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 36,
  padding: '0 12px',
  margin: '0 8px',
  borderRadius: 6,
  fontSize: 13,
  textDecoration: 'none',
  transition: 'color 120ms ease, background 120ms ease',
  border: 'none',
  width: 'calc(100% - 16px)',
  cursor: 'pointer',
  background: 'transparent',
};

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

export function Sidebar() {
  return (
    <aside
      aria-label="Barre latérale"
      style={{
        width: 232,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink-2)',
        borderRight: '1px solid var(--line-2)',
        height: '100%',
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '20px 18px 18px',
        }}
      >
        <span style={{ color: 'var(--brass)', display: 'flex' }}>
          <BrandMark />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 13,
              lineHeight: 1,
              letterSpacing: '-0.015em',
              color: 'var(--paper)',
            }}
          >
            Finance
          </span>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 15,
              lineHeight: 1,
              color: 'var(--paper-soft)',
            }}
          >
            Dashboard
          </span>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--line-2)', margin: '0 16px' }} />

      {/* Nav groups */}
      <nav aria-label="Navigation principale" style={{ flex: 1, padding: '8px 0' }}>
        {GROUPS.map((group) => (
          <div key={group.key} style={{ paddingBottom: 8 }}>
            <span
              style={{
                display: 'block',
                padding: '12px 16px 6px',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--paper-dim)',
              }}
            >
              {group.label}
            </span>
            {group.items.map((item) =>
              item.enabled ? (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className="nav-item"
                  style={({ isActive }) => ({
                    ...ITEM_BASE,
                    color: isActive ? 'var(--paper)' : 'var(--paper-mute)',
                    background: isActive ? 'var(--brass-soft)' : 'transparent',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 6,
                          bottom: 6,
                          width: 2,
                          borderRadius: 9999,
                          background: isActive ? 'var(--brass)' : 'transparent',
                        }}
                      />
                      <item.Icon size={14} strokeWidth={1.6} />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ) : (
                <button
                  key={item.path}
                  disabled
                  style={{
                    ...ITEM_BASE,
                    color: 'var(--paper-dim)',
                    opacity: 0.5,
                    textAlign: 'left',
                  }}
                >
                  <item.Icon size={14} strokeWidth={1.6} />
                  <span>{item.label}</span>
                </button>
              ),
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 18px',
          borderTop: '1px solid var(--line-2)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1,
            color: 'var(--paper-mute)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--sage)',
              flexShrink: 0,
            }}
          />
          local · privé
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1,
            color: 'var(--paper-dim)',
          }}
        >
          v{pkg.version}
        </span>
      </div>
    </aside>
  );
}
