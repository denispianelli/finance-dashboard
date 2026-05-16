export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface PdfPage {
  pageNumber: number;
  items: PdfTextItem[];
}

export interface PdfExtractResult {
  pages: PdfPage[];
  hasText: boolean;
}

export function computeHasText(pages: PdfPage[]): boolean {
  return pages.some((p) => p.items.some((item) => item.str.trim().length > 0));
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  // Dynamic import: pdfjs-dist is ESM-only; main process is compiled CJS
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    useSystemFonts: true,
    disableStream: true,
    disableAutoFetch: true,
  }).promise;

  const pages: PdfPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const items: PdfTextItem[] = content.items
      .filter(
        (item): item is typeof item & { str: string; transform: number[]; width: number } =>
          'str' in item,
      )
      .map((item) => ({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        width: item.width,
      }));

    pages.push({ pageNumber: i, items });
  }

  return { pages, hasText: computeHasText(pages) };
}
