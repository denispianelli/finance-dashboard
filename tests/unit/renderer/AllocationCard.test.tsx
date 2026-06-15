// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AllocationCard } from '@renderer/components/patrimoine/AllocationCard';
import type { Allocation } from '@shared/types/patrimoine';

afterEach(() => {
  cleanup();
});

const ALLOC: Allocation = {
  total: 100000,
  slices: [
    {
      classId: 'c1',
      name: 'Immo',
      color: '#7C9A8E',
      value: 62000,
      pct: 0.62,
      targetPct: 0.55,
      gap: 0.07,
    },
    {
      classId: 'c2',
      name: 'Actions',
      color: '#D4B062',
      value: 18000,
      pct: 0.18,
      targetPct: 0.25,
      gap: -0.07,
    },
  ],
};

it('renders a row per class and shows the target-sum hint when ≠ 100%', () => {
  render(<AllocationCard allocation={ALLOC} onManage={vi.fn()} />);
  expect(screen.getByText('Immo')).toBeInTheDocument();
  expect(screen.getByText('Actions')).toBeInTheDocument();
  expect(screen.getByText(/cibles/i)).toBeInTheDocument(); // targets sum to 80%
});

it('renders the empty state when there are no slices', () => {
  render(<AllocationCard allocation={{ total: 0, slices: [] }} onManage={vi.fn()} />);
  expect(screen.getByText(/aucune classe/i)).toBeInTheDocument();
});
