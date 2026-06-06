// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import * as ipcMod from '@renderer/ipc/client';
import { ReportsPage } from '@renderer/pages/ReportsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(ipcMod.ipc, 'invoke').mockResolvedValue({
    series: [{ period: '2026-04', income: 2000, expense: -500, net: 1500 }],
  });
});

describe('ReportsPage', () => {
  it('renders the cash-flow card from the channel data', async () => {
    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText(/gains et pertes/i)).toBeTruthy();
    });
    expect(screen.getByText(/avril 2026/i)).toBeTruthy();
  });
});
