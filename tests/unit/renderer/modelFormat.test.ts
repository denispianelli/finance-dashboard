import { describe, it, expect } from 'vitest';
import { modelPercent, formatModelSize } from '@renderer/lib/modelFormat';

describe('modelPercent', () => {
  it('is 0 when total is missing or zero', () => {
    expect(modelPercent({})).toBe(0);
    expect(modelPercent({ receivedBytes: 5, totalBytes: 0 })).toBe(0);
  });
  it('rounds received/total to an integer percent', () => {
    expect(modelPercent({ receivedBytes: 1_009_688_848, totalBytes: 2_019_377_696 })).toBe(50);
    expect(modelPercent({ receivedBytes: 890_000_000, totalBytes: 2_019_377_696 })).toBe(44);
  });
});

describe('formatModelSize', () => {
  it('formats under 1 Go in Mo', () => {
    expect(formatModelSize(890_000_000)).toBe('890 Mo');
  });
  it('formats 1 Go and above in Go with one decimal', () => {
    expect(formatModelSize(1_900_000_000)).toBe('1,9 Go');
  });
});
