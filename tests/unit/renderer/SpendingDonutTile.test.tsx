// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SpendingDonutTile } from '@renderer/components/dashboard/SpendingDonutTile';

const segments = [
  { key: 'log', label: 'Logement', value: 800, color: 'var(--cat-1)' },
  { key: 'cou', label: 'Courses', value: 360, color: 'var(--cat-2)' },
];

describe('SpendingDonutTile', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title and a legend entry per top segment', () => {
    render(<SpendingDonutTile segments={segments} total={1160} periodLabel="mai 2026" />);
    expect(screen.getByText(/Où part l'argent/i)).toBeInTheDocument();
    expect(screen.getByText('Logement')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
  });

  it('shows an empty state when there is no spending', () => {
    render(<SpendingDonutTile segments={[]} total={0} periodLabel="mai 2026" />);
    expect(screen.getByText(/Pas encore de dépenses/i)).toBeInTheDocument();
  });
});
