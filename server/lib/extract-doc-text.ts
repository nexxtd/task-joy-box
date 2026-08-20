import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
// Deep import skips pdf-parse's index.js self-test, which runs when the module
// is bundled (module.parent is undefined there) and crashes on a missing test file.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MAX_EXTRACT_CHARS = 500_000;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToParagraphHtml(text: string): string {
  const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
  return lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n');
}

/**
 * Extract target file from ZIP buffer without external dependencies.
 * Used for reading content.xml from OpenDocument (.odt) files.
 */
function unzipEntryFromBuffer(zipBuffer: Buffer, targetFileName: string): string | null {
  try {
    let offset = 0;
    while (offset < zipBuffer.length - 30) {
      if (zipBuffer.readUInt32LE(offset) !== 0x04034b50) {
        offset++;
        continue;
      }
      const compMethod = zipBuffer.readUInt16LE(offset + 8);
      const compSize = zipBuffer.readUInt32LE(offset + 18);
      const fileNameLen = zipBuffer.readUInt16LE(offset + 26);
      const extraLen = zipBuffer.readUInt16LE(offset + 28);
      const fileName = zipBuffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
      const dataOffset = offset + 30 + fileNameLen + extraLen;

      if (fileName === targetFileName) {
        const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compSize);
        let decompressed: Buffer;
        if (compMethod === 8) {
          decompressed = zlib.inflateRawSync(compressedData);
        } else if (compMethod === 0) {
          decompressed = compressedData;
        } else {
          return null;
        }
        return decompressed.toString('utf8');
      }

      offset = dataOffset + compSize;
    }
  } catch (err) {
    console.error('ZIP extraction error:', err);
  }
  return null;
}

/**
 * Convert OpenDocument Text (content.xml) to clean HTML.
 */
function odtXmlToHtml(xmlContent: string): string {
  let html = xmlContent;
  // Convert headings
  html = html.replace(/<text:h[^>]*outline-level="1"[^>]*>(.*?)<\/text:h>/gi, '<h1>$1</h1>');
  html = html.replace(/<text:h[^>]*outline-level="2"[^>]*>(.*?)<\/text:h>/gi, '<h2>$1</h2>');
  html = html.replace(/<text:h[^>]*outline-level="3"[^>]*>(.*?)<\/text:h>/gi, '<h3>$1</h3>');
  html = html.replace(/<text:h[^>]*>(.*?)<\/text:h>/gi, '<h4>$1</h4>');

  // Convert paragraphs & spans
  html = html.replace(/<text:p[^>]*>(.*?)<\/text:p>/gi, '<p>$1</p>');
  html = html.replace(/<text:span[^>]*>(.*?)<\/text:span>/gi, '$1');

  // Strip remaining XML tags
  html = html.replace(/<[^>]+>/g, (match) => {
    if (/^<\/?(h[1-6]|p|ul|ol|li|b|i|u|strong|em|br|blockquote)>/i.test(match)) {
      return match;
    }
    return '';
  });

  return html.trim();
}

/**
 * Parse RTF (Rich Text Format) string into basic HTML paragraphs and formatting.
 */
function rtfToHtml(rtfText: string): string {
  let text = rtfText;
  // Replace RTF line breaks & paragraphs
  text = text.replace(/\\par\b\s?/gi, '\n');
  text = text.replace(/\\b\s+(.*?)\\b0\b/gi, '<b>$1</b>');
  text = text.replace(/\\i\s+(.*?)\\i0\b/gi, '<i>$1</i>');
  text = text.replace(/\\ul\s+(.*?)\\ul0\b/gi, '<u>$1</u>');

  // Remove RTF control words and braces
  text = text.replace(/\\[a-z0-9\-]+\s?/gi, '');
  text = text.replace(/[{}]/g, '');

  return textToParagraphHtml(text);
}

/**
 * Convert Markdown text to structured HTML.
 */
function markdownToHtml(mdText: string): string {
  const lines = mdText.split(/\r?\n/);
  const result: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# ')) {
      result.push(`<h1>${escapeHtml(line.slice(2).trim())}</h1>`);
    } else if (line.startsWith('## ')) {
      result.push(`<h2>${escapeHtml(line.slice(3).trim())}</h2>`);
    } else if (line.startsWith('### ')) {
      result.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
    } else {
      let parsed = escapeHtml(line);
      parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      parsed = parsed.replace(/\*(.*?)\*/g, '<i>$1</i>');
      result.push(`<p>${parsed}</p>`);
    }
  }

  return result.join('\n');
}

/**
 * Best-effort document content extractor: parses text, formatting, headings,
 * tables, and images from Word, PDF, ODT, RTF, HTML, TXT, and Markdown files.
 */
export async function extractDocumentText(filePath: string, mimeType: string, originalFileName?: string): Promise<string> {
  try {
    const ext = path.extname(originalFileName || filePath).toLowerCase();
    const mime = (mimeType || '').toLowerCase();
    let content = '';

    // 1. Microsoft Word (.docx)
    if (ext === '.docx' || mime.includes('wordprocessingml') || (mime.includes('zip') && ext === '.docx')) {
      const convertImage = (mammoth as any).images?.inline
        ? (mammoth as any).images.inline((element: any) => {
            return element.read('base64').then((imageBuffer: string) => ({
              src: `data:${element.contentType};base64,${imageBuffer}`,
            }));
          })
        : undefined;

      const result = await mammoth.convertToHtml(
        { path: filePath, convertImage }
      );
      content = result.value;
    }
    // 2. Legacy Word (.doc)
    else if (ext === '.doc' || mime === 'application/msword') {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(filePath);
      content = textToParagraphHtml(doc.getBody());
    }
    // 3. OpenDocument Text (.odt)
    else if (ext === '.odt' || mime.includes('opendocument.text')) {
      const buffer = fs.readFileSync(filePath);
      const xmlContent = unzipEntryFromBuffer(buffer, 'content.xml');
      if (xmlContent) {
        content = odtXmlToHtml(xmlContent);
      }
    }
    // 4. Rich Text Format (.rtf)
    else if (ext === '.rtf' || mime.includes('rtf')) {
      const rawRtf = fs.readFileSync(filePath, 'utf-8');
      content = rtfToHtml(rawRtf);
    }
    // 5. HTML (.html, .htm)
    else if (ext === '.html' || ext === '.htm' || mime.includes('html')) {
      const rawHtml = fs.readFileSync(filePath, 'utf-8');
      content = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    }
    // 6. Markdown (.md)
    else if (ext === '.md' || mime.includes('markdown')) {
      const rawMd = fs.readFileSync(filePath, 'utf-8');
      content = markdownToHtml(rawMd);
    }
    // 7. Plain Text (.txt)
    else if (ext === '.txt' || mime.includes('text/plain')) {
      const rawTxt = fs.readFileSync(filePath, 'utf-8');
      content = textToParagraphHtml(rawTxt);
    }
    // 8. PDF (.pdf)
    else if (ext === '.pdf' || mime.includes('pdf')) {
      const result = await pdfParse(fs.readFileSync(filePath));
      content = textToParagraphHtml(result.text);
    }
    // Fallback: try mammoth if it's zip/docx like, or fallback to text
    else {
      try {
        const rawTxt = fs.readFileSync(filePath, 'utf-8');
        content = textToParagraphHtml(rawTxt);
      } catch {
        content = '';
      }
    }

    return content ? content.slice(0, MAX_EXTRACT_CHARS) : '';
  } catch (error) {
    console.error('Document text extraction failed:', error);
    return '';
  }
}