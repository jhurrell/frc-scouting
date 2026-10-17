import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SheetGatewayError, type EventBundle, type SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, ScoutingError } from './scoutingCore';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: { stages: { Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }] } },
  pit: { groups: [] },
};

const nyro: EventBundle = {
  eventKey: '2026nyro',
  teams: [174, 191, 340, 578, 1511, 3015],
  schedule: [
    {
      matchNumber: 1,
      stations: { 'Red 1': 340, 'Red 2': 174, 'Red 3': 191, 'Blue 1': 578, 'Blue 3': 1511 },
    },
    {
      matchNumber: 2,
      stations: { 'Red 1': 578, 'Red 2': 1511, 'Red 3': 3015, 'Blue 1': 340, 'Blue 2': 174, 'Blue 3': 191 },
    },
  ],
  roster: [],
  coverage: [],
};

let dbName: string;
let db: ScoutingDb;
let gateway: FakeSheetGateway;

function makeCore() {
  return createScoutingCore({ db, gateway, seasonConfigs: [config] });
}

async function setUpDevice() {
  const core = makeCore();
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  return core;
}

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  gateway = new FakeSheetGateway(nyro);
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

describe('the Event Bundle on the device', () => {
  it('is kept for offline use once downloaded', async () => {
    await setUpDevice();
    gateway.offline = true;

    // A fresh start of the app, with no connection.
    const core = makeCore();
    expect(await core.getEventBundle()).toEqual(nyro);
    expect(await core.startMatchReport({ matchNumber: 2, station: 'Red 1' })).toMatchObject({ teamNumber: 578 });
  });

  it('is replaced by Refresh, and new Reports take the new current event', async () => {
    const core = await setUpDevice();
    const before = await core.startMatchReport({ matchNumber: 2, station: 'Red 1' });

    gateway.setEventBundle({ ...nyro, eventKey: '2026nytr', schedule: [] });
    await core.refreshEventBundle();
    const after = await core.startMatchReport({ matchNumber: 2, station: 'Red 1', teamNumber: 578 });

    expect(before.eventKey).toBe('2026nyro');
    expect(after.eventKey).toBe('2026nytr');
    expect((await core.getReport(before.id))?.eventKey).toBe('2026nyro');
  });

  it('survives a failed Refresh unchanged', async () => {
    const core = await setUpDevice();
    gateway.offline = true;

    await expect(core.refreshEventBundle()).rejects.toThrow(SheetGatewayError);
    expect(await core.getEventBundle()).toEqual(nyro);
  });

  it('is needed before a Match Report can start', async () => {
    const core = makeCore();
    await expect(core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 })).rejects.toThrow(
      'No Event Bundle',
    );
  });
});

describe('choosing the robot', () => {
  it('fills in the team number from the match and Station', async () => {
    const core = await setUpDevice();

    expect(await core.startMatchReport({ matchNumber: 1, station: 'Blue 1' })).toMatchObject({
      matchNumber: 1,
      station: 'Blue 1',
      teamNumber: 578,
    });
    expect(await core.startMatchReport({ matchNumber: 2, station: 'Blue 3' })).toMatchObject({ teamNumber: 191 });
  });

  it('shows the scheduled teams for a match', async () => {
    const core = await setUpDevice();
    expect((await core.scheduledMatch(1))?.stations['Red 2']).toBe(174);
    expect(await core.scheduledMatch(99)).toBeUndefined();
  });

  it('accepts a typed team number that matches the schedule', async () => {
    const core = await setUpDevice();
    expect(await core.startMatchReport({ matchNumber: 1, station: 'Blue 1', teamNumber: 578 })).toMatchObject({
      teamNumber: 578,
    });
  });

  it('refuses a team number that contradicts the schedule', async () => {
    const core = await setUpDevice();
    await expect(core.startMatchReport({ matchNumber: 1, station: 'Blue 1', teamNumber: 1511 })).rejects.toThrow(
      'The schedule has Team 578 at Blue 1 in match 1',
    );
  });

  it('takes typed match and team numbers for a match outside the schedule, such as a playoff', async () => {
    const core = await setUpDevice();
    expect(await core.startMatchReport({ matchNumber: 101, station: 'Red 3', teamNumber: 3015 })).toMatchObject({
      matchNumber: 101,
      station: 'Red 3',
      teamNumber: 3015,
    });
  });

  it('takes a typed team number for a Station the schedule leaves blank', async () => {
    const core = await setUpDevice();
    expect(await core.startMatchReport({ matchNumber: 1, station: 'Blue 2', teamNumber: 9578 })).toMatchObject({
      teamNumber: 9578,
    });
  });

  it('asks for the team number when the schedule has none', async () => {
    const core = await setUpDevice();
    await expect(core.startMatchReport({ matchNumber: 101, station: 'Red 3' })).rejects.toThrow(ScoutingError);
    await expect(core.startMatchReport({ matchNumber: 1, station: 'Blue 2' })).rejects.toThrow('Enter the team number');
  });
});
