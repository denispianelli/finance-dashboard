import { Banknote, Home, TrendingUp, Wallet } from 'lucide-react';
import type { AssetClass, ClassifiableHolding } from '@shared/types/patrimoine';
import { formatEuro } from '../../lib/euro';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

function kindIcon(kind: ClassifiableHolding['kind']) {
  if (kind === 'account') return <Wallet size={13} strokeWidth={1.6} />;
  if (kind === 'asset') return <Home size={13} strokeWidth={1.6} />;
  if (kind === 'support') return <TrendingUp size={13} strokeWidth={1.6} />;
  return <Banknote size={13} strokeWidth={1.6} />;
}

function kindLabel(kind: ClassifiableHolding['kind']) {
  if (kind === 'account') return 'Compte';
  if (kind === 'asset') return 'Bien';
  if (kind === 'support') return 'Support';
  return 'Prêt';
}

export function HoldingAssignmentList({
  holdings,
  classes,
  onAssign,
}: {
  holdings: ClassifiableHolding[];
  classes: AssetClass[];
  onAssign: (kind: ClassifiableHolding['kind'], id: string, classId: string | null) => void;
}) {
  if (holdings.length === 0) {
    return (
      <p className="py-4 text-center font-sans text-[13px] text-paper-dim">
        Aucun élément à classer.
      </p>
    );
  }

  const sorted = [...holdings].sort((a, b) => {
    const aUnclassified = a.classId === null ? 0 : 1;
    const bUnclassified = b.classId === null ? 0 : 1;
    if (aUnclassified !== bUnclassified) return aUnclassified - bUnclassified;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col divide-y divide-line-1">
      {sorted.map((h) => (
        <div key={`${h.kind}:${h.id}`} className="flex items-center gap-3 py-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ink-3 text-paper-dim"
            title={kindLabel(h.kind)}
          >
            {kindIcon(h.kind)}
          </span>
          <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-paper">{h.name}</span>
          {/* Only assets carry a meaningful signed value here; accounts (statement
              balance) and loans (CRD) are valued by the read-model, not this picker,
              so we don't show a misleading 0 € for them. */}
          {h.kind === 'asset' && (
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-paper-dim">
              {formatEuro(h.signedValue)}
            </span>
          )}
          <select
            className={`${INPUT} w-44 shrink-0`}
            value={h.classId ?? ''}
            onChange={(e) => {
              onAssign(h.kind, h.id, e.target.value === '' ? null : e.target.value);
            }}
          >
            <option value="">Non classé</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
