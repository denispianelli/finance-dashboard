// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Sidebar } from '@renderer/components/Sidebar';
import { KpiGrid, Row2 } from '@renderer/components/dashboard/layout';

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

describe('Sidebar responsive collapse', () => {
  it('renders full labels at xl and above', () => {
    setViewport(1280);
    render(
      <MemoryRouter>
        <Sidebar onImport={() => undefined} netWorth={0} monthDelta={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Tableau de bord')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
    const aside = screen.getByRole('complementary');
    expect(aside.dataset.collapsed).toBe('false');
  });

  it('collapses to an icon-only rail below xl', () => {
    setViewport(1024);
    render(
      <MemoryRouter>
        <Sidebar onImport={() => undefined} netWorth={0} monthDelta={0} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Tableau de bord')).not.toBeInTheDocument();
    const aside = screen.getByRole('complementary');
    expect(aside.dataset.collapsed).toBe('true');
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument();
  });
});

describe('KpiGrid responsive class composition', () => {
  it('declares 2 / 4 column breakpoints in source order', () => {
    const { container } = render(
      <KpiGrid>
        <div>a</div>
      </KpiGrid>,
    );
    const grid = container.firstElementChild;
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('xl:grid-cols-4');
  });
});

describe('Row2 responsive class composition', () => {
  it('stacks below xl and uses the 1.6fr/1fr split at xl', () => {
    const { container } = render(
      <Row2>
        <div>a</div>
        <div>b</div>
      </Row2>,
    );
    const grid = container.firstElementChild;
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('xl:grid-cols-[1.6fr_1fr]');
  });
});
