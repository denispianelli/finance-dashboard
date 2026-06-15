import type {
  ParseBourseResult,
  ParsedOp,
  SkippedRow,
  OperationKind,
} from '@shared/types/investment';

const num = (s: string | undefined): number => {
  const n = Number((s ?? '').trim());
  return Number.isFinite(n) ? n : NaN;
};

const numOrNull = (s: string | undefined): number | null => {
  const n = num(s);
  return Number.isFinite(n) ? n : null;
};

function isoDate(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (m === null) return null;
  return `${m[3] ?? ''}-${m[2] ?? ''}-${m[1] ?? ''}`;
}

function kindOf(op: string): OperationKind | null {
  const t = op.trim();
  if (t.startsWith('Achat')) return 'buy';
  if (t.startsWith('Vente')) return 'sell';
  return null;
}

export function parseBourseCsv(text: string): ParseBourseResult {
  const lines = text.split(/\r?\n/);
  const ops: ParsedOp[] = [];
  const skipped: SkippedRow[] = [];

  lines.forEach((line, i) => {
    if (i === 0) return; // header
    if (line.trim() === '') return; // blank

    const c = line.split(';');
    const kind = kindOf(c[1] ?? '');
    const opDate = isoDate(c[3] ?? '');
    const net = num(c[8]);

    if (kind === null) {
      skipped.push({
        line: i + 1,
        raw: line,
        reason: `type d'opération non géré: ${(c[1] ?? '').trim()}`,
      });
      return;
    }

    if (opDate === null || !Number.isFinite(net)) {
      skipped.push({ line: i + 1, raw: line, reason: 'date ou montant net illisible' });
      return;
    }

    ops.push({
      opDate,
      kind,
      quantity: Math.abs(num(c[4])) || 0,
      unitPrice: numOrNull(c[5]),
      gross: numOrNull(c[6]),
      fees: numOrNull(c[7]),
      net,
      currency: (c[9] ?? '').trim() || 'EUR',
      rawLabel: (c[0] ?? '').trim(),
    });
  });

  return { ops, skipped };
}
