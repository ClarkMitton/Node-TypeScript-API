// pdf-parse ships no types, and we import the inner module directly to avoid its
// index.js debug block. Minimal declaration for what we use.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    info?: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
