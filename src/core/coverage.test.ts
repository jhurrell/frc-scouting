import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, SeasonConfig, Station } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, type Coverage, type Network } from './scoutingCore';
import { rosterEntry } from './testScouts';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: { stages: { Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }] } },
  pit: { groups: [{ name: 'Robot', questions: [{ code: 'drive', label: 'Drive', type: 'text' }] }] },
};

const ADA = { scoutId: 's01', name: 'Ada', pin: '4821' };
const GRACE = { scoutId: 's02', name: 'Grace', pin: '0007' };
const LEAD = { scoutId: 's03', name: 'Lin', pin: '3141' };
const bundle: EventBundle = {
  eventKey: '2026test',
  teams: [174, 578, 1511, 2052, 3015, 4930],
  schedule: [
    { matchNumber: 1, stations: { 'Red 1': 578, 'Red 2': 174, 'Red 3': 1511, 'Blue 1': 2052, 'Blue 2': 3015, 'Blue 3': 4930 } },
    { matchNumber: 2, stations: { 'Red 1': 4930, 'Blue 1': 578 } },
  ],
  roster: [ADA, GRACE, LEAD].map((s) => rosterEntry(s.scoutId, s.name, s.pin)),
  coverage: [],
};

/** A connection the test can drop. */
class FakeNetwork implements Network {
  online = true;
  isOnline(): boolean {
    return this.online;
  }
  onOnline(): void {}
}

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

/** A device with the Event Bundle, logged in as the given Scout. Uploads only when asked unless given a network. */
async function device(scout: { scoutId: string; pin: string }, network?: Network) {
  const name = `test-${crypto.randomUUID()}`;
  const db = new ScoutingDb(name);
  dbs.push({ name, db });
  const core = createScoutingCore({ db, gateway, network, seasonConfigs: [config], now: () => new Date((clock += 1000)) });
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(scout.scoutId, scout.pin);
  return core;
}

type Core = Awaited<ReturnType<typeof device>>;

async function scout(core: Core, matchNumber: number, station: Station, teamNumber?: number) {
  const { id } = await core.startMatchReport({ matchNumber, station, teamNumber });
  await core.complete(id);
  return id;
}

/** The counts on the grid, as "match station" to count, leaving out empty cells. */
function counts(coverage: Coverage): Record<string, number> {
  return Object.fromEntries(
    coverage.rows.flatMap((row) =>
      Object.entries(row.stations)
        .filter(([, cell]) => cell.count > 0)
        .map(([station, cell]) => [`${row.matchNumber} ${station}`, cell.count]),
    ),
  );
}

describe('Coverage online', () => {
  it('shows every scheduled match by the six Stations, with the schedule’s teams', async () => {
    const lead = await device(LEAD);

    const coverage = await lead.refreshCoverage();

    expect(coverage).toMatchObject({ eventKey: '2026test', source: 'everyone' });
    expect(coverage.reason).toBeUndefined();
    expect(coverage.rows.map((r) => r.matchNumber)).toEqual([1, 2]);
    expect(Object.keys(coverage.rows[0].stations)).toEqual(['Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3']);
    expect(coverage.rows[1].stations).toEqual({
      'Red 1': { teamNumber: 4930, count: 0 },
      'Red 2': { count: 0 },
      'Red 3': { count: 0 },
      'Blue 1': { teamNumber: 578, count: 0 },
      'Blue 2': { count: 0 },
      'Blue 3': { count: 0 },
    });
  });

  it('counts everyone’s Uploads, with two Reports on one Station counted twice', async () => {
    const ada = await device(ADA);
    const grace = await device(GRACE);
    const lead = await device(LEAD);
    await scout(ada, 1, 'Red 1');
    await scout(ada, 2, 'Blue 1');
    await scout(grace, 1, 'Red 1');
    await ada.uploadPending();
    await grace.uploadPending();

    expect(counts(await lead.refreshCoverage())).toEqual({ '1 Red 1': 2, '2 Blue 1': 1 });
  });

  it('sends this device’s pending Reports first, so they count', async () => {
    const network = new FakeNetwork();
    const lead = await device(LEAD, network);
    network.online = false;
    await scout(lead, 1, 'Blue 3');
    network.online = true;
    expect(await lead.pendingUploads()).toHaveLength(1);

    expect(counts(await lead.refreshCoverage())).toEqual({ '1 Blue 3': 1 });
    expect(await lead.pendingUploads()).toEqual([]);
  });

  it('leaves out Voided Reports', async () => {
    const ada = await device(ADA);
    const lead = await device(LEAD);
    const wrongTeam = await scout(ada, 1, 'Red 2');
    await scout(ada, 1, 'Red 3');
    await ada.uploadPending();
    await ada.voidReport(wrongTeam);
    await ada.uploadPending();

    expect(counts(await lead.refreshCoverage())).toEqual({ '1 Red 3': 1 });
  });

  it('adds a row for a match the schedule doesn’t have', async () => {
    const ada = await device(ADA);
    const lead = await device(LEAD);
    await scout(ada, 40, 'Red 1', 578);
    await ada.uploadPending();

    const coverage = await lead.refreshCoverage();

    expect(coverage.rows.map((r) => [r.matchNumber, r.scheduled])).toEqual([
      [1, true],
      [2, true],
      [40, false],
    ]);
    expect(coverage.rows[2].stations['Red 1']).toEqual({ count: 1 });
  });

  it('downloads the Event Bundle again, schedule and all', async () => {
    const lead = await device(LEAD);
    gateway.setEventBundle({ ...bundle, schedule: [...bundle.schedule, { matchNumber: 3, stations: {} }] });

    expect((await lead.refreshCoverage()).rows.map((r) => r.matchNumber)).toEqual([1, 2, 3]);
    expect((await lead.getEventBundle())?.schedule).toHaveLength(3);
  });
});

describe('Coverage offline', () => {
  it('counts only this device’s Complete, non-Void Match Reports, and says why', async () => {
    const ada = await device(ADA);
    const lead = await device(LEAD);
    await scout(ada, 1, 'Red 1');
    await ada.uploadPending();
    await scout(lead, 1, 'Blue 1');
    await scout(lead, 1, 'Blue 1');
    await lead.voidReport(await scout(lead, 1, 'Blue 2'));
    await lead.startMatchReport({ matchNumber: 2, station: 'Red 1' });
    const { id: pit } = await lead.startPitReport({ teamNumber: 578 });
    await lead.complete(pit);
    gateway.offline = true;

    const coverage = await lead.refreshCoverage();

    expect(coverage).toMatchObject({ eventKey: '2026test', source: 'this-device', reason: 'Could not reach the Season Sheet' });
    expect(counts(coverage)).toEqual({ '1 Blue 1': 2 });
    expect(coverage.rows.map((r) => r.matchNumber)).toEqual([1, 2]);
  });

  it('doesn’t try the Season Sheet when the device knows it is offline', async () => {
    const network = new FakeNetwork();
    const lead = await device(LEAD, network);
    network.online = false;
    gateway.setEventBundle({ ...bundle, schedule: [] });

    const coverage = await lead.refreshCoverage();

    expect(coverage).toMatchObject({ source: 'this-device', reason: 'This device is offline' });
    expect(coverage.rows.map((r) => r.matchNumber)).toEqual([1, 2]);
  });

  it('counts Reports received as a Hub', async () => {
    const ada = await device(ADA);
    const hub = await device(LEAD);
    await hub.acceptScan(await ada.qrTextFor(await scout(ada, 2, 'Red 1')));
    gateway.offline = true;

    expect(counts(await hub.refreshCoverage())).toEqual({ '2 Red 1': 1 });
  });

  it('counts only the current event’s Reports, and names that event', async () => {
    const lead = await device(LEAD);
    await scout(lead, 1, 'Red 1');
    gateway.setEventBundle({ ...bundle, eventKey: '2026next', eventName: 'Next Regional' });
    await lead.refreshEventBundle();
    gateway.offline = true;

    const coverage = await lead.refreshCoverage();

    expect(coverage).toMatchObject({ eventKey: '2026next', eventName: 'Next Regional' });
    expect(counts(coverage)).toEqual({});
  });
});
