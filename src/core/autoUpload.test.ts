import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, type Network } from './scoutingCore';
import { rosterEntry, TEST_SCOUT, testRoster } from './testScouts';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: { stages: { Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }] } },
  pit: { groups: [] },
};
const OTHER_SCOUT = { scoutId: 's2', name: 'Other Scout', pin: '9876' };
const bundle: EventBundle = {
  eventKey: '2026test',
  teams: [],
  schedule: [],
  roster: [...testRoster, rosterEntry(OTHER_SCOUT.scoutId, OTHER_SCOUT.name, OTHER_SCOUT.pin)],
  coverage: [],
};
const ACCESS_CODE = 'team-code';

/** A connection the test can drop and bring back. */
class FakeNetwork implements Network {
  online = true;
  private readonly listeners: (() => void)[] = [];

  isOnline(): boolean {
    return this.online;
  }

  onOnline(listener: () => void): void {
    this.listeners.push(listener);
  }

  reconnect(): void {
    this.online = true;
    for (const listener of this.listeners) listener();
  }
}

let dbName: string;
let db: ScoutingDb;
let gateway: FakeSheetGateway;
let network: FakeNetwork;
let clock: number;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  gateway = new FakeSheetGateway(bundle, { accessCode: ACCESS_CODE });
  network = new FakeNetwork();
  clock = Date.parse('2026-10-16T12:00:00Z');
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

async function setUpDevice() {
  const core = createScoutingCore({ db, gateway, network, seasonConfigs: [config], now: () => new Date((clock += 1000)) });
  await core.setAccessCode(ACCESS_CODE);
  await core.refreshEventBundle();
  await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
  return core;
}

type Core = Awaited<ReturnType<typeof setUpDevice>>;

async function completeReport(core: Core, matchNumber = 1) {
  const { id } = await core.startMatchReport({ matchNumber, station: 'Red 1', teamNumber: 578 });
  await core.complete(id);
  return id;
}

/** The Report IDs of each batch the Sheet received. The order within a batch doesn't matter. */
const batches = () => gateway.batches.map((batch) => [...batch].sort());

/** Gives background work a moment, for checks that nothing happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('automatic Upload', () => {
  it('sends a Report as soon as it is Completed while online', async () => {
    const core = await setUpDevice();
    const id = await completeReport(core);

    await vi.waitFor(() => expect(gateway.uploaded.has(id)).toBe(true));
    await vi.waitFor(async () => expect(await core.pendingUploads()).toEqual([]));
  });

  it('waits while offline, then sends everything pending when the connection comes back', async () => {
    const core = await setUpDevice();
    network.online = false;
    const first = await completeReport(core, 1);
    const second = await completeReport(core, 2);
    await settle();
    expect(gateway.batches).toEqual([]);
    expect(await core.pendingUploads()).toHaveLength(2);

    network.reconnect();

    await vi.waitFor(async () => expect(await core.pendingUploads()).toEqual([]));
    expect(batches()).toEqual([[first, second].sort()]);
  });

  it('sends a Void as soon as it is made', async () => {
    const core = await setUpDevice();
    const id = await completeReport(core);
    await vi.waitFor(() => expect(gateway.uploaded.get(id)?.voided).toBe(false));

    await core.voidReport(id);

    await vi.waitFor(() => expect(gateway.uploaded.get(id)?.voided).toBe(true));
  });

  it('sends an edit when asked to Upload in the background', async () => {
    const core = await setUpDevice();
    const id = await completeReport(core);
    await vi.waitFor(() => expect(gateway.uploaded.has(id)).toBe(true));
    await core.adjustCounter(id, 'tele_scored', 1);

    await core.uploadInBackground();

    expect(gateway.uploaded.get(id)?.answers.tele_scored).toBe(1);
  });

  it('never runs two Uploads at once: a Report Completed during an Upload goes in the next one', async () => {
    const core = await setUpDevice();
    const resume = gateway.pause();
    const first = await completeReport(core, 1);
    await vi.waitFor(() => expect(gateway.batches).toEqual([[first]]));

    const second = await completeReport(core, 2);
    const third = await completeReport(core, 3);
    await settle();
    expect(gateway.batches).toEqual([[first]]);

    resume();
    await vi.waitFor(async () => expect(await core.pendingUploads()).toEqual([]));
    expect(batches()).toEqual([[first], [second, third].sort()]);
  });

  it('does nothing without an access code', async () => {
    const core = createScoutingCore({ db, gateway, network, seasonConfigs: [config] });
    await core.uploadInBackground();
    expect(gateway.batches).toEqual([]);
  });
});

describe('a failed Upload', () => {
  it('keeps every Report pending, records a clear reason, and recovers on retry without duplicates', async () => {
    const core = await setUpDevice();
    gateway.offline = true; // The device thinks it's online, but the script can't be reached.
    const first = await completeReport(core, 1);
    await vi.waitFor(async () => expect((await core.getUploadStatus())?.error).toMatch(/Could not reach the Season Sheet/));
    expect((await core.pendingUploads()).map((r) => r.id)).toEqual([first]);

    gateway.offline = false;
    const second = await completeReport(core, 2);

    await vi.waitFor(async () => expect(await core.pendingUploads()).toEqual([]));
    expect((await core.getUploadStatus())?.error).toBeNull();
    expect([...gateway.uploaded.keys()].sort()).toEqual([first, second].sort());
    expect(batches().at(-1)).toEqual([first, second].sort());
  });

  it('reports a wrong access code to the Scout who pressed Upload now', async () => {
    const core = await setUpDevice();
    network.online = false;
    await completeReport(core);
    await core.setAccessCode('changed-by-mistake');

    await expect(core.uploadPending()).rejects.toThrow('Wrong access code');

    expect((await core.getUploadStatus())?.error).toBe('Wrong access code');
    expect(await core.pendingUploads()).toHaveLength(1);
  });
});

describe('rejections for individual Reports', () => {
  it('show on the rejected Report only, and don’t hold back the rest of the batch', async () => {
    const core = await setUpDevice();
    network.online = false;
    const good = await completeReport(core, 1);
    const bad = await completeReport(core, 2);
    gateway.rejections.set(bad, 'unknown event key "2026test"');

    expect(await core.uploadPending()).toMatchObject({ stored: 1, rejected: [{ reportId: bad }] });

    const listed = new Map((await core.listReports()).map((r) => [r.report.id, r]));
    expect(listed.get(good)).toMatchObject({ uploaded: true });
    expect(listed.get(good)).not.toHaveProperty('rejection');
    expect(listed.get(bad)).toMatchObject({ uploaded: false, rejection: 'unknown event key "2026test"' });
  });

  it('stop showing once the Report changes, since the new version hasn’t been refused', async () => {
    const core = await setUpDevice();
    network.online = false;
    const bad = await completeReport(core);
    gateway.rejections.set(bad, 'bad answers');
    await core.uploadPending();

    await core.adjustCounter(bad, 'tele_scored', 1);

    expect((await core.listReports())[0]).not.toHaveProperty('rejection');
  });

  it('survive a failed attempt, because that attempt learned nothing new', async () => {
    const core = await setUpDevice();
    network.online = false;
    const bad = await completeReport(core);
    gateway.rejections.set(bad, 'bad answers');
    await core.uploadPending();
    gateway.offline = true;

    await expect(core.uploadPending()).rejects.toThrow();

    expect((await core.listReports())[0]).toMatchObject({ rejection: 'bad answers' });
  });
});

describe('the pending count', () => {
  it('counts every Complete Report on the device the Sheet doesn’t hold yet, whoever made it', async () => {
    const core = await setUpDevice();
    network.online = false;
    const count = async () => (await core.pendingUploads()).length;

    await core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 });
    expect(await count()).toBe(0); // Drafts never Upload.

    const mine = await completeReport(core, 2);
    await core.login(OTHER_SCOUT.scoutId, OTHER_SCOUT.pin);
    await completeReport(core, 3);
    expect(await count()).toBe(2);

    await core.uploadPending();
    expect(await count()).toBe(0);

    await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
    await core.adjustCounter(mine, 'tele_scored', 1);
    expect(await count()).toBe(1);
  });
});
