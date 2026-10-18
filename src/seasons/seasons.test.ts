import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';
import { validateSeasonConfigs } from '../core/seasonConfig';
import { seasonConfigs } from '.';

/**
 * A fingerprint of every shipped version. Versions are appended, never edited in place: Reports already made with a
 * version were answered against exactly those questions. To change the questions, add a new version (see
 * docs/season-config.md), then add its fingerprint here. A new season starts this list again.
 */
const FINGERPRINTS: Record<number, string> = {
  1: 'e8dfd8de772faa8f',
  2: 'd13a61869112ffdd',
  3: '2cb4418d8f21f66a',
};

function fingerprint(config: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(config)))).slice(0, 16);
}

it('ships Season Config versions that pass validation together', () => {
  expect(() => validateSeasonConfigs(seasonConfigs)).not.toThrow();
});

it('never edits a shipped version in place', () => {
  const shipped = Object.fromEntries((seasonConfigs as { version: number }[]).map((c) => [c.version, fingerprint(c)]));
  for (const [version, actual] of Object.entries(shipped)) {
    const recorded = FINGERPRINTS[Number(version)];
    expect(
      recorded,
      recorded === undefined
        ? `Version ${version} is new. Add  ${version}: '${actual}',  to FINGERPRINTS in this file.`
        : `Version ${version} has changed since it shipped. Put it back and add a new version instead (see docs/season-config.md).`,
    ).toBe(actual);
  }
  expect(Object.keys(shipped), 'A shipped version was removed. The app must ship every version of the season.').toEqual(
    expect.arrayContaining(Object.keys(FINGERPRINTS)),
  );
});
