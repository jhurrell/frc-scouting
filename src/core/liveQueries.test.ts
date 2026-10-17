import { liveQuery } from 'dexie';
import { afterEach, beforeEach, describe, it } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore } from './scoutingCore';
import { TEST_SCOUT, testRoster } from './testScouts';

// The screens watch the core's queries with Dexie live queries, which re-run when the data they read changes.
// Dexie can only see those reads if each query keeps them inside its tracking, so these tests watch the queries
// the way a screen does.

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: { stages: { Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }] } },
  pit: { groups: [] },
};
const bundle: EventBundle = { eventKey: '2026test', teams: [], schedule: [], roster: testRoster, coverage: [] };

let dbName: string;
let db: ScoutingDb;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
});

afterEach(async () => {
  unsubscribe?.();
  db.close();
  await ScoutingDb.delete(dbName);
});

async function setUpDevice() {
  const core = createScoutingCore({ db, gateway: new FakeSheetGateway(bundle), seasonConfigs: [config] });
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
  return core;
}

/** Watches a query like a screen does, and waits for it to show what a check expects. */
function watch<T>(query: () => Promise<T>) {
  let latest: T | undefined;
  let error: unknown;
  const subscription = liveQuery(query).subscribe({ next: (value) => (latest = value), error: (e) => (error = e) });
  unsubscribe = () => subscription.unsubscribe();
  return {
    async shows(check: (value: T) => boolean): Promise<T> {
      for (let waited = 0; waited < 1000; waited += 10) {
        if (error) throw error;
        if (latest !== undefined && check(latest)) return latest;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`The watched query never showed what was expected. It last showed: ${JSON.stringify(latest)}`);
    },
  };
}

describe('a screen watching My Reports', () => {
  it('sees a Report become Complete, then Uploaded', async () => {
    const core = await setUpDevice();
    const { id } = await core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 });
    const myReports = watch(() => core.listReports());
    await myReports.shows((list) => list[0]?.report.status === 'draft');

    await core.complete(id);
    await myReports.shows((list) => list[0]?.report.status === 'complete' && !list[0].uploaded);

    await core.uploadPending();
    await myReports.shows((list) => list[0]?.uploaded);
  });

  it('sees the list empty on logout', async () => {
    const core = await setUpDevice();
    await core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 });
    const myReports = watch(() => core.listReports());
    await myReports.shows((list) => list.length === 1);

    await core.logout();
    await myReports.shows((list) => list.length === 0);
  });
});

describe('the app watching who is logged in', () => {
  /** The query the app runs to choose between Device setup, Log in and the screens. */
  function appState(core: Awaited<ReturnType<typeof setUpDevice>>) {
    return async () => ({
      hasAccessCode: await core.hasAccessCode(),
      eventKey: (await core.getEventBundle())?.eventKey,
      scout: (await core.currentScout())?.scoutId,
    });
  }

  it('sees logout and login', async () => {
    const core = await setUpDevice();
    const app = watch(appState(core));
    await app.shows((state) => state.scout === TEST_SCOUT.scoutId);

    await core.logout();
    await app.shows((state) => state.scout === undefined);

    await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
    await app.shows((state) => state.scout === TEST_SCOUT.scoutId);
  });

  it('sees a refreshed Event Bundle', async () => {
    const gateway = new FakeSheetGateway(bundle);
    const core = createScoutingCore({ db, gateway, seasonConfigs: [config] });
    await core.setAccessCode('team-code');
    await core.refreshEventBundle();
    const app = watch(appState(core));
    await app.shows((state) => state.eventKey === '2026test');

    gateway.setEventBundle({ ...bundle, eventKey: '2026next' });
    await core.refreshEventBundle();
    await app.shows((state) => state.eventKey === '2026next');
  });
});

describe('the Upload status line', () => {
  it('sees the pending count rise and fall, and a failed Upload’s reason', async () => {
    const gateway = new FakeSheetGateway(bundle);
    const core = createScoutingCore({ db, gateway, seasonConfigs: [config] });
    await core.setAccessCode('team-code');
    await core.refreshEventBundle();
    await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
    const status = watch(async () => ({
      pending: (await core.pendingUploads()).length,
      error: (await core.getUploadStatus())?.error,
    }));
    await status.shows((s) => s.pending === 0);

    const { id } = await core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 });
    await core.complete(id);
    await status.shows((s) => s.pending === 1);

    gateway.offline = true;
    await core.uploadPending().catch(() => undefined);
    await status.shows((s) => s.pending === 1 && s.error !== undefined && s.error !== null);

    gateway.offline = false;
    await core.uploadPending();
    await status.shows((s) => s.pending === 0 && s.error === null);
  });

  it('shows a rejection on its row in My Reports', async () => {
    const gateway = new FakeSheetGateway(bundle);
    const core = createScoutingCore({ db, gateway, seasonConfigs: [config] });
    await core.setAccessCode('team-code');
    await core.refreshEventBundle();
    await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
    const { id } = await core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 });
    await core.complete(id);
    const myReports = watch(() => core.listReports());
    await myReports.shows((list) => list.length === 1 && list[0].rejection === undefined);

    gateway.rejections.set(id, 'bad answers');
    await core.uploadPending();

    await myReports.shows((list) => list[0].rejection === 'bad answers');
  });
});
