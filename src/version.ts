import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getWardenVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(currentDir, '../package.json'),
      resolve(currentDir, '../../package.json'),
      resolve(process.cwd(), 'package.json'),
    ];

    for (const cand of candidates) {
      if (existsSync(cand)) {
        const pkg = JSON.parse(readFileSync(cand, 'utf8'));
        if (pkg.name === 'adr-warden' && pkg.version) {
          return pkg.version;
        }
      }
    }
  } catch {
    // Fallback if filesystem read is not permitted
  }

  return '1.0.4';
}
