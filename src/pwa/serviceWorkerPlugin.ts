import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export const SERVICE_WORKER_FILE = 'sw.js';

export interface BuiltFile {
  /** The path relative to the build folder, with forward slashes, such as `assets/index-abc123.js`. */
  path: string;
  content: Uint8Array;
}

/**
 * The service worker for one build: the template with every built file to cache and a version that changes whenever
 * any file does. A new version is what tells the browser that the app has been updated.
 */
export function serviceWorkerSource(template: string, files: BuiltFile[]): string {
  const cached = files.filter((f) => f.path !== SERVICE_WORKER_FILE).sort((a, b) => (a.path < b.path ? -1 : 1));
  const hash = createHash('sha256');
  for (const file of cached) hash.update(file.path).update('\0').update(file.content).update('\0');
  const version = hash.digest('hex').slice(0, 12);
  return template.replace('__VERSION__', version).replace('self.__PRECACHE__', JSON.stringify(cached.map((f) => f.path)));
}

function builtFiles(dir: string): BuiltFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: relative(dir, full).split(sep).join('/'), content: readFileSync(full) };
    });
}

/** Writes sw.js into the build folder after everything else, including the files from public/, has been written. */
export function serviceWorkerPlugin(templatePath: string): Plugin {
  return {
    name: 'scouting-service-worker',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir!;
      writeFileSync(join(dir, SERVICE_WORKER_FILE), serviceWorkerSource(readFileSync(templatePath, 'utf8'), builtFiles(dir)));
    },
  };
}
