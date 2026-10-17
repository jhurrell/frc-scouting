import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, ScoutingError, UnansweredRequiredError } from './scoutingCore';
import { TEST_SCOUT, testRoster } from './testScouts';

const config: SeasonConfig = {
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
const bundle: EventBundle = { eventKey: '2026test', teams: [], schedule: [], roster: testRoster, coverage: [] };

let dbName: string;
let db: ScoutingDb;
let gateway: FakeSheetGateway;
let clock: number;

async function setUpDevice() {
  const core = createScoutingCore({ db, gateway, seasonConfigs: [config], now: () => new Date(clock) });
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
  return core;
}

type Core = Awaited<ReturnType<typeof setUpDevice>>;

async function uploadedReport(core: Core) {
  const { id } = await core.startMatchReport({ matchNumber: 4, station: 'Blue 1', teamNumber: 578 });
  await core.answer(id, 'defense', false);
  await core.complete(id);
  await core.uploadPending();
  clock += 60_000;
  return id;
}

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  gateway = new FakeSheetGateway(bundle);
  clock = Date.parse('2026-10-16T12:00:00Z');
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

describe('editing a Complete Report', () => {
  it('keeps it Complete, gives it a new updated time and puts it back in the Upload queue', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);
    expect(await core.pendingUploads()).toEqual([]);

    await core.adjustCounter(id, 'tele_scored', 1);

    expect(await core.getReport(id)).toMatchObject({
      status: 'complete',
      updatedAt: '2026-10-16T12:01:00.000Z',
      answers: { tele_scored: 1 },
    });
    expect((await core.pendingUploads()).map((r) => r.id)).toEqual([id]);
    expect((await core.listReports())[0].uploaded).toBe(false);
  });

  it('Uploads the edit as the same Report', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);

    await core.answer(id, 'notes', 'Tipped over in auto');
    await core.uploadPending();

    expect(gateway.uploaded.size).toBe(1);
    expect(gateway.uploaded.get(id)?.answers.notes).toBe('Tipped over in auto');
    expect(await core.pendingUploads()).toEqual([]);
  });

  it('refuses to leave a required question unanswered', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);

    await expect(core.clearAnswer(id, 'defense')).rejects.toThrow(UnansweredRequiredError);
    expect((await core.getReport(id))?.answers.defense).toBe(false);
    expect(await core.pendingUploads()).toEqual([]);
  });
});

describe('Voiding a Report', () => {
  it('flags it Void and Uploads the Void', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);

    await core.voidReport(id);
    expect(await core.getReport(id)).toMatchObject({ voided: true, status: 'complete', updatedAt: '2026-10-16T12:01:00.000Z' });

    expect(await core.uploadPending()).toMatchObject({ stored: 1 });
    expect(gateway.uploaded.get(id)?.voided).toBe(true);
  });

  it('keeps the Report on the device', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);

    await core.voidReport(id);

    expect((await core.listReports()).map((r) => r.report.id)).toEqual([id]);
  });

  it('stops further changes', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);
    await core.voidReport(id);

    await expect(core.adjustCounter(id, 'tele_scored', 1)).rejects.toThrow(ScoutingError);
  });

  it('can Void a Draft, which still never leaves the device', async () => {
    const core = await setUpDevice();
    const { id } = await core.startMatchReport({ matchNumber: 4, station: 'Blue 1', teamNumber: 578 });

    await core.voidReport(id);

    expect(await core.getReport(id)).toMatchObject({ voided: true, status: 'draft' });
    await expect(core.complete(id)).rejects.toThrow(ScoutingError);
    expect(await core.pendingUploads()).toEqual([]);
  });
});

describe('stale copies', () => {
  it('counts a Report the Sheet already has a newer copy of as done, not pending', async () => {
    const core = await setUpDevice();
    const id = await uploadedReport(core);
    await core.answer(id, 'notes', 'older edit');
    // Meanwhile a newer copy of the same Report reached the Sheet another way, for example through a Hub.
    gateway.uploaded.set(id, { ...(await core.getReport(id))!, updatedAt: '2026-10-16T13:00:00.000Z' });

    expect(await core.uploadPending()).toEqual({ stored: 0, stale: 1, rejected: [] });
    expect(await core.pendingUploads()).toEqual([]);
  });
});
