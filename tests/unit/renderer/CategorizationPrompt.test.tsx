// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { CategorizationPrompt } from '@renderer/components/model/CategorizationPrompt';

afterEach(() => {
  cleanup();
});

it('shows the pending count and triggers install', () => {
  const onInstall = vi.fn();
  render(
    <CategorizationPrompt
      pendingCount={142}
      onInstall={onInstall}
      onDismiss={vi.fn()}
      onOptOut={vi.fn()}
    />,
  );
  expect(screen.getByText('142')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /activer/i }));
  expect(onInstall).toHaveBeenCalledOnce();
});

it('fires onDismiss when the close button is clicked', () => {
  const onDismiss = vi.fn();
  render(
    <CategorizationPrompt
      pendingCount={3}
      onInstall={vi.fn()}
      onDismiss={onDismiss}
      onOptOut={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /fermer/i }));
  expect(onDismiss).toHaveBeenCalledOnce();
});

it('fires onOptOut(true) when the checkbox is toggled', () => {
  const onOptOut = vi.fn();
  render(
    <CategorizationPrompt
      pendingCount={3}
      onInstall={vi.fn()}
      onDismiss={vi.fn()}
      onOptOut={onOptOut}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onOptOut).toHaveBeenCalledWith(true);
});
