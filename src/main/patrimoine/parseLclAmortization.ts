import type { ParsedInstallment, ParsedLoanTable } from '@shared/types/patrimoine';
import { parseFrAmount, frDateToIso, extractAmounts } from './numbers';

const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;

function firstMatch(lines: string[], re: RegExp): RegExpExecArray | null {
  for (const line of lines) {
    const m = re.exec(line);
    if (m) return m;
  }
  return null;
}

function parseInstallmentLine(line: string, seq: number): ParsedInstallment | null {
  const dateMatch = DATE_RE.exec(line);
  if (!dateMatch) return null;
  const afterDate = line.slice(dateMatch.index + dateMatch[0].length);
  const amounts = extractAmounts(afterDate);
  // capital, interest, insurance, fees, payment, balanceAfter
  if (amounts.length !== 6) return null;
  const capital = amounts[0] ?? 0;
  const interest = amounts[1] ?? 0;
  const insurance = amounts[2] ?? 0;
  const fees = amounts[3] ?? 0;
  const payment = amounts[4] ?? 0;
  const balanceAfter = amounts[5] ?? 0;
  return {
    seq,
    dueDate: frDateToIso(dateMatch[1] ?? ''),
    capital,
    interest,
    insurance,
    fees,
    payment,
    balanceAfter,
  };
}

export function parseLclAmortization(lines: string[]): ParsedLoanTable {
  const nameM = firstMatch(lines, /INTITULE DU PRET\s*:\s*(.+?)\s*$/);
  const principalM = firstMatch(lines, /MONTANT DU PRET\s*:\s*EUR\s*([\d ]+,\d{2})/);
  const rateM = firstMatch(lines, /TAUX DEBITEUR EN COURS\s*:\s*([\d ]*,\d+)\s*%/);
  const termM = firstMatch(lines, /DUREE TOTALE DU PRET\s*:\s*(\d+)\s*MOIS/);
  const startM = firstMatch(lines, /DATE DE DEPART DU PRET\s*:\s*(\d{2}\.\d{2}\.\d{4})/);

  const installments: ParsedInstallment[] = [];
  for (const line of lines) {
    const inst = parseInstallmentLine(line, installments.length + 1);
    if (inst) installments.push(inst);
  }
  if (installments.length === 0) {
    throw new Error('parseLclAmortization: no installment rows found');
  }

  const totalsLine = lines.find((l) => /^\s*TOTAL\b/.test(l)) ?? '';
  const totalsAmounts = extractAmounts(totalsLine);

  const rawRate = (rateM?.[1] ?? '0').replace(/0+$/, '') || '0';

  return {
    name: nameM?.[1]?.trim() ?? 'Prêt',
    principal: principalM ? parseFrAmount(principalM[1] ?? '0') : 0,
    nominalRate: parseFrAmount(rawRate),
    termMonths: termM ? Number(termM[1]) : installments.length,
    startDate: startM ? frDateToIso(startM[1] ?? '') : (installments[0]?.dueDate ?? ''),
    installments,
    totals: {
      capital: totalsAmounts[0] ?? 0,
      interest: totalsAmounts[1] ?? 0,
      insurance: totalsAmounts[2] ?? 0,
    },
  };
}
