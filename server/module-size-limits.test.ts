import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Dashboard and Insights widget definition minimums', () => {
  it('keeps every module definition minH >= 5 and minW >= 6 in Insights.tsx and Dashboard.tsx', () => {
    const rootDir = process.cwd();
    for (const relPath of ['src/pages/Insights.tsx', 'src/pages/Dashboard.tsx']) {
      const source = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
      const minHMatches = [...source.matchAll(/\bminH\s*:\s*(\d+)/g)];
      const minWMatches = [...source.matchAll(/\bminW\s*:\s*(\d+)/g)];

      expect(minHMatches.length, `${relPath} should declare custom module minH bounds`).toBeGreaterThan(0);
      for (const match of minHMatches) {
        expect(Number(match[1]), `${relPath} had minH:${match[1]} below 5`).toBeGreaterThanOrEqual(5);
      }
      for (const match of minWMatches) {
        expect(Number(match[1]), `${relPath} had minW:${match[1]} below 6`).toBeGreaterThanOrEqual(6);
      }
    }
  });
});

