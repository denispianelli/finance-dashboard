// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { ModelSettingsSection } from '@renderer/components/model/ModelSettingsSection';

afterEach(() => {
  cleanup();
});

it('absent → Télécharger fires onDownload', () => {
  const onDownload = vi.fn();
  render(
    <ModelSettingsSection
      status={{ state: 'absent' }}
      onDownload={onDownload}
      onRemove={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /télécharger/i }));
  expect(onDownload).toHaveBeenCalledOnce();
});

it('ready → Supprimer fires onRemove', () => {
  const onRemove = vi.fn();
  render(
    <ModelSettingsSection status={{ state: 'ready' }} onDownload={vi.fn()} onRemove={onRemove} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));
  expect(onRemove).toHaveBeenCalledOnce();
});

it('paused → Reprendre fires onDownload', () => {
  const onDownload = vi.fn();
  render(
    <ModelSettingsSection
      status={{ state: 'paused' }}
      onDownload={onDownload}
      onRemove={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
  expect(onDownload).toHaveBeenCalledOnce();
});

it('downloading → shows percent and no main action button', () => {
  render(
    <ModelSettingsSection
      status={{ state: 'downloading', receivedBytes: 1_009_688_848, totalBytes: 2_019_377_696 }}
      onDownload={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  expect(screen.getByText(/50\s*%/)).toBeInTheDocument();
});
