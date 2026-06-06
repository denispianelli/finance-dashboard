// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import * as ipcMod from '@renderer/ipc/client';
import { useCashflow } from '@renderer/hooks/useCashflow';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const monthSeries = [{ period: '2026-04', income: 2000, expense: -500, net: 1500 }];
const yearSeries = [{ period: '2026', income: 9000, expense: -4000, net: 5000 }];

beforeEach(() => {
  vi.spyOn(ipcMod.ipc, 'invoke').mockImplementation(((
    channel: string,
    payload: { granularity?: string },
  ) => {
    if (channel === 'dashboard:cashflow') {
      return Promise.resolve({ series: payload.granularity === 'year' ? yearSeries : monthSeries });
    }
    return Promise.resolve({});
  }) as typeof ipcMod.ipc.invoke);
});

describe('useCashflow', () => {
  it('loads the month series by default', async () => {
    const { result } = renderHook(() => useCashflow());
    await waitFor(() => {
      expect(result.current.series).toEqual(monthSeries);
    });
    expect(result.current.granularity).toBe('month');
  });

  it('refetches with year granularity when toggled', async () => {
    const { result } = renderHook(() => useCashflow());
    await waitFor(() => {
      expect(result.current.series).toEqual(monthSeries);
    });
    act(() => {
      result.current.setGranularity('year');
    });
    await waitFor(() => {
      expect(result.current.series).toEqual(yearSeries);
    });
    expect(result.current.granularity).toBe('year');
  });
});
