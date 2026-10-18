import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, ScoutingError } from './scoutingCore';
import { rosterEntry } from './testScouts';

const v1: SeasonConfig = {
  season: 'test',
  version: 1,
  match: {
    stages: {
      Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }],
      'Post-Match': [
        { code: 'defense', label: 'Played defense', type: 'yes-no', required: true },
        { code: 'notes', label: 'Notes', type: 'text' },
      ],
    },
  },
  pit: { groups: [] },
};

/** Mid-season: a renamed label, a new counter, a new required question, and notes dropped. */
const v2: SeasonConfig = {
  season: 'test',
  version: 2,
  match: {
    stages: {
      Teleop: [
        { code: 'tele_scored', label: 'Pieces scored', type: 'counter' },
        { code: 'tele_missed', label: 'Pieces missed', type: 'counter' },
      ],
      'Post-Match': [
        { code: 'defense', label: 'Played defense', type: 'yes-no', required: true },
        { code: 'driver_rating', label: 'Driver', type: 'single-choice', options: ['Poor', 'OK', 'Great'], required: true },
      ],
    },
  },
  pit: { groups: [] },
};

const ADA = { scoutId: 's01', name: 'Ada', pin: '4821' };
const GRACE = { scoutId: 's02', name: 'Grace', pin: '0007' };
const bundle: EventBundle = {
  eventKey: '2026test',
  teams: [578],
  schedule: [{ matchNumber: 4, stations: { 'Blue 1': 578 } }],
  roster: [ADA, GRACE].map((s) => rosterEntry(s.scoutId, s.name, s.pin)),
  coverage: [],
};

const dbs: { name: string; db: ScoutingDb }[] = [];
let gateway: FakeSheetGateway;
let clock: number;

beforeEach(() => {
  gateway = new FakeSheetGateway(bundle);
  clock = Date.parse('2026-10-16T12:00:00Z');
});

afterEach(async () => {
  for (const { name, db } of dbs.splice(0)) {
    db.close();
    await ScoutingDb.delete(name);
  }
});

function newDb(): ScoutingDb {
  const name = `test-${crypto.randomUUID()}`;
  const db = new ScoutingDb(name);
  dbs.push({ name, db });
  return db;
}

/** The app as shipped with these Season Config versions, running on a device's database. */
function app(db: ScoutingDb, seasonConfigs: SeasonConfig[]) {
  return createScoutingCore({ db, gateway, seasonConfigs, now: () => new Date((clock += 1000)) });
}

/** A device set up and logged in, running the app with these versions. */
async function device(seasonConfigs: SeasonConfig[], scout = ADA) {
  const db = newDb();
  const core = app(db, seasonConfigs);
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(scout.scoutId, scout.pin);
  return { db, core };
}

describe('Season Config versions', () => {
  it('start new Reports on the newest version, whatever order the versions are listed in', async () => {
    const { core } = await device([v2, v1]);

    expect(core.latestConfig.version).toBe(2);
    expect((await core.startMatchReport({ matchNumber: 4, station: 'Blue 1' })).configVersion).toBe(2);
  });

  it('let a Draft keep the version it was started with when the app updates mid-match', async () => {
    const { db, core: before } = await device([v1]);
    const { id } = await before.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await before.answer(id, 'notes', 'fast');

    const after = app(db, [v1, v2]); // The app reloads with version 2.

    expect((await after.getReport(id))?.configVersion).toBe(1);
    await after.answer(id, 'notes', 'fast, good intake');
    await expect(after.answer(id, 'tele_missed', 1)).rejects.toThrow('Unknown question "tele_missed"');
    expect(await after.unansweredRequired(id)).toEqual(['defense']);
    await after.answer(id, 'defense', false);
    await after.complete(id);
    expect(await after.getReport(id)).toMatchObject({ status: 'complete', configVersion: 1 });

    const fresh = await after.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    expect(fresh.configVersion).toBe(2);
    expect(await after.unansweredRequired(fresh.id)).toEqual(['defense', 'driver_rating']);
  });

  it('keep a Complete Report on its version when it is edited after an update', async () => {
    const { db, core: before } = await device([v1]);
    const { id } = await before.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await before.answer(id, 'defense', true);
    await before.complete(id);

    const after = app(db, [v1, v2]);
    await after.adjustCounter(id, 'tele_scored', 1);

    expect(await after.getReport(id)).toMatchObject({ configVersion: 1, answers: { tele_scored: 1, defense: true } });
  });

  it('Upload each Report with the version it was answered with', async () => {
    const { db, core: before } = await device([v1]);
    const { id: old } = await before.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await before.answer(old, 'defense', true);
    await before.complete(old);

    const after = app(db, [v1, v2]);
    const { id: fresh } = await after.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await after.answer(fresh, 'defense', true);
    await after.answer(fresh, 'driver_rating', 'Great');
    await after.complete(fresh);
    await after.uploadPending();

    expect(gateway.uploaded.get(old)?.configVersion).toBe(1);
    expect(gateway.uploaded.get(fresh)?.configVersion).toBe(2);
  });

  it('let a Hub on the new version take in a Report from a phone that hasn’t updated', async () => {
    const { core: phone } = await device([v1], ADA);
    const { core: hub } = await device([v1, v2], GRACE);
    const { id } = await phone.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await phone.answer(id, 'defense', true);
    await phone.answer(id, 'notes', 'quick');
    await phone.complete(id);

    const { outcome, report } = await hub.acceptScan(await phone.qrTextFor(id));

    expect(outcome).toBe('added');
    expect(report).toMatchObject({ configVersion: 1, answers: { defense: true, notes: 'quick' } });
  });

  it('say which version is missing when the app doesn’t have a Report’s version', async () => {
    const { db, core: newer } = await device([v1, v2]);
    const { id } = await newer.startMatchReport({ matchNumber: 4, station: 'Blue 1' });

    const older = app(db, [v1]); // For example, a deployment rolled back.

    expect(older.hasSeasonConfig(2)).toBe(false);
    expect(() => older.seasonConfigFor(2)).toThrow(ScoutingError);
    await expect(older.answer(id, 'defense', true)).rejects.toThrow('Unknown Season Config version 2');
  });
});
