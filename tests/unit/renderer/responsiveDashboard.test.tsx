// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Sidebar } from '@renderer/components/Sidebar';

interface MatchMediaStub {
  matches: boolean;
  media: string;
  addEventListener: () => void;
  removeEventListener: () => void;
  addListener: () => void;
  removeListener: () => void;
  dispatchEvent: () => boolean;
  onchange: null;
}

function setViewport(minPx: number): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const match = /min-width:\s*(\d+)px/.exec(query);
    const target = match ? Number(match[1]) : 0;
    const stub: MatchMediaStub = {
      matches: minPx >= target,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
    return stub as MediaQueryList;
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  setViewport(1920);
});

describe('Sidebar collapsed rendering', () => {
  it('renders full labels when expanded', () => {
    render(
      <MemoryRouter>
        <Sidebar onImport={() => undefined} netWorth={0} monthDelta={0} collapsed={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Tableau de bord')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
    const aside = screen.getByRole('complementary');
    expect(aside.dataset.collapsed).toBe('false');
  });

  it('collapses to an icon-only rail (labels mounted but faded out for the slide)', () => {
    render(
      <MemoryRouter>
        <Sidebar onImport={() => undefined} netWorth={0} monthDelta={0} collapsed />
      </MemoryRouter>,
    );
    const aside = screen.getByRole('complementary');
    expect(aside.dataset.collapsed).toBe('true');
    // The link stays in the tree; its label is kept mounted (so it can slide/fade
    // rather than teleport) but rendered transparent, so the rail reads as icon-only.
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText('Tableau de bord').className).toContain('opacity-0');
  });
});
