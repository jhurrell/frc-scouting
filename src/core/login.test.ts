import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { demoEventBundle } from '../dev/demoEventBundle';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, hashPin, newReportId, ScoutingError } from './scoutingCore';
import { rosterEntry } from './testScouts';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: { stages: { Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }] } },
  pit: { groups: [] },
};

const bundle: EventBundle = {
  eventKey: '2026test',
  teams: [],
  schedule: [],
  roster: [rosterEntry('s01', 'Ada', '4821'), rosterEntry('s02', 'Grace', '0007')],
  coverage: [],
};

const match = { matchNumber: 3, station: 'Red 2', teamNumber: 578 } as const;

let dbName: string;
let db: ScoutingDb;
let gateway: FakeSheetGateway;

function makeCore(database = db) {
  return createScoutingCore({ db: database, gateway, seasonConfigs: [config] });
}

/** A device that has downloaded the Event Bundle and then lost its connection. */
async function offlineDevice() {
  const core = makeCore();
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  gateway.offline = true;
  return core;
}

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  gateway = new FakeSheetGateway(bundle);
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

describe('logging in', () => {
  it('succeeds offline with the right PIN', async () => {
    const core = await offlineDevice();

    expect(await core.login('s01', '4821')).toMatchObject({ scoutId: 's01', name: 'Ada' });
    expect((await core.currentScout())?.name).toBe('Ada');
  });

  it('fails with a wrong PIN, leaving nobody logged in', async () => {
    const core = await offlineDevice();

    await expect(core.login('s01', '1234')).rejects.toThrow('Wrong PIN');
    await expect(core.login('s01', '48211')).rejects.toThrow('Wrong PIN');
    expect(await core.currentScout()).toBeUndefined();
  });

  it('fails for someone not on the roster', async () => {
    const core = await offlineDevice();
    await expect(core.login('s99', '4821')).rejects.toThrow(ScoutingError);
  });

  it('needs an Event Bundle', async () => {
    await expect(makeCore().login('s01', '4821')).rejects.toThrow('No Event Bundle');
  });

  it('lasts until logout, across a reload', async () => {
    const core = await offlineDevice();
    await core.login('s01', '4821');
    db.close();

    const reloaded = makeCore(new ScoutingDb(dbName));
    expect((await reloaded.currentScout())?.scoutId).toBe('s01');

    await reloaded.logout();
    expect(await reloaded.currentScout()).toBeUndefined();
  });

  it('ends when an Admin takes the Scout off the roster', async () => {
    const core = await offlineDevice();
    await core.login('s01', '4821');
    gateway.offline = false;
    gateway.setEventBundle({ ...bundle, roster: bundle.roster.filter((s) => s.scoutId !== 's01') });

    await core.refreshEventBundle();

    expect(await core.currentScout()).toBeUndefined();
  });
});

describe('Reports and the logged-in Scout', () => {
  it('can only be started while a Scout is logged in', async () => {
    const core = await offlineDevice();
    await expect(core.startMatchReport(match)).rejects.toThrow('Log in first');
  });

  it('are stamped with the logged-in Scout', async () => {
    const core = await offlineDevice();
    await core.login('s02', '0007');

    expect(await core.startMatchReport(match)).toMatchObject({ scoutId: 's02' });
  });

  it('switching Scouts on a shared device needs the next Scout’s own PIN', async () => {
    const core = await offlineDevice();
    await core.login('s01', '4821');
    const ada = await core.startMatchReport(match);
    await core.logout();

    await expect(core.login('s02', '4821')).rejects.toThrow('Wrong PIN');
    await core.login('s02', '0007');
    const grace = await core.startMatchReport(match);

    expect(ada.scoutId).toBe('s01');
    expect(grace.scoutId).toBe('s02');
  });

  it('lists only the logged-in Scout’s Reports', async () => {
    const core = await offlineDevice();
    await core.login('s01', '4821');
    const ada = await core.startMatchReport(match);
    await core.login('s02', '0007');
    const grace = await core.startMatchReport(match);

    expect((await core.listReports()).map((r) => r.report.id)).toEqual([grace.id]);
    await core.logout();
    expect(await core.listReports()).toEqual([]);
    await core.login('s01', '4821');
    expect((await core.listReports()).map((r) => r.report.id)).toEqual([ada.id]);
  });

  it('can only be changed or Voided by the Scout who made them', async () => {
    const core = await offlineDevice();
    await core.login('s01', '4821');
    const ada = await core.startMatchReport(match);
    await core.login('s02', '0007');

    await expect(core.adjustCounter(ada.id, 'tele_scored', 1)).rejects.toThrow('Only the Scout who made a Report');
    await expect(core.voidReport(ada.id)).rejects.toThrow('Only the Scout who made a Report');
    await expect(core.complete(ada.id)).rejects.toThrow('Only the Scout who made a Report');
  });

  it('are all Uploaded, whoever is logged in', async () => {
    const core = await offlineDevice();
    await core.login('s01', '4821');
    await core.complete((await core.startMatchReport(match)).id);
    await core.login('s02', '0007');
    await core.complete((await core.startMatchReport(match)).id);
    await core.logout();
    gateway.offline = false;

    expect(await core.uploadPending()).toMatchObject({ stored: 2 });
    expect([...gateway.uploaded.values()].map((r) => r.scoutId).sort()).toEqual(['s01', 's02']);
  });
});

describe('on a page that is not a secure context', () => {
  // A phone testing against the dev server over the local network gets plain HTTP. Browsers then leave out
  // crypto.subtle and crypto.randomUUID, and keep only crypto.getRandomValues.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in and starts a Report', async () => {
    const core = await offlineDevice();
    const realCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });

    await core.login('s01', '4821');
    await expect(core.login('s01', '1111')).rejects.toThrow('Wrong PIN');
    expect((await core.startMatchReport(match)).id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('Report IDs', () => {
  it('are random version 4 UUIDs', () => {
    const ids = Array.from({ length: 100 }, newReportId);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(100);
  });
});

describe('the dev demo bundle', () => {
  it('has a demo Scout who logs in with PIN 0000', async () => {
    const [demo] = demoEventBundle.roster;
    expect(hashPin(demo.salt, '0000')).toBe(demo.pinHash);
  });
});
