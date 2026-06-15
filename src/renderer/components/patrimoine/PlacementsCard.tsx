import { useState } from 'react';
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { SupportWithPerf, WrapperWithSupports } from '@shared/types/investment';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Overline } from '../ui/overline';
import { Button } from '../ui/button';
import { Money } from '../ui/money';
import { formatPercent } from '../../lib/euro';

/** Format a fraction as a percentage, or return a dash when null. */
function formatPct(value: number | null): string {
  return value === null ? '—' : formatPercent(value);
}

/** Colour class for a performance value: sage for gains, coral for losses. */
function perfColor(value: number | null): string {
  if (value === null) return 'text-paper-mute';
  return value >= 0 ? 'text-[color:var(--color-income)]' : 'text-[color:var(--color-expense)]';
}

function SupportPerf({ perf }: { perf: SupportWithPerf['perf'] }) {
  if (perf.hasFullYear) {
    // Annualised figures
    return (
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums text-[11px]">
        {perf.triAnnual !== null && (
          <span className={perfColor(perf.triAnnual)}>TRI {formatPct(perf.triAnnual)} /an</span>
        )}
        <span className={perfColor(perf.ttworrAnnual)}>
          TTWROR {formatPct(perf.ttworrAnnual)} /an
        </span>
      </span>
    );
  }

  // Less than 1 year — cumulative
  if (perf.ttworrCumulative === null) {
    return <span className="font-sans text-[11px] text-paper-mute">pas encore de perf</span>;
  }

  return (
    <span className={`font-mono tabular-nums text-[11px] ${perfColor(perf.ttworrCumulative)}`}>
      {formatPct(perf.ttworrCumulative)} depuis l&apos;origine
    </span>
  );
}

function WrapperDeleteConfirm({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 font-sans text-[13px] text-paper-soft">
        Supprimer l&apos;enveloppe « {name} » et tous ses supports ?
      </span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-ink-3"
      >
        Supprimer
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-ink-3"
      >
        Annuler
      </button>
    </div>
  );
}

function SupportDeleteConfirm({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 font-sans text-[13px] text-paper-soft">Supprimer « {name} » ?</span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-ink-3"
      >
        Supprimer
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-ink-3"
      >
        Annuler
      </button>
    </div>
  );
}

export function PlacementsCard({
  wrappers,
  onAddWrapper,
  onUpdateSupport,
  onOpenDetail,
  onDeleteWrapper,
  onDeleteSupport,
}: {
  wrappers: WrapperWithSupports[];
  onAddWrapper: () => void;
  onUpdateSupport: (support: SupportWithPerf) => void;
  onOpenDetail: (support: SupportWithPerf) => void;
  onDeleteWrapper: (id: string) => void;
  onDeleteSupport: (id: string) => void;
}) {
  const [confirmingWrapperId, setConfirmingWrapperId] = useState<string | null>(null);
  const [confirmingSupportId, setConfirmingSupportId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <Overline>— IV</Overline>
          <CardTitle>Placements</CardTitle>
        </div>
        <Button variant="secondary" size="sm" onClick={onAddWrapper}>
          <Plus size={13} strokeWidth={1.8} />
          Ajouter une enveloppe
        </Button>
      </CardHeader>

      {wrappers.length === 0 ? (
        <p className="py-6 text-center font-sans text-sm text-paper-mute">
          Aucune enveloppe — ajoute ton PEA, ton assurance-vie…
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {wrappers.map((wrapper) => {
            if (confirmingWrapperId === wrapper.id) {
              return (
                <WrapperDeleteConfirm
                  key={wrapper.id}
                  name={wrapper.name}
                  onConfirm={() => {
                    onDeleteWrapper(wrapper.id);
                    setConfirmingWrapperId(null);
                  }}
                  onCancel={() => {
                    setConfirmingWrapperId(null);
                  }}
                />
              );
            }

            return (
              <div key={wrapper.id} className="flex flex-col gap-2">
                {/* Wrapper header row */}
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-sans text-[13px] font-medium text-paper">
                    {wrapper.name}
                  </span>
                  <Money value={wrapper.perf.currentValue} className="text-[13px]" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmingWrapperId(wrapper.id);
                    }}
                    aria-label={`Supprimer l'enveloppe ${wrapper.name}`}
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </Button>
                </div>

                {/* Support rows */}
                <div className="flex flex-col gap-1.5 pl-3">
                  {wrapper.supports.map((support) => {
                    if (confirmingSupportId === support.id) {
                      return (
                        <SupportDeleteConfirm
                          key={support.id}
                          name={support.name}
                          onConfirm={() => {
                            onDeleteSupport(support.id);
                            setConfirmingSupportId(null);
                          }}
                          onCancel={() => {
                            setConfirmingSupportId(null);
                          }}
                        />
                      );
                    }

                    return (
                      <div key={support.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-sans text-[12px] text-paper-soft">
                          {support.name}
                        </span>
                        <Money value={support.currentValue} className="text-[12px]" />
                        <SupportPerf perf={support.perf} />
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onUpdateSupport(support);
                            }}
                            aria-label={`Mettre à jour ${support.name}`}
                          >
                            <RefreshCw size={12} strokeWidth={1.8} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onUpdateSupport(support);
                            }}
                            aria-label={`Modifier ${support.name}`}
                          >
                            <Pencil size={12} strokeWidth={1.8} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onOpenDetail(support);
                            }}
                            aria-label={`Détail ${support.name}`}
                          >
                            <Eye size={12} strokeWidth={1.8} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setConfirmingSupportId(support.id);
                            }}
                            aria-label={`Supprimer ${support.name}`}
                          >
                            <Trash2 size={12} strokeWidth={1.8} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
