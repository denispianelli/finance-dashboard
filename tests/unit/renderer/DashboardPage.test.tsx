// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { DashboardPage } from '@renderer/pages/DashboardPage';

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  it('renders account tabs with mock accounts', () => {
    renderPage();
    expect(screen.getByText('Compte joint')).toBeInTheDocument();
    expect(screen.getByText('Livret A')).toBeInTheDocument();
  });

  it('renders KPI tiles', () => {
    renderPage();
    expect(screen.getByText('Solde net')).toBeInTheDocument();
    expect(screen.getByText(/Dépenses/)).toBeInTheDocument();
  });

  it('renders transaction table with mock rows', () => {
    renderPage();
    expect(screen.getByText('Carrefour Market')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
  });

  it('renders insight panel', () => {
    renderPage();
    expect(screen.getAllByText(/restaurants/i).length).toBeGreaterThan(0);
  });

  it('does not render ImportModal', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
