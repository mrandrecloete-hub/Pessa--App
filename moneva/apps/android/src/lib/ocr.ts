import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { rowsFromLines } from '@moneva/shared';

/** Most statements are a few pages. More than this is refused rather than left running for minutes. */
export const MAX_PDF_PAGES = 12;

/** Reads text from one image on the phone with Google ML Kit. Nothing is uploaded. */
export async function readImageRows(uri: string): Promise<string[][]> {
  const result = await recognizeText(uri);
  const lines = result.blocks.flatMap((b) => b.lines.map((l) => ({ text: l.text, frame: l.frame })));
  return rowsFromLines(lines);
}

/** Renders each PDF page to an image on the phone, then reads it. */
export async function readPdfRows(uri: string, onPage?: (done: number, total: number) => void): Promise<string[][]> {
  const pages = await PdfThumbnail.generateAllPages(uri, { quality: 90, maxWidth: 2000 });
  if (pages.length > MAX_PDF_PAGES) throw new Error(`This PDF has ${pages.length} pages. Scan up to ${MAX_PDF_PAGES} pages at a time.`);
  const rows: string[][] = [];
  for (let i = 0; i < pages.length; i++) {
    onPage?.(i, pages.length);
    rows.push(...(await readImageRows(pages[i]!.uri)));
  }
  return rows;
}
