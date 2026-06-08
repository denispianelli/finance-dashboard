// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { PdfModelRequiredDialog } from '@renderer/components/model/PdfModelRequiredDialog';

afterEach(() => {
  cleanup();
});

it('offers install and CSV/OFX paths when open', () => {
  const onInstall = vi.fn();
  const onClose = vi.fn();
  render(
    <PdfModelRequiredDialog open sizeLabel="~1,9 Go" onInstall={onInstall} onClose={onClose} />,
  );
  expect(screen.getAllByText(/CSV/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /installer le modèle/i }));
  expect(onInstall).toHaveBeenCalledOnce();
});

it('calls onClose via the CSV/OFX button', () => {
  const onClose = vi.fn();
  render(<PdfModelRequiredDialog open sizeLabel="~1,9 Go" onInstall={vi.fn()} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: /importer en csv\/ofx/i }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('renders no dialog content when closed', () => {
  render(
    <PdfModelRequiredDialog
      open={false}
      sizeLabel="~1,9 Go"
      onInstall={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByText(/nécessite le modèle/i)).not.toBeInTheDocument();
});

it('fires onClose on Escape', () => {
  const onClose = vi.fn();
  render(<PdfModelRequiredDialog open sizeLabel="~1,9 Go" onInstall={vi.fn()} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
