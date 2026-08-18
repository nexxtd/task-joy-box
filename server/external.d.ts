declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: unknown[];
  }
  interface MammothOptions {
    path?: string;
    buffer?: Buffer;
    [key: string]: unknown;
  }
  export function convertToHtml(options: MammothOptions): Promise<MammothResult>;
  export function extractRawText(options: MammothOptions): Promise<MammothResult>;
}

declare module 'word-extractor' {
  class WordDocument {
    getBody(): string;
    getHeaders(): string[];
    getFooters(): string[];
  }
  class WordExtractor {
    constructor();
    extract(source: string | Buffer): Promise<WordDocument>;
  }
  export default WordExtractor;
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}