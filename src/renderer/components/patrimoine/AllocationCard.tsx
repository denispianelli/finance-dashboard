import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import type { Allocation } from '@shared/types/patrimoine';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Overline } from '../ui/overline';
import { Button } from '../ui/button';
import { Money } from '../ui/money';
import { formatPercent } from '../../lib/euro';

export function AllocationCard({
  allocation,
  onManage,
}: {
  allocation: Allocation | null;
  onManage: () => void;
}) {
  const isEmpty = allocation === null || allocation.slices.length === 0;

  const sumTargets = allocation?.slices.reduce((s, x) => s + (x.targetPct ?? 0), 0) ?? 0;
  const showTargetHint = !isEmpty && Math.abs(sumTargets - 1) > 0.005;

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1">
          <Overline>Répartition</Overline>
          <CardTitle>Allocation par classe</CardTitle>
        </div>
        <Button variant="secondary" size="sm" onClick={onManage}>
          <Settings2 size={13} strokeWidth={1.8} />
          Gérer les classes
        </Button>
      </CardHeader>

      {isEmpty ? (
        <p className="py-6 text-center font-sans text-sm text-paper-mute">
          Aucune classe — crée tes classes d&apos;actifs pour voir ta répartition.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {allocation.slices.map((slice) => (
              <li key={slice.classId ?? '__none__'} className="flex flex-col gap-1">
                {/* Row 1: swatch · name · amount · pct */}
                <div className="flex items-center gap-2 font-sans text-[12px]">
                  <span className="h-2 w-2 shrink-0 rounded" style={{ background: slice.color }} />
                  <span className="flex-1 truncate text-paper-soft">{slice.name}</span>
                  <Money value={slice.value} className="text-[12px]" />
                  <span className="font-mono tabular-nums text-paper-mute">
                    {formatPercent(slice.pct)}
                  </span>
                </div>

                {/* Track bar */}
                <div className="relative h-1.5 rounded bg-line-2">
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${String(Math.max(0, Math.min(1, slice.pct)) * 100)}%`,
                      background: slice.color,
                    }}
                  />
                  {slice.targetPct != null && (
                    <div
                      className="absolute inset-y-0 w-px bg-paper-mute"
                      style={{ left: `${String(slice.targetPct * 100)}%` }}
                    />
                  )}
                </div>

                {/* Row 2: target · gap */}
                <div className="flex items-center gap-3 font-sans text-[11px] text-paper-mute">
                  <span>
                    cible {slice.targetPct == null ? '—' : formatPercent(slice.targetPct)}
                  </span>
                  {slice.gap != null && slice.gap !== 0 && (
                    <span
                      className={
                        slice.gap < 0
                          ? 'flex items-center gap-0.5 text-[color:var(--color-income)]'
                          : 'flex items-center gap-0.5 text-[color:var(--color-expense)]'
                      }
                    >
                      {slice.gap < 0 ? (
                        <ArrowDown size={11} strokeWidth={2} />
                      ) : (
                        <ArrowUp size={11} strokeWidth={2} />
                      )}
                      {formatPercent(Math.abs(slice.gap))} écart
                    </span>
                  )}
                  {slice.gap === 0 && <span className="text-paper-mute">écart 0 %</span>}
                </div>
              </li>
            ))}
          </ul>

          {showTargetHint && (
            <p className="font-sans text-xs text-paper-mute">
              cibles = {formatPercent(sumTargets)}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
