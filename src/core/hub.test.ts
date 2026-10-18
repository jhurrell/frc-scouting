import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, ScoutingError } from './scoutingCore';
import { rosterEntry } from './testScouts';

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
  pit: { groups: [{ name: 'Robot', questions: [{ code: 'drive', label: 'Drive', type: 'single-choice', options: ['Swerve', 'Tank'] }] }] },
};

const ADA = { scoutId: 's01', name: 'Ada', pin: '4821' };
const HUB_OPERATOR = { scoutId: 's02', name: 'Grace', pin: '0007' };
const bundle: EventBundle = {
  eventKey: '2026test',
  teams: [578, 1511],
  schedule: [{ matchNumber: 4, stations: { 'Blue 1': 578 } }],
  roster: [rosterEntry(ADA.scoutId, ADA.name, ADA.pin), rosterEntry(HUB_OPERATOR.scoutId, HUB_OPERATOR.name, HUB_OPERATOR.pin)],
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

/** A device with the Event Bundle, logged in as the given Scout. Uploads only when asked. */
async function device(scout: { scoutId: string; pin: string }) {
  const name = `test-${crypto.randomUUID()}`;
  const db = new ScoutingDb(name);
  dbs.push({ name, db });
  const core = createScoutingCore({ db, gateway, seasonConfigs: [config], now: () => new Date((clock += 1000)) });
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(scout.scoutId, scout.pin);
  return core;
}

type Core = Awaited<ReturnType<typeof device>>;

async function completedReport(core: Core) {
  const { id } = await core.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
  await core.answer(id, 'defense', true);
  await core.complete(id);
  return id;
}

describe('showing a Report as a QR code', () => {
  it('works for the Scout’s own Complete Report', async () => {
    const ada = await device(ADA);
    const id = await completedReport(ada);
    expect(await ada.qrTextFor(id)).toMatch(/^SR1\|/);
  });

  it('refuses a Draft and someone else’s Report', async () => {
    const ada = await device(ADA);
    const { id: draft } = await ada.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await expect(ada.qrTextFor(draft)).rejects.toThrow(ScoutingError);

    const id = await completedReport(ada);
    await ada.login(HUB_OPERATOR.scoutId, HUB_OPERATOR.pin);
    await expect(ada.qrTextFor(id)).rejects.toThrow('Only the Scout who made a Report');
  });

  it('refuses a Report too long for one QR code, with a reason to show', async () => {
    const ada = await device(ADA);
    const id = await completedReport(ada);
    await ada.answer(id, 'notes', 'x'.repeat(1000));
    await expect(ada.qrTextFor(id)).rejects.toThrow(/too long for one QR code/);
  });
});

describe('the Hub', () => {
  it('takes in a scan under the original Scout and confirms who, which match, Station and team', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const id = await completedReport(ada);

    const result = await hub.acceptScan(await ada.qrTextFor(id));

    expect(result).toMatchObject({
      outcome: 'added',
      scoutName: 'Ada',
      report: { id, scoutId: 's01', matchNumber: 4, station: 'Blue 1', teamNumber: 578 },
    });
    expect(await hub.getReport(id)).toEqual(await ada.getReport(id));
    expect((await hub.pendingUploads()).map((r) => r.id)).toEqual([id]);
  });

  it('ignores a rescan of a version it already has', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const text = await ada.qrTextFor(await completedReport(ada));
    await hub.acceptScan(text);

    expect((await hub.acceptScan(text)).outcome).toBe('duplicate');
    expect(await hub.listHubReports()).toHaveLength(1);
  });

  it('replaces an older copy with a newer scan', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const id = await completedReport(ada);
    await hub.acceptScan(await ada.qrTextFor(id));
    await ada.adjustCounter(id, 'tele_scored', 1);

    expect((await hub.acceptScan(await ada.qrTextFor(id))).outcome).toBe('updated');
    expect((await hub.getReport(id))?.answers.tele_scored).toBe(1);
  });

  it('keeps the newer copy when an older one is scanned late', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const id = await completedReport(ada);
    const older = await ada.qrTextFor(id);
    await ada.adjustCounter(id, 'tele_scored', 1);
    await hub.acceptScan(await ada.qrTextFor(id));

    expect((await hub.acceptScan(older)).outcome).toBe('older');
    expect((await hub.getReport(id))?.answers.tele_scored).toBe(1);
  });

  it('Uploads scanned Reports under their original Scout, marked as coming from the Hub', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const scanned = await completedReport(ada);
    await hub.acceptScan(await ada.qrTextFor(scanned));
    const own = await completedReport(hub);

    expect(await hub.uploadPending()).toMatchObject({ stored: 2 });

    expect(gateway.uploaded.get(scanned)?.scoutId).toBe('s01');
    expect(gateway.uploadedVia.get(scanned)).toBe('hub');
    expect(gateway.uploadedVia.get(own)).toBe('device');
    expect((await hub.listHubReports()).map((r) => [r.report.id, r.scoutName, r.uploaded])).toEqual([[scanned, 'Ada', true]]);
  });

  it('keeps scanned Reports out of the Hub operator’s own list, and can’t change them', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const id = await completedReport(ada);
    await hub.acceptScan(await ada.qrTextFor(id));

    expect(await hub.listReports()).toEqual([]);
    await expect(hub.voidReport(id)).rejects.toThrow('Only the Scout who made a Report');
  });

  it('takes in Pit Reports too', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const { id } = await ada.startPitReport({ teamNumber: 1511 });
    await ada.answer(id, 'drive', 'Tank');
    await ada.complete(id);

    expect(await hub.acceptScan(await ada.qrTextFor(id))).toMatchObject({ outcome: 'added', report: { kind: 'pit', teamNumber: 1511 } });
  });

  it('refuses a scan it can’t use, with a reason to show', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const text = await ada.qrTextFor(await completedReport(ada));

    await expect(hub.acceptScan('https://example.com')).rejects.toThrow('Not a Scouting Report QR code');
    await expect(hub.acceptScan(text.replace('|4|', '|5|'))).rejects.toThrow(/checksum/);
    await expect(hub.acceptScan(text.replace(/^SR1\|([^|]*\|[^|]*\|[^|]*\|[^|]*\|)1\|/, 'SR1|$1' + '9|'))).rejects.toThrow(
      /version 9, which this app doesn't have/,
    );
    expect(await hub.listHubReports()).toEqual([]);
  });

  it('needs a logged-in Scout', async () => {
    const ada = await device(ADA);
    const hub = await device(HUB_OPERATOR);
    const text = await ada.qrTextFor(await completedReport(ada));
    await hub.logout();

    await expect(hub.acceptScan(text)).rejects.toThrow('Log in first');
  });
});

describe('handing off', () => {
  it('stops a Report counting as pending on the Scout’s device, and stops it Uploading from there', async () => {
    const ada = await device(ADA);
    const id = await completedReport(ada);

    await ada.markHandedOff(id);

    expect(await ada.pendingUploads()).toEqual([]);
    expect((await ada.listReports())[0]).toMatchObject({ handedOff: true, uploaded: false });
    await ada.uploadPending();
    expect(gateway.uploaded.has(id)).toBe(false);
  });

  it('makes the Report pending again if the Scout changes it afterwards', async () => {
    const ada = await device(ADA);
    const id = await completedReport(ada);
    await ada.markHandedOff(id);

    await ada.adjustCounter(id, 'tele_scored', 1);

    expect((await ada.pendingUploads()).map((r) => r.id)).toEqual([id]);
    expect((await ada.listReports())[0].handedOff).toBe(false);
  });

  it('is only for the Scout’s own Complete Reports', async () => {
    const ada = await device(ADA);
    const { id: draft } = await ada.startMatchReport({ matchNumber: 4, station: 'Blue 1' });
    await expect(ada.markHandedOff(draft)).rejects.toThrow('Only a Complete Report');
  });
});
