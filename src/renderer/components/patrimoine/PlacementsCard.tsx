import { useEffect, useState } from 'react';
import { Eye, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type {
  QuoteSettings,
  RefreshResult,
  SupportWithPerf,
  WrapperWithSupports,
} from '@shared/types/investment';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Overline } from '../ui/overline';
import { Button } from '../ui/button';
import { Money } from '../ui/money';
import { formatPercent } from '../../lib/euro';
import { formatTs } from '../../lib/formatDate';
import { cn } from '../../lib/utils';

const ISIN_INPUT =
  'h-7 w-36 rounded-md border border-line-2 bg-ink-3 px-2 font-mono text-[12px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

/** Inline ISIN entry shown on an open support with no value yet, when the price feed is on.
 *  Saving values the support immediately (the handler refreshes the quote) — no detail dialog,
 *  no separate "refresh quotes" click. */
function InlineIsin({
  support,
  onSubmit,
}: {
  support: SupportWithPerf;
  onSubmit: (supportId: string, isin: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(support.isin ?? '');
  const [busy, setBusy] = useState(false);

  const normalized = value.trim().toUpperCase();

  function submit() {
    if (normalized === '' || busy) return;
    setBusy(true);
    void onSubmit(support.id, normalized)
      .catch(() => {
        toast.error("L'ISIN n'a pas pu être enregistré");
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        className={ISIN_INPUT}
        value={value}
        placeholder="ISIN (ex. IE00B4L5Y983)"
        aria-label={`ISIN ${support.name}`}
        disabled={busy}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <Button variant="outline" size="sm" disabled={normalized === '' || busy} onClick={submit}>
        {busy ? <RefreshCw size={12} strokeWidth={1.8} className="animate-spin" /> : 'Valoriser'}
      </Button>
    </span>
  );
}

/** Colour class for a performance value: sage for gains, coral for losses. */
function perfColor(value: number | null): string {
  if (value === null) return 'text-paper-mute';
  return value >= 0 ? 'text-[color:var(--color-income)]' : 'text-[color:var(--color-expense)]';
}

function SupportPerf({ perf }: { perf: SupportWithPerf['perf'] }) {
  // Each metric is shown only when available: the realized/latent gain (always), the
  // money-weighted TRI (≥ 1 year), and the time-weighted TTWROR (only when real declared
  // valuations back it — annualised ≥ 1 year, else cumulative). No "—" placeholders.
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums text-[11px]">
      <span className={perfColor(perf.absoluteGain)}>
        <Money value={perf.absoluteGain} className="text-[11px]" />
        {perf.absoluteReturn !== null && <> ({formatPercent(perf.absoluteReturn)})</>}
      </span>
      {perf.triAnnual !== null && (
        <span className={perfColor(perf.triAnnual)}>TRI {formatPercent(perf.triAnnual)} /an</span>
      )}
      {perf.ttworrAnnual !== null ? (
        <span className={perfColor(perf.ttworrAnnual)}>
          TTWROR {formatPercent(perf.ttworrAnnual)} /an
        </span>
      ) : perf.ttworrCumulative !== null ? (
        <span className={perfColor(perf.ttworrCumulative)}>
          TTWROR {formatPercent(perf.ttworrCumulative)} depuis l&apos;origine
        </span>
      ) : null}
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
  onAddSupport,
  onUpdateSupport,
  onOpenDetail,
  onDeleteWrapper,
  onDeleteSupport,
  onImport,
  getQuoteSettings,
  refreshQuotes,
  onSetSupportIsin,
}: {
  wrappers: WrapperWithSupports[];
  onAddWrapper: () => void;
  onAddSupport: (wrapper: WrapperWithSupports) => void;
  onUpdateSupport: (support: SupportWithPerf) => void;
  onOpenDetail: (support: SupportWithPerf) => void;
  onDeleteWrapper: (id: string) => void;
  onDeleteSupport: (id: string) => void;
  onImport: () => void;
  getQuoteSettings: () => Promise<QuoteSettings>;
  refreshQuotes: () => Promise<RefreshResult>;
  /** Saves the ISIN and (when the feed is on) values the support immediately. */
  onSetSupportIsin: (supportId: string, isin: string | null) => Promise<void>;
}) {
  const [confirmingWrapperId, setConfirmingWrapperId] = useState<string | null>(null);
  const [confirmingSupportId, setConfirmingSupportId] = useState<string | null>(null);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void getQuoteSettings().then(setQuoteSettings);
  }, [getQuoteSettings]);

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1">
          <Overline>Investissements</Overline>
          <CardTitle>Placements</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {quoteSettings?.enabled === true && (
            <div className="flex flex-col items-end gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true);
                  void refreshQuotes()
                    .then(() =>
                      getQuoteSettings().then((s) => {
                        setQuoteSettings(s);
                      }),
                    )
                    .finally(() => {
                      setRefreshing(false);
                    });
                }}
              >
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
                Rafraîchir les cours
              </Button>
              <span className="font-sans text-[11px] text-paper-dim">
                Dernière mise à jour {formatTs(quoteSettings.lastRefreshAt)}
              </span>
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={onImport}>
            <Upload size={13} strokeWidth={1.8} />
            Importer un relevé (CSV)
          </Button>
          <Button variant="secondary" size="sm" onClick={onAddWrapper}>
            <Plus size={13} strokeWidth={1.8} />
            Ajouter une enveloppe
          </Button>
        </div>
      </CardHeader>

      <p className="-mt-1 font-sans text-[12px] text-paper-mute">
        Investissements suivis en performance (TRI / TTWROR) — PEA, AV, CTO. Pour un bien que tu
        valorises simplement (résidence…), utilise « Biens ».
      </p>

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
                      onAddSupport(wrapper);
                    }}
                    aria-label={`Ajouter un support à ${wrapper.name}`}
                  >
                    <Plus size={13} strokeWidth={1.8} />
                  </Button>
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
                        {support.needsValuation ? (
                          quoteSettings?.enabled === true ? (
                            <InlineIsin support={support} onSubmit={onSetSupportIsin} />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateSupport(support);
                              }}
                              className="font-sans text-[11px] text-brass hover:underline"
                            >
                              déclare la valeur actuelle
                            </button>
                          )
                        ) : (
                          <>
                            <Money value={support.currentValue} className="text-[12px]" />
                            {support.currentValueSource === 'quote' && (
                              <span className="text-[10px] uppercase tracking-wide text-paper-dim">
                                cours auto
                              </span>
                            )}
                            <SupportPerf perf={support.perf} />
                          </>
                        )}
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

                  {wrapper.supports.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddSupport(wrapper);
                      }}
                      className="flex items-center gap-1.5 rounded-md py-1 font-sans text-[12px] text-paper-mute hover:text-paper-soft"
                    >
                      <Plus size={12} strokeWidth={1.8} />
                      Aucun support — ajoute ton premier support
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
