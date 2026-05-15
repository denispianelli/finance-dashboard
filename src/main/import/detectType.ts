import type { ImportFileType } from '@shared/types/ipc';

export function detectType(content: Buffer, filename: string): ImportFileType | null {
  if (content.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';

  const head = content.subarray(0, 1024).toString('latin1');
  if (head.includes('OFXHEADER') || /<OFX>/i.test(head)) return 'ofx';

  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' && isProbablyText(content)) return 'csv';
  if (ext === 'ofx' && isProbablyText(content)) return 'ofx';

  return null;
}

function isProbablyText(content: Buffer): boolean {
  const sample = content.subarray(0, 512);
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}
