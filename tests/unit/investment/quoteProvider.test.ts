// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSymbol, fetchLatestQuote } from '../../../src/main/investment/quoteProvider';

const SEARCH = [
  {
    description: 'ISHARES CORE MSCI WORLD',
    isin: 'IE00B4L5Y983',
    markets: [
      { currency: 'USD', exchange: 'XLON', symbol: 'IWDA.L' },
      { currency: 'EUR', exchange: 'XAMS', symbol: 'IWDA.AS' },
      { currency: 'EUR', exchange: 'XETR', symbol: 'EUNL.DE' },
    ],
    provider: 'PP',
    type: 'ETP',
  },
];

const CHART = {
  chart: {
    result: [
      {
        meta: {
          currency: 'EUR',
          symbol: 'EUNL.DE',
          regularMarketPrice: 124.27,
          regularMarketTime: 1781537751,
        },
      },
    ],
    error: null,
  },
};

function mockFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveSymbol', () => {
  it('prefers the XETR EUR market', async () => {
    mockFetch(SEARCH);
    expect(await resolveSymbol('IE00B4L5Y983')).toBe('EUNL.DE');
  });

  it('falls back to the first EUR market when no XETR', async () => {
    mockFetch([
      {
        isin: 'X',
        markets: [
          { currency: 'USD', exchange: 'XLON', symbol: 'A.L' },
          { currency: 'EUR', exchange: 'XAMS', symbol: 'B.AS' },
        ],
      },
    ]);
    expect(await resolveSymbol('X')).toBe('B.AS');
  });

  it('returns null when there is no EUR market', async () => {
    mockFetch([{ isin: 'X', markets: [{ currency: 'USD', exchange: 'XLON', symbol: 'A.L' }] }]);
    expect(await resolveSymbol('X')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(SEARCH, false);
    expect(await resolveSymbol('IE00B4L5Y983')).toBeNull();
  });
});

describe('fetchLatestQuote', () => {
  it('returns price + asOf date from regularMarketTime', async () => {
    mockFetch(CHART);
    const q = await fetchLatestQuote('EUNL.DE');
    expect(q).toEqual({ price: 124.27, asOf: '2026-06-15' });
  });

  it('returns null when currency is not EUR', async () => {
    mockFetch({
      chart: {
        result: [
          { meta: { currency: 'USD', regularMarketPrice: 100, regularMarketTime: 1781537751 } },
        ],
        error: null,
      },
    });
    expect(await fetchLatestQuote('IWDA.L')).toBeNull();
  });

  it('returns null on a chart error', async () => {
    mockFetch({ chart: { result: null, error: { code: 'Not Found' } } });
    expect(await fetchLatestQuote('NOPE')).toBeNull();
  });
});
