// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Bento, Tile } from '@renderer/components/dashboard/Bento';

describe('Bento layout primitives', () => {
  afterEach(() => {
    cleanup();
  });

  it('Bento renders a 12-column grid containing its children', () => {
    render(
      <Bento>
        <div data-testid="child">x</div>
      </Bento>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('Tile applies the requested column span and renders children', () => {
    render(
      <Tile span={8} data-testid="tile">
        <span>inside</span>
      </Tile>,
    );
    const tile = screen.getByTestId('tile');
    expect(tile).toHaveTextContent('inside');
    expect(tile.style.gridColumn).toBe('span 8');
    expect(tile.className).toContain('tile');
  });

  it('Tile applies a row span when given', () => {
    render(
      <Tile span={4} rowSpan={2} data-testid="tile">
        x
      </Tile>,
    );
    expect(screen.getByTestId('tile').style.gridRow).toBe('span 2');
  });
});
