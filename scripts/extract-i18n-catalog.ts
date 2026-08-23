import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');
const outCatalog = path.resolve(__dirname, '../src/i18n/catalog.json');

const files: string[] = [];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
};
walk(srcDir);

// Collect phrase keys used via t('...') / t("...") / T.<snake_key>
const tCallRe = /\b(?:t|T)\(\s*['"`]([^'"`]+)['"`]\s*(?:,|\}\)|\))/g;
const tPropRe = /(^|[^.\w])T\.([A-Za-z_][A-Za-z0-9_]*)/g;

const phrases = new Set<string>();
const legacyKeys = new Set<string>();

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  for (const m of code.matchAll(tCallRe)) {
    const phrase = m[1].trim();
    if (phrase) phrases.add(phrase);
  }
  for (const m of code.matchAll(tPropRe)) {
    if (m[2]) legacyKeys.add(m[2]);
  }
}

const catalog = {
  generatedAt: new Date().toISOString(),
  legacyKeys: [...legacyKeys].sort(),
  phrases: [...phrases].sort(),
};

fs.writeFileSync(outCatalog, JSON.stringify(catalog, null, 2));
console.log(`Extracted ${catalog.phrases.length} phrase keys and ${catalog.legacyKeys.length} legacy keys across ${files.length} files.`);
console.log('Catalog written to', outCatalog);