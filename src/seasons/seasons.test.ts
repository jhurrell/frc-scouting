import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { decodeReport, encodeReport, MAX_QR_TEXT } from '../core/qrCodec';
import { formSections, validateSeasonConfigs } from '../core/seasonConfig';
import type { Answer, Question, Report, SeasonConfig } from '../shared/contract';
import { seasonConfigs } from '.';

/**
 * A fingerprint of every shipped version. Versions are appended, never edited in place: Reports already made with a
 * version were answered against exactly those questions. To change the questions, add a new version (see
 * docs/season-config.md), then add its fingerprint here. A new season starts this list again.
 */
const FINGERPRINTS: Record<number, string> = {
  1: 'f40701b3f818fd90',
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

/** How much a Scout can write and still hand a Report to a Hub as one QR code, shared between its text answers. */
const TEXT_ROOM = 300;

/** Ordinary notes: words, spaces and punctuation, which take more room in a QR code than plain letters. */
const NOTES =
  "Fast swerve, scored about 12 fuel in teleop and missed 3. Got stuck on the bump once! Driver's good; didn't " +
  'play defense. Climbed at the end (slow). Would pick for the 2nd round? Intake jams on fuel near the wall. ';

function notes(length: number): string {
  return NOTES.repeat(Math.ceil(length / NOTES.length)).slice(0, length);
}

/** Every question answered with its longest answer, and the text answers sharing TEXT_ROOM characters of notes. */
function longestAnswers(questions: Question[]): Record<string, Answer> {
  const texts = questions.filter((q) => q.type === 'text');
  const answers: Record<string, Answer> = {};
  for (const q of questions) {
    if (q.type === 'yes-no') answers[q.code] = true;
    else if (q.type === 'single-choice') answers[q.code] = q.options!.at(-1)!;
    else if (q.type === 'multiple-choice') answers[q.code] = q.options!;
    // With no max, a count past 999 or a number past 9999 isn't realistic.
    else if (q.type === 'counter') answers[q.code] = q.max ?? 999;
    else if (q.type === 'number') answers[q.code] = q.max ?? 9999;
    else answers[q.code] = notes(Math.floor(TEXT_ROOM / texts.length));
  }
  return answers;
}

function fullReport(config: SeasonConfig, kind: Report['kind']): Report {
  const base = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    eventKey: '2026nyroc',
    scoutId: 'scout01',
    configVersion: config.version,
    status: 'complete' as const,
    voided: true,
    createdAt: '2026-10-16T12:00:00.000Z',
    updatedAt: '2026-10-16T12:03:27.481Z',
    answers: longestAnswers(formSections(config, kind).flatMap((s) => s.questions)),
    teamNumber: 10578,
  };
  return kind === 'match' ? { ...base, kind, matchNumber: 128, station: 'Blue 3' } : { ...base, kind };
}

describe.each(seasonConfigs as SeasonConfig[])('Season Config version $version', (config) => {
  it.each(['match', 'pit'] as const)(`fits a full %s Report with ${TEXT_ROOM} characters of notes in one QR code`, (kind) => {
    if (formSections(config, kind).length === 0) return;
    const report = fullReport(config, kind);

    let text = '';
    expect(() => (text = encodeReport(report, config)), 'Too many questions to hand a Report to a Hub. See docs/season-config.md.').not.toThrow();

    expect(text.length).toBeLessThanOrEqual(MAX_QR_TEXT);
    expect(decodeReport(text, config)).toEqual(report);
  });
});
