// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@renderer/components/ImportModal', () => ({
  ImportModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="ImportModal" /> : null,
}));

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
  it('renders the Importer button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /importer un relevé/i })).toBeInTheDocument();
  });

  it('modal is initially closed', () => {
    renderPage();
    expect(screen.queryByRole('dialog', { name: 'ImportModal' })).not.toBeInTheDocument();
  });

  it('opens modal when Importer button is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /importer un relevé/i }));
    expect(screen.getByRole('dialog', { name: 'ImportModal' })).toBeInTheDocument();
  });
});
