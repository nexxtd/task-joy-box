import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../src/i18n');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'ui-strings.json'), 'utf8'));
const extra = JSON.parse(fs.readFileSync(path.join(root, 'extra-templates.json'), 'utf8'));
const phrases = [...new Set([...ui.phrases, ...extra])].sort((a, b) => a.localeCompare(b));
fs.writeFileSync(path.join(root, 'source-phrases.json'), JSON.stringify(phrases, null, 2));

const dir = path.join(root, 'phrases');
fs.mkdirSync(dir, { recursive: true });
const langs = ['es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru', 'nl', 'tr', 'vi', 'he'];
for (const lang of langs) {
  const dest = path.join(dir, `${lang}.json`);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, '{}');
}
console.log(`Source phrases: ${phrases.length}. Stub locale files ready in src/i18n/phrases`);
