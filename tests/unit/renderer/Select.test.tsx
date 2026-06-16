// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '@renderer/components/ui/select';

const OPTIONS = [
  { value: 'all', label: 'Toutes catégories' },
  { value: 'a', label: 'Alimentation' },
  { value: 'b', label: 'Logement' },
];

afterEach(() => {
  cleanup();
});

describe('Select (glass dropdown)', () => {
  it('shows the selected option label on the trigger', () => {
    render(
      <Select ariaLabel="Catégorie" value="b" onValueChange={() => undefined} options={OPTIONS} />,
    );
    expect(screen.getByLabelText('Catégorie')).toHaveTextContent('Logement');
  });

  it('opens on click and lists the options', async () => {
    const user = userEvent.setup();
    render(
      <Select
        ariaLabel="Catégorie"
        value="all"
        onValueChange={() => undefined}
        options={OPTIONS}
      />,
    );
    await user.click(screen.getByLabelText('Catégorie'));
    expect(screen.getByRole('option', { name: 'Alimentation' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Logement' })).toBeInTheDocument();
  });

  it('calls onValueChange with the chosen value and closes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(v: string) => void>();
    render(
      <Select ariaLabel="Catégorie" value="all" onValueChange={onValueChange} options={OPTIONS} />,
    );
    await user.click(screen.getByLabelText('Catégorie'));
    await user.click(screen.getByRole('option', { name: 'Alimentation' }));
    expect(onValueChange).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('option', { name: 'Alimentation' })).not.toBeInTheDocument();
  });
});
