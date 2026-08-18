import fs from 'fs';
import { createRequire } from 'module';

const localRequire = createRequire(__filename);

const MAX_EXTRACT_CHARS = 300_000;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToParagraphHtml(text: string): string {
  const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
  return lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n');
}

// Best-effort: never throws and never fails the upload. The heavy extraction
// libraries are loaded lazily so that even a module-load failure degrades to
// an empty editor instead of crashing the whole API.
export async function extractDocumentText(filePath: string, mimeType: string): Promise<string> {
  try {
    let content = '';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth') as {
        convertToHtml(options: { path: string }): Promise<{ value: string }>;
      };
      const result = await mammoth.convertToHtml({ path: filePath });
      content = result.value;
    } else if (mimeType === 'application/pdf') {
      const pdfParse = localRequire('pdf-parse') as (data: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(fs.readFileSync(filePath));
      content = textToParagraphHtml(result.text);
    } else if (mimeType === 'application/msword') {
      const WordExtractor = (require('word-extractor') as {
        default?: new () => { extract(source: string): Promise<{ getBody(): string }> };
      }).default ?? require('word-extractor') as unknown as new () => { extract(source: string): Promise<{ getBody(): string }> };
      const doc = await new WordExtractor().extract(filePath);
      content = textToParagraphHtml(doc.getBody());
    }
    return content ? content.slice(0, MAX_EXTRACT_CHARS) : '';
  } catch (error) {
    console.error('Document text extraction failed:', error);
    return '';
  }
}