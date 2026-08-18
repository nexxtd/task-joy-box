import fs from 'fs';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
// Deep import skips pdf-parse's index.js self-test, which runs when the module
// is bundled (module.parent is undefined there) and crashes on a missing test file.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MAX_EXTRACT_CHARS = 300_000;

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
      const result = await pdfParse(fs.readFileSync(filePath));
      content = textToParagraphHtml(result.text);
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