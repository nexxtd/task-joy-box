import fs from 'fs';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import { PDFParse } from 'pdf-parse';

const MAX_EXTRACT_CHARS = 300_000;
const MAX_PDF_PAGES = 200;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToParagraphHtml(text: string): string {
  const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
  return lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n');
}

// Best-effort: never throws and never fails the upload — a document we cannot
// read simply opens with an empty editor.
export async function extractDocumentText(filePath: string, mimeType: string): Promise<string> {
  try {
    let content = '';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.convertToHtml({ path: filePath });
      content = result.value;
    } else if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: fs.readFileSync(filePath) });
      try {
        const result = await parser.getText({ first: MAX_PDF_PAGES });
        content = textToParagraphHtml(result.text);
      } finally {
        await parser.destroy();
      }
    } else if (mimeType === 'application/msword') {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(filePath);
      content = textToParagraphHtml(doc.getBody());
    }
    return content ? content.slice(0, MAX_EXTRACT_CHARS) : '';
  } catch (error) {
    console.error('Document text extraction failed:', error);
    return '';
  }
}