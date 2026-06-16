const SEARCH_URL = 'https://api.portfolio-performance.info/v1/search';
const QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 15_000;
// A browser-like UA: Yahoo rejects some non-browser agents. Only the UA + IP leave the machine.
const UA = 'Mozilla/5.0 (finance-dashboard; opt-in price feed)';

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null; // offline, timeout, abort, malformed — caller treats null as failure
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** ISIN → EUR exchange ticker (prefer XETR), or null when unresolvable. */
export async function resolveSymbol(isin: string): Promise<string | null> {
  const body = await getJson(`${SEARCH_URL}?q=${encodeURIComponent(isin)}`);
  if (!Array.isArray(body)) return null;
  const hit = body.find((h): h is Record<string, unknown> => isRecord(h) && h.isin === isin);
  if (hit === undefined || !Array.isArray(hit.markets)) return null;
  const eur = hit.markets.filter(
    (m): m is { currency: string; exchange: string; symbol: string } =>
      isRecord(m) &&
      m.currency === 'EUR' &&
      typeof m.symbol === 'string' &&
      typeof m.exchange === 'string',
  );
  if (eur.length === 0) return null;
  const xetr = eur.find((m) => m.exchange === 'XETR');
  return (xetr ?? eur[0])?.symbol ?? null;
}

/** Latest EUR quote for a ticker, or null on any failure / non-EUR currency. */
export async function fetchLatestQuote(
  symbol: string,
): Promise<{ price: number; asOf: string } | null> {
  const body = await getJson(`${QUOTE_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  if (!isRecord(body)) return null;
  const chart = body.chart;
  if (!isRecord(chart)) return null;
  const results: unknown[] = Array.isArray(chart.result) ? (chart.result as unknown[]) : [];
  if (results.length === 0) return null;
  const first: unknown = results[0];
  if (!isRecord(first) || !isRecord(first.meta)) return null;
  const meta = first.meta;
  if (meta.currency !== 'EUR') return null;
  if (typeof meta.regularMarketPrice !== 'number' || typeof meta.regularMarketTime !== 'number')
    return null;
  const asOf = new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10);
  return { price: meta.regularMarketPrice, asOf };
}
