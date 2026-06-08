// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ModelSettingsSection } from '../../../src/renderer/components/model/ModelSettingsSection';

afterEach(() => {
  cleanup();
});

const QWEN = { id: 'qwen2.5-7b', label: 'Qwen2.5 7B', sizeBytes: 4683074240 };
const LLAMA = { id: 'llama-3.2-3b', label: 'Llama 3.2 3B', sizeBytes: 2019377696 };

describe('ModelSettingsSection', () => {
  it('ready: shows the active model label + real size', () => {
    render(
      <ModelSettingsSection
        status={{ state: 'ready', active: QWEN }}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(/Qwen2\.5 7B/)).toBeTruthy();
    // 4 683 074 240 bytes → 4.683… Go → localised as "4,7 Go"
    expect(screen.getByText(/4,7/)).toBeTruthy();
  });

  it('ready + upgrade: renders a non-blocking upgrade banner that triggers onDownload', () => {
    const onDownload = vi.fn();
    render(
      <ModelSettingsSection
        status={{ state: 'ready', active: LLAMA, upgrade: QWEN }}
        onDownload={onDownload}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(/meilleur modèle/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Qwen2\.5 7B|Télécharger|Installer/i }));
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('absent: download button copy comes from target', () => {
    render(
      <ModelSettingsSection
        status={{ state: 'absent', target: QWEN }}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Qwen2\.5 7B|4,4/ })).toBeTruthy();
  });
});
