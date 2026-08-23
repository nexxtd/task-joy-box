import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');
const outFile = path.resolve(__dirname, '../src/i18n/ui-strings.json');

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'i18n' || entry.name === 'ui') continue;
      walk(full);
    } else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
};
walk(srcDir);

const looksUi = (raw) => {
  let s = String(raw).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
  if (s.length < 2 || s.length > 180) return false;
  if (!/[A-Za-z\u00C0-\u024F]/.test(s)) return false;
  if (/[\n\r;{}<>`\\]/.test(s)) return false;
  if (/^(https?:|mailto:|tel:|#|\/)/.test(s)) return false;
  if (/^(bg-|text-|border-|ring-|w-|h-|p-|m-|px-|py-|gap-|col-|row-|sm:|md:|lg:|xl:|hover:|focus:|dark:)/.test(s)) return false;
  if (/^[a-z]+[A-Z]/.test(s) && !s.includes(' ')) return false;
  if (/^(flex|grid|hidden|block|inline|absolute|relative|fixed|sticky)$/.test(s)) return false;
  if (s.includes('${')) return false;
  if (/^\w+\.\w+/.test(s) && !s.includes(' ')) return false;
  if (/^(button-|input-|label-|dialog-|toast-)/.test(s)) return false;
  return true;
};

const phrases = new Set();
const add = (s) => { if (looksUi(s)) phrases.add(s.trim()); };

const attrRe = /\b(?:placeholder|title|alt|aria-label|aria-description)\s*=\s*(['"])([^'"\n]+)\1/g;
const jsxTextRe = />([A-Za-z][^<>{}=\n]{0,160})</g;
const labelPropRe = /\b(?:label|description|desc|title|emptyText|placeholder|helperText|message|subtitle)\s*:\s*(['"])([^'"\n]+)\1/g;
const tCallRe = /\bt\(\s*(['"])([^'"\n]+)\1/g;

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  for (const re of [attrRe, jsxTextRe, labelPropRe, tCallRe]) {
    re.lastIndex = 0;
    for (const m of code.matchAll(re)) add(m[2] ?? m[1]);
  }
}

const list = [...phrases].sort((a, b) => a.localeCompare(b));
fs.writeFileSync(outFile, JSON.stringify({ count: list.length, phrases: list }, null, 2));
console.log(`Extracted ${list.length} UI strings from ${files.length} files`);
