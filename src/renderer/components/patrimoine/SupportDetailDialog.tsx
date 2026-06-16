import { useEffect, useState } from 'react';
import type { OperationDTO, SupportHistory, SupportWithPerf } from '@shared/types/investment';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Money } from '../ui/money';
import { formatPercent } from '../../lib/euro';

const INPUT =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

/** Editable ISIN — needed to value a support from the price feed, especially imported supports
 *  (the Fortuneo CSV carries no ISIN). Saving a new ISIN clears the cached ticker server-side. */
function IsinEditor({
  support,
  onSave,
}: {
  support: SupportWithPerf;
  onSave: (supportId: string, isin: string | null) => Promise<void>;
}) {
  // Rendered with key={support.id} by the parent, so it re-mounts (and re-seeds from
  // support.isin) when the dialog switches support — no state-syncing effect needed.
  const [value, setValue] = useState(support.isin ?? '');
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim();
  const dirty = trimmed !== (support.isin ?? '');

  function save() {
    setSaving(true);
    void onSave(support.id, trimmed === '' ? null : trimmed).finally(() => {
      setSaving(false);
    });
  }

  return (
    <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
      ISIN
      <span className="flex items-center gap-2">
        <input
          className={INPUT}
          value={value}
          placeholder="IE00B4L5Y983"
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) save();
          }}
        />
        <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={save}>
          Enregistrer
        </Button>
      </span>
      <span className="text-[11px] text-paper-dim">
        Requis pour valoriser ce support via les cours de marché.
      </span>
    </label>
  );
}

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-paper-dim">—</span>;
  const cls = value >= 0 ? 'text-[color:var(--color-income)]' : 'text-[color:var(--color-expense)]';
  return <span className={cls}>{formatPercent(value)}</span>;
}

function PerfRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[11px] text-paper-dim">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/**
 * History panel — rendered as a separate component keyed on supportId so
 * React re-mounts it when the support changes (avoids synchronous setState
 * inside effects, which the react-hooks/set-state-in-effect rule forbids).
 */
function HistoryPanel({
  supportId,
  loadHistory,
}: {
  supportId: string;
  loadHistory: (id: string) => Promise<SupportHistory>;
}) {
  const [history, setHistory] = useState<SupportHistory | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHistory(supportId).then((h) => {
      if (alive) setHistory(h);
    });
    return () => {
      alive = false;
    };
  }, [supportId, loadHistory]);

  if (!history) {
    return <p className="font-sans text-[13px] text-paper-dim">Chargement de l&apos;historique…</p>;
  }

  if (history.valuations.length === 0 && history.flows.length === 0) {
    return (
      <p className="font-sans text-[13px] text-paper-dim">Aucun historique pour ce support.</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {history.valuations.length > 0 && (
        <section>
          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
            Valorisations
          </p>
          <table className="w-full font-mono text-[12px] tabular-nums text-paper">
            <thead className="sticky top-0 bg-ink-1 text-paper-dim">
              <tr className="border-b border-line-2 text-left">
                <th className="px-2 py-1.5 font-sans text-[11px] font-medium">Date</th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {history.valuations.map((v) => (
                <tr key={v.date} className="border-b border-line-1">
                  <td className="px-2 py-1 font-mono">{v.date}</td>
                  <td className="px-2 py-1 text-right">
                    <Money value={v.value} className="text-[12px]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {history.flows.length > 0 && (
        <section>
          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
            Flux
          </p>
          <table className="w-full font-mono text-[12px] tabular-nums text-paper">
            <thead className="sticky top-0 bg-ink-1 text-paper-dim">
              <tr className="border-b border-line-2 text-left">
                <th className="px-2 py-1.5 font-sans text-[11px] font-medium">Date</th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              {history.flows.map((f, idx) => (
                <tr key={`${f.date}-${String(idx)}`} className="border-b border-line-1">
                  <td className="px-2 py-1 font-mono">{f.date}</td>
                  <td className="px-2 py-1 text-right">
                    <Money
                      value={f.amount}
                      kind={f.amount >= 0 ? 'income' : 'expense'}
                      className="text-[12px]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function OperationsPanel({
  supportId,
  loadOperations,
}: {
  supportId: string;
  loadOperations: (supportId: string) => Promise<OperationDTO[]>;
}) {
  const [ops, setOps] = useState<OperationDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadOperations(supportId).then((o) => {
      if (alive) setOps(o);
    });
    return () => {
      alive = false;
    };
  }, [supportId, loadOperations]);

  if (!ops || ops.length === 0) return null;

  return (
    <section>
      <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
        Opérations
      </p>
      <table className="w-full font-mono text-[12px] tabular-nums text-paper">
        <thead className="sticky top-0 bg-ink-1 text-paper-dim">
          <tr className="border-b border-line-2 text-left">
            <th className="px-2 py-1.5 font-sans text-[11px] font-medium">Date</th>
            <th className="px-2 py-1.5 font-sans text-[11px] font-medium">Type</th>
            <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">Qté</th>
            <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">Prix</th>
            <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">Frais</th>
            <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">
              Montant net
            </th>
          </tr>
        </thead>
        <tbody>
          {ops.map((op) => (
            <tr key={op.id} className="border-b border-line-1">
              <td className="px-2 py-1 font-mono">{op.opDate}</td>
              <td className="px-2 py-1 font-sans text-[12px]">
                {op.kind === 'buy' ? 'Achat' : 'Vente'}
              </td>
              <td className="px-2 py-1 text-right">{op.quantity}</td>
              <td className="px-2 py-1 text-right">
                {op.unitPrice !== null ? (
                  <Money value={op.unitPrice} className="text-[12px]" />
                ) : (
                  <span className="text-paper-dim">—</span>
                )}
              </td>
              <td className="px-2 py-1 text-right">
                {op.fees !== null ? (
                  <Money value={op.fees} className="text-[12px]" />
                ) : (
                  <span className="text-paper-dim">—</span>
                )}
              </td>
              <td className="px-2 py-1 text-right">
                <Money
                  value={op.net}
                  kind={op.net >= 0 ? 'income' : 'expense'}
                  className="text-[12px]"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SupportDetailDialog({
  open,
  onOpenChange,
  support,
  loadHistory,
  loadOperations,
  onSetIsin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  support: SupportWithPerf | null;
  loadHistory: (supportId: string) => Promise<SupportHistory>;
  loadOperations: (supportId: string) => Promise<OperationDTO[]>;
  onSetIsin: (supportId: string, isin: string | null) => Promise<void>;
}) {
  if (!support) return null;

  const { perf } = support;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {support.name}
            {support.isin ? (
              <span className="ml-2 font-mono text-[13px] font-normal text-paper-dim">
                {support.isin}
              </span>
            ) : null}{' '}
            — détail
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* ISIN — editable, drives the price feed */}
          <section>
            <IsinEditor key={support.id} support={support} onSave={onSetIsin} />
          </section>

          {/* Performance summary */}
          <section>
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-widest text-paper-dim">
              Performance
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <PerfRow label="Valeur actuelle">
                <Money value={perf.currentValue} className="text-[13px]" />
              </PerfRow>
              <PerfRow label="Montant investi net">
                <Money value={perf.netInvested} className="text-[13px]" />
              </PerfRow>
              <PerfRow label="Gain absolu">
                <Money
                  value={perf.absoluteGain}
                  kind={perf.absoluteGain >= 0 ? 'income' : 'expense'}
                  className="text-[13px]"
                />
              </PerfRow>
              <PerfRow label="TTWROR cumulé">
                <span className="font-mono tabular-nums text-[13px]">
                  <Pct value={perf.ttworrCumulative} />
                </span>
              </PerfRow>
              {perf.hasFullYear && (
                <>
                  <PerfRow label="TTWROR annualisé">
                    <span className="font-mono tabular-nums text-[13px]">
                      <Pct value={perf.ttworrAnnual} />
                    </span>
                  </PerfRow>
                  <PerfRow label="TRI annualisé">
                    <span className="font-mono tabular-nums text-[13px]">
                      <Pct value={perf.triAnnual} />
                    </span>
                  </PerfRow>
                </>
              )}
              {perf.startDate && (
                <PerfRow label="Depuis">
                  <span className="font-mono text-[13px] text-paper-soft">{perf.startDate}</span>
                </PerfRow>
              )}
            </div>
          </section>

          {/* History tables — keyed on support.id to re-mount on support change */}
          <div className="max-h-[40vh] overflow-y-auto">
            <div className="flex flex-col gap-5">
              <HistoryPanel key={support.id} supportId={support.id} loadHistory={loadHistory} />
              <OperationsPanel
                key={`ops-${support.id}`}
                supportId={support.id}
                loadOperations={loadOperations}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
