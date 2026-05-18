export interface OfxTransaction {
  date: string; // ISO yyyy-mm-dd
  amount: number; // signed
  fitid: string;
  label: string;
}

export interface ParsedOfx {
  org: string | null;
  bankId: string | null;
  ledgerBalance: number | null;
  transactions: OfxTransaction[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.trim().replace(/\s/g, '').replace(',', '.'));
  if (Number.isNaN(n)) throw new Error(`OFX: invalid amount "${raw}"`);
  return n;
}

function parseOfxDate(raw: string): string {
  const d = raw.trim().slice(0, 8);
  if (!/^\d{8}$/.test(d)) throw new Error(`OFX: invalid date "${raw}"`);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Tokenize into [tag, immediateText] pairs. Closing tags ("/TAG") have no
 *  value and are kept as markers; leaf values are the text up to the next "<". */
function tokenize(body: string): { tag: string; value: string }[] {
  const re = /<([/A-Z0-9.]+)>([^<]*)/g;
  const out: { tag: string; value: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1] ?? '';
    if (tag) out.push({ tag, value: (m[2] ?? '').trim() });
  }
  return out;
}

export function parseOfx(content: Buffer): ParsedOfx {
  const text = content.toString('latin1');
  const ofxStart = text.indexOf('<OFX>');
  if (ofxStart === -1) throw new Error('OFX: no <OFX> root');
  const tokens = tokenize(text.slice(ofxStart));

  let org: string | null = null;
  let bankId: string | null = null;
  let ledgerBalance: number | null = null;
  const transactions: OfxTransaction[] = [];

  let cur: (Partial<OfxTransaction> & { name?: string; memo?: string }) | null = null;
  let inLedger = false;

  for (const { tag, value } of tokens) {
    switch (tag) {
      case 'ORG':
        org = value || null;
        break;
      case 'BANKID':
        bankId ??= value || null;
        break;
      case 'STMTTRN':
        cur = {};
        break;
      case '/STMTTRN': {
        if (cur?.fitid === undefined || cur.date === undefined || cur.amount === undefined) {
          throw new Error('OFX: incomplete STMTTRN');
        }
        const label = decodeEntities(cur.name ?? cur.memo ?? '');
        transactions.push({
          date: cur.date,
          amount: cur.amount,
          fitid: cur.fitid,
          label,
        });
        cur = null;
        break;
      }
      case 'DTPOSTED':
        if (cur) cur.date = parseOfxDate(value);
        break;
      case 'TRNAMT':
        if (cur) cur.amount = parseAmount(value);
        break;
      case 'FITID':
        if (cur) {
          if (!value) throw new Error('OFX: empty FITID');
          cur.fitid = value;
        }
        break;
      case 'NAME':
        if (cur) cur.name = value;
        break;
      case 'MEMO':
        if (cur) cur.memo = value;
        break;
      case 'LEDGERBAL':
        inLedger = true;
        break;
      case '/LEDGERBAL':
        inLedger = false;
        break;
      case 'BALAMT':
        if (inLedger) ledgerBalance = parseAmount(value);
        break;
      default:
        break;
    }
  }

  if (transactions.length === 0) throw new Error('OFX: no transactions');
  return { org, bankId, ledgerBalance, transactions };
}
