// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Kpi } from '@renderer/components/dashboard/Kpi';

afterEach(() => {
  cleanup();
});

describe('Kpi', () => {
  it('renders label, value and sub', () => {
    render(<Kpi label="Solde net" value="12 847" sub=",32 €" ctx="vs. avril" />);
    expect(screen.getByText('Solde net')).toBeInTheDocument();
    expect(screen.getByText(',32 €')).toBeInTheDocument();
  });

  it('applies sage class for an up delta', () => {
    render(<Kpi label="x" value="1" ctx="c" delta="+ 4,2 %" deltaDir="up" />);
    expect(screen.getByText('+ 4,2 %').className).toContain('text-sage');
  });

  it('applies coral class for a down delta', () => {
    render(<Kpi label="x" value="1" ctx="c" delta="+ 8,1 %" deltaDir="down" />);
    expect(screen.getByText('+ 8,1 %').className).toContain('text-coral');
  });
});
