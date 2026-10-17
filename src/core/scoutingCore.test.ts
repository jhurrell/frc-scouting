import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { ScoutingDb } from './db';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { createScoutingCore, ScoutingError } from './scoutingCore';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: {
    stages: {
      Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }],
      Endgame: [{ code: 'end_parked', label: 'Parked', type: 'counter', min: 0, max: 1 }],
    },
  },
  pit: { groups: [] },
};

const bundle: EventBundle = { eventKey: '2026test', teams: [578], schedule: [], roster: [], coverage: [] };

let dbName: string;
let db: ScoutingDb;
let clock: number;

function makeCore(database = db) {
  let nextId = 0;
  return createScoutingCore({
    db: database,
    gateway: new FakeSheetGateway(bundle),
    seasonConfigs: [config],
    now: () => new Date(clock),
    newId: () => `report-${++nextId}`,
  });
}

async function readyCore() {
  const core = makeCore();
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  return core;
}

const match12 = { matchNumber: 12, station: 'Red 1', teamNumber: 578 } as const;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  clock = Date.parse('2026-10-16T12:00:00Z');
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

describe('starting a Match Report', () => {
  it('creates a Draft for the current event and the latest Season Config', async () => {
    const core = await readyCore();
    const report = await core.startMatchReport(match12);

    expect(report).toMatchObject({
      id: 'report-1',
      kind: 'match',
      eventKey: '2026test',
      configVersion: 1,
      status: 'draft',
      voided: false,
      matchNumber: 12,
      station: 'Red 1',
      teamNumber: 578,
      createdAt: '2026-10-16T12:00:00.000Z',
      updatedAt: '2026-10-16T12:00:00.000Z',
    });
  });

  it('starts every counter at its minimum', async () => {
    const core = await readyCore();
    const report = await core.startMatchReport(match12);
    expect(report.answers).toEqual({ tele_scored: 0, end_parked: 0 });
  });

  it('refuses when the device has no Event Bundle', async () => {
    const core = makeCore();
    await expect(core.startMatchReport(match12)).rejects.toThrow(ScoutingError);
  });

  it('refuses a match or team number below 1', async () => {
    const core = await readyCore();
    await expect(core.startMatchReport({ ...match12, matchNumber: 0 })).rejects.toThrow(ScoutingError);
    await expect(core.startMatchReport({ ...match12, teamNumber: -5 })).rejects.toThrow(ScoutingError);
  });
});

describe('counters', () => {
  it('changes by exactly one per press', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);

    await core.adjustCounter(id, 'tele_scored', 1);
    await core.adjustCounter(id, 'tele_scored', 1);
    await core.adjustCounter(id, 'tele_scored', -1);

    expect((await core.getReport(id))?.answers.tele_scored).toBe(1);
  });

  it('never loses or doubles a press when presses overlap', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);

    await Promise.all(Array.from({ length: 10 }, () => core.adjustCounter(id, 'tele_scored', 1)));

    expect((await core.getReport(id))?.answers.tele_scored).toBe(10);
  });

  it('stays within its min and max', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);

    await core.adjustCounter(id, 'tele_scored', -1);
    await core.adjustCounter(id, 'end_parked', 1);
    await core.adjustCounter(id, 'end_parked', 1);

    expect((await core.getReport(id))?.answers).toEqual({ tele_scored: 0, end_parked: 1 });
  });

  it('records the time of the change', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);
    clock += 60_000;

    await core.adjustCounter(id, 'tele_scored', 1);

    expect((await core.getReport(id))?.updatedAt).toBe('2026-10-16T12:01:00.000Z');
  });

  it('can be set directly with a whole number in range', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);

    await core.answer(id, 'tele_scored', 7);

    expect((await core.getReport(id))?.answers.tele_scored).toBe(7);
    await expect(core.answer(id, 'tele_scored', 2.5)).rejects.toThrow(ScoutingError);
    await expect(core.answer(id, 'end_parked', 2)).rejects.toThrow(ScoutingError);
  });

  it('rejects a question code the Season Config does not have', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);
    await expect(core.adjustCounter(id, 'nope', 1)).rejects.toThrow(ScoutingError);
  });
});

describe('completing a Match Report', () => {
  it('marks it Complete', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);
    await core.adjustCounter(id, 'tele_scored', 1);
    clock += 60_000;

    await core.complete(id);

    const report = await core.getReport(id);
    expect(report?.status).toBe('complete');
    expect(report?.updatedAt).toBe('2026-10-16T12:01:00.000Z');
    await expect(core.complete(id)).rejects.toThrow(ScoutingError);
  });

  it('is still Complete after the app restarts', async () => {
    const core = await readyCore();
    const { id } = await core.startMatchReport(match12);
    await core.complete(id);
    db.close();

    const reopened = makeCore(new ScoutingDb(dbName));

    expect(await reopened.getReport(id)).toMatchObject({ id, status: 'complete', matchNumber: 12 });
  });
});

describe('listing Reports', () => {
  it('lists this device’s Reports, most recently changed first', async () => {
    const core = await readyCore();
    const first = await core.startMatchReport(match12);
    clock += 1000;
    const second = await core.startMatchReport({ ...match12, matchNumber: 13 });
    clock += 1000;
    await core.adjustCounter(first.id, 'tele_scored', 1);

    expect((await core.listReports()).map((r) => r.report.id)).toEqual([first.id, second.id]);
  });
});
