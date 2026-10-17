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
const bundle: EventBundle = { eventKey: '2026test', teams: [], schedule: [], roster: [], coverage: [] };
const ACCESS_CODE = 'team-code';

let dbName: string;
let db: ScoutingDb;
let gateway: FakeSheetGateway;
let clock: number;

function makeCore() {
  return createScoutingCore({ db, gateway, seasonConfigs: [config], now: () => new Date(clock) });
}

async function setUpDevice() {
  const core = makeCore();
  await core.setAccessCode(ACCESS_CODE);
  await core.refreshEventBundle();
  return core;
}

async function completeReport(core: Awaited<ReturnType<typeof setUpDevice>>, matchNumber = 1) {
  const { id } = await core.startMatchReport({ matchNumber, station: 'Red 1', teamNumber: 578 });
  await core.complete(id);
  return id;
}

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  gateway = new FakeSheetGateway(bundle, { accessCode: ACCESS_CODE });
  clock = Date.parse('2026-10-16T12:00:00Z');
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

describe('device setup', () => {
  it('needs an access code before it can download the Event Bundle', async () => {
    const core = makeCore();
    expect(await core.hasAccessCode()).toBe(false);
    await expect(core.refreshEventBundle()).rejects.toThrow(ScoutingError);
  });

  it('refuses a blank access code', async () => {
    await expect(makeCore().setAccessCode('   ')).rejects.toThrow(ScoutingError);
  });

  it('downloads the Event Bundle with the stored access code', async () => {
    const core = await setUpDevice();
    expect(await core.hasAccessCode()).toBe(true);
    expect((await core.getEventBundle())?.eventKey).toBe('2026test');
  });

  it('reports a wrong access code', async () => {
    const core = makeCore();
    await core.setAccessCode('guess');
    await expect(core.refreshEventBundle()).rejects.toThrow('Wrong access code');
  });

  it('keeps the access code after the app restarts', async () => {
    await setUpDevice();
    db.close();
    db = new ScoutingDb(dbName);
    expect(await makeCore().hasAccessCode()).toBe(true);
  });
});

describe('uploading', () => {
  it('sends Complete Reports and marks them Uploaded', async () => {
    const core = await setUpDevice();
    const id = await completeReport(core);

    expect(await core.uploadPending()).toEqual({ stored: 1, rejected: [] });

    expect(gateway.uploaded.get(id)).toMatchObject({ id, status: 'complete', eventKey: '2026test' });
    expect(await core.listReports()).toEqual([expect.objectContaining({ uploaded: true })]);
    expect(await core.pendingUploads()).toEqual([]);
  });

  it('never sends a Draft', async () => {
    const core = await setUpDevice();
    const { id: draftId } = await core.startMatchReport({ matchNumber: 1, station: 'Red 1', teamNumber: 578 });
    const completeId = await completeReport(core, 2);

    await core.uploadPending();

    expect([...gateway.uploaded.keys()]).toEqual([completeId]);
    expect((await core.listReports()).find((r) => r.report.id === draftId)?.uploaded).toBe(false);
  });

  it('does nothing when there is nothing pending', async () => {
    const core = await setUpDevice();
    await completeReport(core);
    await core.uploadPending();
    gateway.uploaded.clear();

    expect(await core.uploadPending()).toEqual({ stored: 0, rejected: [] });
    expect(gateway.uploaded.size).toBe(0);
  });

  it('keeps rejected Reports pending, with the reason', async () => {
    const core = await setUpDevice();
    const good = await completeReport(core, 1);
    const bad = await completeReport(core, 2);
    gateway.rejections.set(bad, 'unknown event key "2026test"');

    expect(await core.uploadPending()).toEqual({
      stored: 1,
      rejected: [{ reportId: bad, reason: 'unknown event key "2026test"' }],
    });
    expect((await core.pendingUploads()).map((r) => r.id)).toEqual([bad]);
    expect(gateway.uploaded.has(good)).toBe(true);
  });

  it('keeps everything pending when the Season Sheet can’t be reached, and succeeds on retry', async () => {
    const core = await setUpDevice();
    const id = await completeReport(core);
    gateway.offline = true;

    await expect(core.uploadPending()).rejects.toThrow(SheetGatewayError);
    expect((await core.pendingUploads()).map((r) => r.id)).toEqual([id]);

    gateway.offline = false;
    expect(await core.uploadPending()).toEqual({ stored: 1, rejected: [] });
  });

  it('refuses to upload from a device without an access code', async () => {
    const core = makeCore();
    await expect(core.uploadPending()).rejects.toThrow(ScoutingError);
  });
});
