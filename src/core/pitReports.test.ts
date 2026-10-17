import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, SeasonConfig } from '../shared/contract';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { ScoutingDb } from './db';
import { createScoutingCore, ScoutingError, UnansweredRequiredError } from './scoutingCore';
import { formSections, SeasonConfigError, validateSeasonConfigs } from './seasonConfig';
import { TEST_SCOUT, testRoster } from './testScouts';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: { stages: { Teleop: [{ code: 'tele_scored', label: 'Scored', type: 'counter' }] } },
  pit: {
    groups: [
      {
        name: 'Drivetrain',
        questions: [
          { code: 'drive', label: 'Drivetrain', type: 'single-choice', options: ['Swerve', 'Tank', 'Other'], required: true },
          { code: 'motors', label: 'Drive motors', type: 'counter', max: 8 },
        ],
      },
      { name: 'Empty', questions: [] },
      {
        name: 'Strategy',
        questions: [
          { code: 'can_climb', label: 'Can climb', type: 'yes-no' },
          { code: 'pit_notes', label: 'Notes', type: 'text' },
        ],
      },
    ],
  },
};

const bundle: EventBundle = { eventKey: '2026test', teams: [174, 578, 1511], schedule: [], roster: testRoster, coverage: [] };

let dbName: string;
let db: ScoutingDb;
let gateway: FakeSheetGateway;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
  gateway = new FakeSheetGateway(bundle);
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

async function setUpDevice(seasonConfig: SeasonConfig = config) {
  const core = createScoutingCore({ db, gateway, seasonConfigs: [seasonConfig] });
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
  return core;
}

describe('starting a Pit Report', () => {
  it('records the team and no match or Station', async () => {
    const core = await setUpDevice();

    const report = await core.startPitReport({ teamNumber: 578 });

    expect(report).toMatchObject({ kind: 'pit', teamNumber: 578, eventKey: '2026test', scoutId: 's1', status: 'draft' });
    expect(report).not.toHaveProperty('matchNumber');
    expect(report).not.toHaveProperty('station');
    expect(await core.getReport(report.id)).toEqual(report);
  });

  it('takes a typed team that is not on the team list yet', async () => {
    const core = await setUpDevice();
    expect(await core.startPitReport({ teamNumber: 9999 })).toMatchObject({ teamNumber: 9999 });
  });

  it('refuses a team number that is not a whole number of 1 or more', async () => {
    const core = await setUpDevice();
    await expect(core.startPitReport({ teamNumber: 0 })).rejects.toThrow('Team number must be 1 or more');
    await expect(core.startPitReport({ teamNumber: Number('abc') })).rejects.toThrow(ScoutingError);
  });

  it('needs a logged-in Scout', async () => {
    const core = await setUpDevice();
    await core.logout();
    await expect(core.startPitReport({ teamNumber: 578 })).rejects.toThrow('Log in first');
  });

  it('is refused when the season has no pit questions', async () => {
    const core = await setUpDevice({ ...config, pit: { groups: [] } });
    expect(core.hasPitQuestions()).toBe(false);
    await expect(core.startPitReport({ teamNumber: 578 })).rejects.toThrow('no pit questions');
  });

  it('starts counters at their minimum, as a Match Report does', async () => {
    const core = await setUpDevice();
    expect((await core.startPitReport({ teamNumber: 578 })).answers).toEqual({ motors: 0 });
  });
});

describe('filling in a Pit Report', () => {
  it('answers only pit questions', async () => {
    const core = await setUpDevice();
    const { id } = await core.startPitReport({ teamNumber: 578 });

    await core.answer(id, 'drive', 'Swerve');
    await core.adjustCounter(id, 'motors', 1);

    await expect(core.answer(id, 'tele_scored', 3)).rejects.toThrow('Unknown question');
    expect((await core.getReport(id))?.answers).toEqual({ drive: 'Swerve', motors: 1 });
  });

  it('validates answers as for a Match Report', async () => {
    const core = await setUpDevice();
    const { id } = await core.startPitReport({ teamNumber: 578 });
    await expect(core.answer(id, 'drive', 'Mecanum')).rejects.toThrow('must be one of its options');
  });

  it('needs its required questions before it can be Completed', async () => {
    const core = await setUpDevice();
    const { id } = await core.startPitReport({ teamNumber: 578 });

    expect(await core.unansweredRequired(id)).toEqual(['drive']);
    await expect(core.complete(id)).rejects.toThrow(UnansweredRequiredError);

    await core.answer(id, 'drive', 'Tank');
    await core.complete(id);
    expect((await core.getReport(id))?.status).toBe('complete');
  });

  it('Uploads once Complete, and shows in My Reports', async () => {
    const core = await setUpDevice();
    const { id } = await core.startPitReport({ teamNumber: 1511 });
    await core.answer(id, 'drive', 'Other');
    await core.complete(id);

    expect(await core.uploadPending()).toMatchObject({ stored: 1 });
    expect(gateway.uploaded.get(id)).toMatchObject({ kind: 'pit', teamNumber: 1511, answers: { drive: 'Other' } });
    expect((await core.listReports()).map((r) => [r.report.kind, r.uploaded])).toEqual([['pit', true]]);
  });
});

describe('the pit section of the Season Config', () => {
  it('is shown as its named groups in config order, leaving out empty groups', () => {
    expect(formSections(config, 'pit').map((s) => [s.title, s.questions.map((q) => q.code)])).toEqual([
      ['Drivetrain', ['drive', 'motors']],
      ['Strategy', ['can_climb', 'pit_notes']],
    ]);
  });

  it('keeps match questions to the Match Stages', () => {
    expect(formSections(config, 'match').map((s) => s.title)).toEqual(['Teleop']);
  });

  it('rejects a group name used twice', () => {
    const twice = { ...config, pit: { groups: [config.pit.groups[0], { ...config.pit.groups[2], name: 'Drivetrain' }] } };
    expect(() => validateSeasonConfigs([twice])).toThrow(SeasonConfigError);
    expect(() => validateSeasonConfigs([twice])).toThrow(/pit group "Drivetrain" appears more than once/);
  });
});
