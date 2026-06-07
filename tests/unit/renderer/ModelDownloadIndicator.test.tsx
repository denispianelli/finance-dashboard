// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { ModelDownloadIndicator } from '@renderer/components/model/ModelDownloadIndicator';

afterEach(() => {
  cleanup();
});

it('renders nothing when ready', () => {
  const { container } = render(<ModelDownloadIndicator status={{ state: 'ready' }} />);
  expect(container).toBeEmptyDOMElement();
});

it('renders nothing when absent', () => {
  const { container } = render(<ModelDownloadIndicator status={{ state: 'absent' }} />);
  expect(container).toBeEmptyDOMElement();
});

it('shows percent while downloading', () => {
  render(
    <ModelDownloadIndicator
      status={{ state: 'downloading', receivedBytes: 890_000_000, totalBytes: 2_019_377_696 }}
    />,
  );
  expect(screen.getByText(/44\s*%/)).toBeInTheDocument();
});

it('offers Resume when paused and calls onResume', () => {
  const onResume = vi.fn();
  render(<ModelDownloadIndicator status={{ state: 'paused' }} onResume={onResume} />);
  fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
  expect(onResume).toHaveBeenCalledOnce();
});

it('offers Retry on error and calls onResume', () => {
  const onResume = vi.fn();
  render(
    <ModelDownloadIndicator status={{ state: 'error', error: 'network' }} onResume={onResume} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
  expect(onResume).toHaveBeenCalledOnce();
});
