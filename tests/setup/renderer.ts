import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

// jsdom lacks ResizeObserver, which @tanstack/react-virtual observes. A no-op stub is enough;
// per-test layout sizes are provided by the virtualized-list tests themselves.
class ResizeObserverStub implements ResizeObserver {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  observe(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  unobserve(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;
