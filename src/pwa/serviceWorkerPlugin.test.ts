import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serviceWorkerSource, type BuiltFile } from './serviceWorkerPlugin';

const template = readFileSync(new URL('./serviceWorker.js', import.meta.url), 'utf8');
const text = (s: string) => new TextEncoder().encode(s);

const build: BuiltFile[] = [
  { path: 'index.html', content: text('<html>v1</html>') },
  { path: 'assets/index-abc.js', content: text('app()') },
  { path: 'icons/icon-192.png', content: text('png') },
  { path: 'sw.js', content: text('the previous service worker') },
];

function precached(source: string): string[] {
  return JSON.parse(/const FILES = (\[.*\]);/.exec(source)![1]);
}

function version(source: string): string {
  return /const VERSION = '(\w+)';/.exec(source)![1];
}

describe('the built service worker', () => {
  it('caches every built file except itself', () => {
    expect(precached(serviceWorkerSource(template, build))).toEqual(['assets/index-abc.js', 'icons/icon-192.png', 'index.html']);
  });

  it('gets a new version when any file changes, so browsers see the update', () => {
    const before = version(serviceWorkerSource(template, build));
    const changedPage = build.map((f) => (f.path === 'index.html' ? { ...f, content: text('<html>v2</html>') } : f));

    expect(version(serviceWorkerSource(template, changedPage))).not.toBe(before);
    expect(version(serviceWorkerSource(template, [...build].reverse()))).toBe(before);
  });
});
