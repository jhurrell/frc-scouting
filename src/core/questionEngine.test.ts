import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle, Question, SeasonConfig } from '../shared/contract';
import { ScoutingDb } from './db';
import { FakeSheetGateway } from '../gateway/fakeSheetGateway';
import { createScoutingCore, ScoutingError, UnansweredRequiredError } from './scoutingCore';
import { SeasonConfigError } from './seasonConfig';
import { TEST_SCOUT, testRoster } from './testScouts';

const config: SeasonConfig = {
  season: 'test',
  version: 1,
  match: {
    stages: {
      'Post-Match': [{ code: 'notes', label: 'Notes', type: 'text', required: true }],
      'Pre-Match': [{ code: 'start_pos', label: 'Start position', type: 'single-choice', options: ['Left', 'Middle', 'Right'], required: true }],
      Autonomous: [{ code: 'auto_moved', label: 'Moved', type: 'yes-no', required: true }],
      Teleop: [
        { code: 'tele_scored', label: 'Scored', type: 'counter', required: true },
        { code: 'tele_cycle', label: 'Cycle seconds', type: 'number', min: 0, max: 150 },
      ],
      Endgame: [{ code: 'end_actions', label: 'Endgame actions', type: 'multiple-choice', options: ['Park', 'Climb', 'Defend'] }],
    },
  },
  pit: { groups: [] },
};

const bundle: EventBundle = { eventKey: '2026test', teams: [578], schedule: [], roster: testRoster, coverage: [] };
const match1 = { matchNumber: 1, station: 'Blue 2', teamNumber: 578 } as const;

let dbName: string;
let db: ScoutingDb;

function makeCore(seasonConfigs: unknown[] = [config]) {
  return createScoutingCore({ db, gateway: new FakeSheetGateway(bundle), seasonConfigs });
}

async function startReport() {
  const core = makeCore();
  await core.setAccessCode('team-code');
  await core.refreshEventBundle();
  await core.login(TEST_SCOUT.scoutId, TEST_SCOUT.pin);
  const { id } = await core.startMatchReport(match1);
  const answers = async () => (await core.getReport(id))!.answers;
  return { core, id, answers };
}

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutingDb(dbName);
});

afterEach(async () => {
  db.close();
  await ScoutingDb.delete(dbName);
});

describe('question types', () => {
  it('yes/no takes true or false', async () => {
    const { core, id, answers } = await startReport();
    await core.answer(id, 'auto_moved', false);
    expect((await answers()).auto_moved).toBe(false);
    await expect(core.answer(id, 'auto_moved', 'yes')).rejects.toThrow(ScoutingError);
  });

  it('single choice takes one of its options', async () => {
    const { core, id, answers } = await startReport();
    await core.answer(id, 'start_pos', 'Middle');
    expect((await answers()).start_pos).toBe('Middle');
    await expect(core.answer(id, 'start_pos', 'Centre')).rejects.toThrow(ScoutingError);
  });

  it('multiple choice toggles options and keeps them in config order', async () => {
    const { core, id, answers } = await startReport();
    await core.toggleChoice(id, 'end_actions', 'Defend');
    await core.toggleChoice(id, 'end_actions', 'Park');
    expect((await answers()).end_actions).toEqual(['Park', 'Defend']);

    await core.toggleChoice(id, 'end_actions', 'Defend');
    await core.toggleChoice(id, 'end_actions', 'Park');
    expect(await answers()).not.toHaveProperty('end_actions');

    await expect(core.toggleChoice(id, 'end_actions', 'Fly')).rejects.toThrow(ScoutingError);
    await expect(core.answer(id, 'end_actions', ['Park', 'Park'])).rejects.toThrow(ScoutingError);
  });

  it('multiple choice never loses a tap when taps overlap', async () => {
    const { core, id, answers } = await startReport();
    await Promise.all(['Park', 'Climb', 'Defend'].map((o) => core.toggleChoice(id, 'end_actions', o)));
    expect((await answers()).end_actions).toEqual(['Park', 'Climb', 'Defend']);
  });

  it('number takes any number within its min and max', async () => {
    const { core, id, answers } = await startReport();
    await core.answer(id, 'tele_cycle', 12.5);
    expect((await answers()).tele_cycle).toBe(12.5);
    await expect(core.answer(id, 'tele_cycle', 151)).rejects.toThrow(ScoutingError);
    await expect(core.answer(id, 'tele_cycle', -1)).rejects.toThrow(ScoutingError);
    await expect(core.answer(id, 'tele_cycle', Number.NaN)).rejects.toThrow(ScoutingError);
  });

  it('text takes any text', async () => {
    const { core, id, answers } = await startReport();
    await core.answer(id, 'notes', 'Fast but tipped once');
    expect((await answers()).notes).toBe('Fast but tipped once');
    await expect(core.answer(id, 'notes', 5)).rejects.toThrow(ScoutingError);
  });

  it('clears an answer, except a counter', async () => {
    const { core, id, answers } = await startReport();
    await core.answer(id, 'start_pos', 'Left');
    await core.clearAnswer(id, 'start_pos');
    expect(await answers()).not.toHaveProperty('start_pos');
    await expect(core.clearAnswer(id, 'tele_scored')).rejects.toThrow(ScoutingError);
  });
});

describe('required questions', () => {
  it('lists unanswered required questions in Match Stage order', async () => {
    const { core, id } = await startReport();
    // The counter starts at 0, so it is already answered.
    expect(await core.unansweredRequired(id)).toEqual(['start_pos', 'auto_moved', 'notes']);
  });

  it('treats blank text as unanswered', async () => {
    const { core, id } = await startReport();
    await core.answer(id, 'notes', '   ');
    expect(await core.unansweredRequired(id)).toContain('notes');
  });

  it('blocks Complete until every required question is answered', async () => {
    const { core, id } = await startReport();
    await core.answer(id, 'start_pos', 'Left');

    const error = await core.complete(id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnansweredRequiredError);
    expect((error as UnansweredRequiredError).codes).toEqual(['auto_moved', 'notes']);
    expect((await core.getReport(id))?.status).toBe('draft');

    await core.answer(id, 'auto_moved', false);
    await core.answer(id, 'notes', 'ok');
    await core.complete(id);
    expect((await core.getReport(id))?.status).toBe('complete');
    expect(await core.unansweredRequired(id)).toEqual([]);
  });
});

describe('Season Config validation', () => {
  const question = (overrides: Partial<Question> = {}): Question => ({ code: 'q', label: 'Q', type: 'counter', ...overrides });
  const withTeleop = (questions: unknown[], version = 1): unknown => ({
    season: 'test',
    version,
    match: { stages: { Teleop: questions } },
    pit: { groups: [] },
  });

  function problemsFor(configs: unknown[]): string[] {
    try {
      makeCore(configs);
    } catch (e) {
      if (e instanceof SeasonConfigError) return e.problems;
      throw e;
    }
    return [];
  }

  it('accepts a valid config', () => {
    expect(problemsFor([config])).toEqual([]);
  });

  it('rejects a question code used twice in one version, even across match and pit', () => {
    const raw = withTeleop([question()]) as SeasonConfig;
    raw.pit.groups = [{ name: 'Drivetrain', questions: [question({ type: 'text' })] }];
    expect(problemsFor([raw]).join()).toMatch(/"q" is used more than once/);
  });

  it('rejects a choice question without options', () => {
    expect(problemsFor([withTeleop([question({ type: 'single-choice' })])]).join()).toMatch(/needs a list of options/);
    expect(problemsFor([withTeleop([question({ type: 'multiple-choice', options: [] })])]).join()).toMatch(/needs a list of options/);
  });

  it('rejects a match question outside the Match Stages', () => {
    const raw = { ...(withTeleop([]) as object), match: { stages: { Auto: [question()] } } };
    expect(problemsFor([raw]).join()).toMatch(/"Auto" is not a Match Stage/);
  });

  it('rejects a code reused across versions with a different type', () => {
    const problems = problemsFor([withTeleop([question()], 1), withTeleop([question({ type: 'number' })], 2)]);
    expect(problems.join()).toMatch(/"q" was counter in version 1 and cannot become number/);
  });

  it('accepts a code reused across versions with the same type', () => {
    expect(problemsFor([withTeleop([question()], 1), withTeleop([question({ label: 'Renamed' })], 2)])).toEqual([]);
  });

  it('rejects codes that would make poor column headers', () => {
    expect(problemsFor([withTeleop([question({ code: 'Tele Scored' })])]).join()).toMatch(/code must be lower-case/);
  });

  it('reports every problem at once', () => {
    const problems = problemsFor([withTeleop([{ code: 'a', type: 'single-choice' }, question({ min: 5, max: 1 })])]);
    expect(problems).toHaveLength(3);
  });

  it('rejects a broken config when the core starts, before any Report exists', () => {
    expect(() => makeCore([{ season: 'test' }])).toThrow(SeasonConfigError);
  });
});
