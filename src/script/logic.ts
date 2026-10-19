// The Apps Script's behaviour, as plain functions over 2D arrays.
// Nothing here touches Google services; the thin adapter in appsScriptAdapter.ts does that.
// See ADR 0001 and the spec's "Upload rules".

import {
  countCoverage,
  PIN_PATTERN,
  pinHashText,
  STATIONS,
  type Answer,
  type CoverageEntry,
  type EventBundle,
  type Report,
  type RosterEntry,
  type ScheduledMatch,
  type ScriptRequest,
  type ScriptResponse,
  type Station,
  type UploadOutcome,
} from '../shared/contract';

export type Cell = string | number | boolean;
/** A tab's contents. Row 0 is the header row. An empty tab is []. */
export type Table = Cell[][];

/** Everything the script reads and writes in Google Sheets. */
export interface SpreadsheetPort {
  /** A tab of the Season Sheet, the spreadsheet the script is bound to. */
  readSeasonTab(tab: string): Table;
  /** Replaces the tab's contents with the table, creating the tab if needed. */
  writeSeasonTab(tab: string, table: Table): void;
  readEventTab(eventSheetId: string, tab: string): Table;
  /** Replaces the tab's contents with the table, creating the tab if needed. */
  writeEventTab(eventSheetId: string, tab: string, table: Table): void;
  /** Creates an empty Event Sheet next to the Season Sheet and returns its ID. */
  createEventSheet(name: string): string;
}

/** The Blue Alliance's read API (v3). */
export interface TbaPort {
  /** The parsed JSON at the path, for example "/event/2026nyro/simple", or null when TBA answers "not found". */
  get(path: string): unknown;
}

/** Hashing, which Apps Script and Node provide differently. */
export interface ScriptCrypto {
  /** Lowercase hex of the SHA-256 of the UTF-8 text. */
  sha256Hex(text: string): string;
  /** A fresh random salt. */
  newSalt(): string;
}

/** Everything a web app request needs besides the Sheets. */
export interface ScriptEnv {
  /** The team access code, from the script's properties. Null when an Admin hasn't set it. */
  accessCode: string | null;
  now: Date;
  crypto: ScriptCrypto;
}

/** A problem to show an Admin, as opposed to a bug. */
export class ScriptError extends Error {}

export const SEASON_TABS = { settings: 'Settings', scouts: 'Scouts', events: 'Events' } as const;
export const EVENT_TABS = { schedule: 'Schedule', teams: 'Teams' } as const;
export const REPORT_TABS = { match: 'Match Reports', pit: 'Pit Reports' } as const;
export const CURRENT_EVENT_SETTING = 'Current event';

const SETTINGS_HEADER = ['Setting', 'Value'];
const EVENTS_HEADER = ['Event key', 'Event Sheet ID', 'Event name'];
const SCHEDULE_HEADER = ['Match', ...STATIONS];
const TEAMS_HEADER = ['Team'];
const SCOUTS_HEADER = ['Scout ID', 'Name', 'PIN'];

/** Fixed columns at the left of every Report tab. Question-code columns follow. */
export const METADATA_COLUMNS = [
  'Report ID',
  'Event',
  'Kind',
  'Match',
  'Station',
  'Team',
  'Scout ID',
  'Scout',
  'Config version',
  'Void',
  'Created',
  'Updated',
  'Uploaded at',
  'Uploaded via',
] as const;
type MetadataColumn = (typeof METADATA_COLUMNS)[number];

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

// ---- Requests ----

export function handleRequest(rawBody: string, port: SpreadsheetPort, env: ScriptEnv): ScriptResponse {
  let request: ScriptRequest;
  try {
    request = JSON.parse(rawBody) as ScriptRequest;
  } catch {
    return { ok: false, error: 'The request was not valid JSON' };
  }
  if (!env.accessCode) return { ok: false, error: 'The script has no ACCESS_CODE property. An Admin needs to set it.' };
  if (typeof request !== 'object' || request === null || request.accessCode !== env.accessCode) {
    return { ok: false, error: 'Wrong access code' };
  }

  switch (request.action) {
    case 'event-bundle':
      try {
        return { ok: true, bundle: buildEventBundle(port, env.crypto) };
      } catch (error) {
        if (error instanceof ScriptError) return { ok: false, error: error.message };
        throw error;
      }
    case 'upload':
      if (!Array.isArray(request.reports)) return { ok: false, error: 'An upload needs a list of Reports' };
      return { ok: true, outcomes: uploadReports(request.reports, port, env.now, hubIdsFrom(request.hubReportIds)) };
    default:
      return { ok: false, error: `Unknown action "${String((request as { action?: unknown }).action)}"` };
  }
}

// ---- Season Sheet ----

/** Rows of a two-column tab as a map from the first column to the second. The header row is skipped. */
function readKeyValueTab(table: Table): Map<string, string> {
  return new Map(
    table
      .slice(1)
      .filter((row) => String(row[0] ?? '').trim() !== '')
      .map((row) => [String(row[0]).trim(), String(row[1] ?? '').trim()]),
  );
}

/** Sets the key's value in a two-column tab, adding the header and the row if needed. */
function withKeyValue(table: Table, header: string[], key: string, value: string): Table {
  const result = table.length > 0 ? table.map((row) => [...row]) : [header];
  const row = result.slice(1).find((r) => String(r[0] ?? '').trim() === key);
  if (row) row[1] = value;
  else result.push([key, value]);
  return rectangular(result);
}

/** The Events tab's rows by Event key. An empty name is ''. */
function readEvents(table: Table): Map<string, { eventSheetId: string; eventName: string }> {
  return new Map(
    table
      .slice(1)
      .filter((row) => String(row[0] ?? '').trim() !== '')
      .map((row) => [
        String(row[0]).trim(),
        { eventSheetId: String(row[1] ?? '').trim(), eventName: String(row[2] ?? '').trim() },
      ]),
  );
}

/** The Event's name in the Events tab, or '' when it has none, so the menu asks for one only when it's missing. */
export function savedEventName(eventKey: string, port: SpreadsheetPort): string {
  return readEvents(port.readSeasonTab(SEASON_TABS.events)).get(eventKey)?.eventName ?? '';
}

/**
 * Records an Event in the Events tab with its Event Sheet ID. The name goes in only when the row has none, so a name
 * an Admin edited is kept. Header cells an older Events tab lacks are added.
 */
function withEvent(table: Table, eventKey: string, eventSheetId: string, eventName: string): Table {
  const result = table.length > 0 ? table.map((row) => [...row]) : [[]];
  EVENTS_HEADER.forEach((name, i) => {
    if (String(result[0][i] ?? '').trim() === '') result[0][i] = name;
  });
  let row = result.slice(1).find((r) => String(r[0] ?? '').trim() === eventKey);
  if (!row) {
    row = [eventKey];
    result.push(row);
  }
  row[1] = eventSheetId;
  if (String(row[2] ?? '').trim() === '') row[2] = eventName;
  return rectangular(result);
}

/** Pads every row to the widest one, as Sheets needs. */
function rectangular(table: Table): Table {
  const width = Math.max(0, ...table.map((row) => row.length));
  return table.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''));
}

/** A cell holding a team or match number, or null. */
function wholeNumber(cell: Cell | undefined): number | null {
  const n = typeof cell === 'string' && /^\s*\d+\s*$/.test(cell) ? Number(cell) : cell;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : null;
}

/** The current event, with its name, or '' when the Events tab has none. */
function currentEvent(port: SpreadsheetPort): { eventKey: string; eventSheetId: string; eventName: string } {
  const eventKey = readKeyValueTab(port.readSeasonTab(SEASON_TABS.settings)).get(CURRENT_EVENT_SETTING);
  if (!eventKey) {
    throw new ScriptError(`No current event. Set "${CURRENT_EVENT_SETTING}" in the Season Sheet's ${SEASON_TABS.settings} tab.`);
  }
  const event = readEvents(port.readSeasonTab(SEASON_TABS.events)).get(eventKey);
  if (!event?.eventSheetId) {
    throw new ScriptError(`The current event ${eventKey} isn't in the ${SEASON_TABS.events} tab. Choose Scouting → Create event.`);
  }
  return { eventKey, ...event };
}

/** Reads the Schedule tab by its header, so an Admin can fill it in or fix it by hand. */
function readSchedule(table: Table): ScheduledMatch[] {
  const [header = [], ...rows] = table;
  const matchColumn = header.indexOf('Match');
  if (matchColumn === -1) return [];
  const schedule: ScheduledMatch[] = [];
  for (const row of rows) {
    const matchNumber = wholeNumber(row[matchColumn]);
    if (matchNumber === null) continue;
    const stations: ScheduledMatch['stations'] = {};
    for (const station of STATIONS) {
      const team = wholeNumber(row[header.indexOf(station)]);
      if (team !== null) stations[station] = team;
    }
    schedule.push({ matchNumber, stations });
  }
  return schedule.sort((a, b) => a.matchNumber - b.matchNumber);
}

/** The event's teams: everyone in the Teams tab, plus anyone in the schedule who is missing from it. */
function readTeams(table: Table, schedule: ScheduledMatch[]): number[] {
  const teams = new Set(table.slice(1).map((row) => wholeNumber(row[0])).filter((n) => n !== null));
  for (const match of schedule) for (const team of Object.values(match.stations)) teams.add(team);
  return [...teams].sort((a, b) => a - b);
}

/** A PIN cell as text. Sheets turns a typed 0123 into the number 123, so numbers get their leading zeros back. */
function pinFrom(cell: Cell | undefined): string {
  if (typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell <= 9999) return String(cell).padStart(4, '0');
  return String(cell ?? '').trim();
}

interface Scout {
  scoutId: string;
  name: string;
  pin: string;
}

/**
 * The Scouts tab, read by its header: Scout ID, Name, PIN. Blank rows are skipped. Any other problem fails the
 * whole read with the row number, so an Admin's typo shows up at once instead of silently locking a Scout out.
 */
function readScouts(table: Table): Scout[] {
  const [header = [], ...rows] = table;
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index === -1) throw new ScriptError(`The ${SEASON_TABS.scouts} tab needs a "${name}" column.`);
    return index;
  };
  if (table.length === 0) return [];
  const [idColumn, nameColumn, pinColumn] = [column('Scout ID'), column('Name'), column('PIN')];

  const scouts: Scout[] = [];
  rows.forEach((row, i) => {
    const where = `${SEASON_TABS.scouts} tab, row ${i + 2}`;
    const scout = {
      scoutId: String(row[idColumn] ?? '').trim(),
      name: String(row[nameColumn] ?? '').trim(),
      pin: pinFrom(row[pinColumn]),
    };
    if (!scout.scoutId && !scout.name && !scout.pin) return;
    if (!scout.scoutId) throw new ScriptError(`${where}: Scout ID is missing.`);
    if (!scout.name) throw new ScriptError(`${where}: Name is missing.`);
    if (!PIN_PATTERN.test(scout.pin)) throw new ScriptError(`${where}: the PIN must be four digits.`);
    if (scouts.some((s) => s.scoutId === scout.scoutId)) {
      throw new ScriptError(`${where}: Scout ID ${scout.scoutId} is used twice.`);
    }
    scouts.push(scout);
  });
  return scouts;
}

/** The roster for the Event Bundle: names and salted PIN hashes, never the PINs. */
function rosterFrom(scouts: Scout[], crypto: ScriptCrypto): RosterEntry[] {
  return scouts.map(({ scoutId, name, pin }) => {
    const salt = crypto.newSalt();
    return { scoutId, name, salt, pinHash: crypto.sha256Hex(pinHashText(salt, pin)) };
  });
}

/** The Event Bundle for the current event. */
export function buildEventBundle(port: SpreadsheetPort, crypto: ScriptCrypto): EventBundle {
  const { eventKey, eventSheetId, eventName } = currentEvent(port);
  const schedule = readSchedule(port.readEventTab(eventSheetId, EVENT_TABS.schedule));
  const teams = readTeams(port.readEventTab(eventSheetId, EVENT_TABS.teams), schedule);
  const roster = rosterFrom(readScouts(port.readSeasonTab(SEASON_TABS.scouts)), crypto);
  const coverage = coverageFrom(port.readEventTab(eventSheetId, REPORT_TABS.match));
  return { eventKey, ...(eventName && { eventName }), teams, schedule, roster, coverage };
}

/**
 * The Coverage snapshot from the Match Reports tab, read by its header. A Void an Admin ticked or typed counts as
 * Void, and rows without a usable match number or Station are skipped.
 */
function coverageFrom(table: Table): CoverageEntry[] {
  const [header = [], ...rows] = table;
  const [matchColumn, stationColumn, voidColumn] = ['Match', 'Station', 'Void'].map((name) => header.indexOf(name));
  if (matchColumn === -1 || stationColumn === -1) return [];
  return countCoverage(
    rows.flatMap((row) => {
      const matchNumber = wholeNumber(row[matchColumn]);
      const station = String(row[stationColumn] ?? '').trim() as Station;
      if (matchNumber === null || !STATIONS.includes(station)) return [];
      return [{ matchNumber, station, voided: voidColumn !== -1 && isVoidCell(row[voidColumn]) }];
    }),
  );
}

// ---- Admin menu ----

/** The event key an Admin typed, cleaned up. Event keys are TBA's: the year, then a short code, like 2026nyro. */
export function eventKeyFrom(typed: string): string {
  const eventKey = typed.trim().toLowerCase();
  if (!/^\d{4}[a-z0-9]+$/.test(eventKey)) {
    throw new ScriptError(`"${typed.trim()}" isn't an event key. Event keys look like 2026nyro.`);
  }
  return eventKey;
}

export function tbaKnowsEvent(eventKey: string, tba: TbaPort): boolean {
  return tba.get(`/event/${eventKey}/simple`) !== null;
}

/** The Event's name on TBA, or '' when TBA doesn't have the Event. */
function tbaEventName(eventKey: string, tba: TbaPort): string {
  const event = tba.get(`/event/${eventKey}/simple`) as { name?: unknown } | null;
  return typeof event?.name === 'string' ? event.name.trim() : '';
}

/** TBA team keys such as "frc578". Keys with a letter suffix (B teams at off-season events) give null. */
function teamFromKey(key: unknown): number | null {
  const match = typeof key === 'string' ? /^frc(\d+)$/.exec(key) : null;
  return match ? Number(match[1]) : null;
}

/** Qualification matches from TBA's /event/{key}/matches/simple. Playoffs are entered by hand. */
export function qualificationSchedule(tbaMatches: unknown): ScheduledMatch[] {
  if (!Array.isArray(tbaMatches)) return [];
  type TbaMatch = { comp_level?: unknown; match_number?: unknown; alliances?: Record<string, { team_keys?: unknown }> };
  return (tbaMatches as TbaMatch[])
    .filter((m) => m.comp_level === 'qm' && typeof m.match_number === 'number')
    .map((m) => {
      const stations: ScheduledMatch['stations'] = {};
      for (const [colour, prefix] of [['red', 'Red'], ['blue', 'Blue']] as const) {
        const keys = m.alliances?.[colour]?.team_keys;
        (Array.isArray(keys) ? keys : []).slice(0, 3).forEach((key, i) => {
          const team = teamFromKey(key);
          if (team !== null) stations[`${prefix} ${i + 1}` as keyof ScheduledMatch['stations']] = team;
        });
      }
      return { matchNumber: m.match_number as number, stations };
    })
    .sort((a, b) => a.matchNumber - b.matchNumber);
}

function scheduleTable(schedule: ScheduledMatch[]): Table {
  return [SCHEDULE_HEADER, ...schedule.map((m) => [m.matchNumber, ...STATIONS.map((s) => m.stations[s] ?? '')])];
}

/**
 * Fetches the team list and qualification schedule from TBA into the Event Sheet. Each tab is replaced only when TBA
 * has something for it, so a schedule an Admin typed in for an event TBA doesn't cover is never wiped.
 */
function fetchFromTba(eventKey: string, eventSheetId: string, port: SpreadsheetPort, tba: TbaPort): string {
  const teamKeys = tba.get(`/event/${eventKey}/teams/keys`);
  const teams = (Array.isArray(teamKeys) ? teamKeys : [])
    .map(teamFromKey)
    .filter((n) => n !== null)
    .sort((a, b) => a - b);
  const schedule = qualificationSchedule(tba.get(`/event/${eventKey}/matches/simple`));

  const replace = (tab: string, table: Table, fresh: boolean) => {
    if (fresh || port.readEventTab(eventSheetId, tab).length === 0) port.writeEventTab(eventSheetId, tab, table);
  };
  replace(EVENT_TABS.teams, [TEAMS_HEADER, ...teams.map((t) => [t])], teams.length > 0);
  replace(EVENT_TABS.schedule, scheduleTable(schedule), schedule.length > 0);

  return [
    teams.length > 0 ? `Fetched ${teams.length} teams from TBA.` : 'TBA has no team list for this event yet.',
    schedule.length > 0
      ? `Fetched ${schedule.length} qualification matches.`
      : 'TBA has no qualification schedule yet. Choose Scouting → Refresh schedule once it is published, or type it into the Schedule tab.',
  ].join(' ');
}

/**
 * "Create event": makes the event's Event Sheet, records it in the Events tab, fetches the schedule and team list,
 * and makes the event current. Running it again for an event that already has an Event Sheet reuses that sheet.
 * The Event's name comes from TBA, or from typedName for an event TBA doesn't have. Returns a message for the Admin.
 */
export function createEvent(typedKey: string, port: SpreadsheetPort, tba: TbaPort, typedName = ''): string {
  const eventKey = eventKeyFrom(typedKey);
  const events = port.readSeasonTab(SEASON_TABS.events);
  const saved = readEvents(events).get(eventKey);
  const eventName = saved?.eventName || tbaEventName(eventKey, tba) || typedName.trim();
  const sheetName = eventName ? `Scouting ${eventKey} ${eventName}` : `Scouting ${eventKey}`;
  const existed = saved !== undefined;
  let eventSheetId = saved?.eventSheetId;
  if (!eventSheetId) eventSheetId = port.createEventSheet(sheetName);
  port.writeSeasonTab(SEASON_TABS.events, withEvent(events, eventKey, eventSheetId, eventName));
  const fetched = fetchFromTba(eventKey, eventSheetId, port, tba);
  const settings = port.readSeasonTab(SEASON_TABS.settings);
  port.writeSeasonTab(SEASON_TABS.settings, withKeyValue(settings, SETTINGS_HEADER, CURRENT_EVENT_SETTING, eventKey));
  // An empty Scouts tab, ready for the Admin to fill in.
  if (port.readSeasonTab(SEASON_TABS.scouts).length === 0) port.writeSeasonTab(SEASON_TABS.scouts, [SCOUTS_HEADER]);

  return [
    existed ? `${eventKey} already had an Event Sheet, so it was reused.` : `Created the Event Sheet "${sheetName}".`,
    fetched,
    `${eventKey} is now the current event. Devices pick it up the next time they refresh.`,
  ].join('\n\n');
}

/**
 * "Refresh schedule": fetches the current event's schedule and team list again, and its name if the Events tab has
 * none. Returns a message for the Admin.
 */
export function refreshSchedule(port: SpreadsheetPort, tba: TbaPort): string {
  const { eventKey, eventSheetId, eventName } = currentEvent(port);
  const tbaName = eventName ? '' : tbaEventName(eventKey, tba);
  if (tbaName) {
    const events = port.readSeasonTab(SEASON_TABS.events);
    port.writeSeasonTab(SEASON_TABS.events, withEvent(events, eventKey, eventSheetId, tbaName));
  }
  return `${eventKey}: ${fetchFromTba(eventKey, eventSheetId, port, tba)}`;
}

// ---- Uploads ----

/** Why a Report can't be stored, or null if it looks right. */
export function problemWithReport(report: unknown): string | null {
  if (typeof report !== 'object' || report === null) return 'not a Report';
  const r = report as Record<string, unknown>;
  const isWhole = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;
  if (typeof r.id !== 'string' || r.id === '' || r.id.length > 100) return 'missing Report ID';
  if (r.kind !== 'match' && r.kind !== 'pit') return 'kind must be match or pit';
  if (typeof r.eventKey !== 'string' || r.eventKey === '') return 'missing event key';
  if (r.status !== 'complete') return 'only Complete Reports can be uploaded';
  if (r.scoutId !== null && typeof r.scoutId !== 'string') return 'bad Scout ID';
  if (!isWhole(r.configVersion, 1)) return 'bad Season Config version';
  if (typeof r.voided !== 'boolean') return 'bad Void flag';
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return 'bad timestamps';
  if (!isWhole(r.teamNumber, 1)) return 'bad team number';
  if (r.kind === 'match') {
    if (!isWhole(r.matchNumber, 1)) return 'bad match number';
    if (!(STATIONS as readonly unknown[]).includes(r.station)) return 'bad Station';
  }
  if (typeof r.answers !== 'object' || r.answers === null || Array.isArray(r.answers)) return 'bad answers';
  for (const [code, value] of Object.entries(r.answers)) {
    if (!CODE_PATTERN.test(code)) return `bad question code "${code}"`;
    const ok =
      ['number', 'boolean', 'string'].includes(typeof value) ||
      (Array.isArray(value) && value.every((v) => typeof v === 'string'));
    if (!ok) return `bad answer for "${code}"`;
  }
  return null;
}

/** Scout names by Scout ID, for the Scout column. Lenient: a Scouts tab with problems still names who it can. */
function scoutNames(table: Table): Map<string, string> {
  const [header = [], ...rows] = table;
  const [idColumn, nameColumn] = [header.indexOf('Scout ID'), header.indexOf('Name')];
  if (idColumn === -1 || nameColumn === -1) return new Map();
  return new Map(rows.map((row) => [String(row[idColumn] ?? '').trim(), String(row[nameColumn] ?? '').trim()]));
}

/** The Report IDs a Hub sent on behalf of other Scouts. Anything that isn't a list of strings counts as none. */
function hubIdsFrom(raw: unknown): ReadonlySet<string> {
  return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
}

export function uploadReports(
  reports: unknown[],
  port: SpreadsheetPort,
  now: Date,
  hubReportIds: ReadonlySet<string> = new Set(),
): UploadOutcome[] {
  const eventSheets = readKeyValueTab(port.readSeasonTab(SEASON_TABS.events));
  const names = scoutNames(port.readSeasonTab(SEASON_TABS.scouts));
  const outcomes = new Map<number, UploadOutcome>();
  const batches = new Map<string, { sheetId: string; tab: string; items: { index: number; report: Report }[] }>();

  reports.forEach((raw, index) => {
    const reportId = typeof (raw as Report)?.id === 'string' ? (raw as Report).id : `#${index + 1}`;
    const problem = problemWithReport(raw);
    if (problem) return outcomes.set(index, { reportId, outcome: 'rejected', reason: problem });
    const report = raw as Report;
    const sheetId = eventSheets.get(report.eventKey);
    if (!sheetId) {
      return outcomes.set(index, { reportId, outcome: 'rejected', reason: `unknown event key "${report.eventKey}"` });
    }
    const tab = REPORT_TABS[report.kind];
    const key = `${sheetId}\u0000${tab}`;
    if (!batches.has(key)) batches.set(key, { sheetId, tab, items: [] });
    batches.get(key)!.items.push({ index, report });
  });

  for (const { sheetId, tab, items } of batches.values()) {
    const result = upsertReports(port.readEventTab(sheetId, tab), items.map((i) => i.report), { now, via: (report) => (hubReportIds.has(report.id) ? 'hub' : 'device'), names });
    if (result.outcomes.includes('stored')) port.writeEventTab(sheetId, tab, result.table);
    items.forEach(({ index, report }, i) => outcomes.set(index, { reportId: report.id, outcome: result.outcomes[i] }));
  }

  return reports.map((_, index) => outcomes.get(index)!);
}

/** Text that starts like a formula is stored as plain text, so a Scout can't put a formula in the Sheet. */
export function toCell(value: Answer | null): Cell {
  if (value === null) return '';
  if (Array.isArray(value)) return toCell(value.join(', '));
  if (typeof value === 'string') return /^[=+\-@]/.test(value) ? `'${value}` : value;
  return value;
}

function metadataFor(report: Report, uploadedAt: string, via: string, scoutName: string): Record<MetadataColumn, Cell> {
  return {
    'Report ID': toCell(report.id),
    Event: toCell(report.eventKey),
    Kind: report.kind,
    Match: report.kind === 'match' ? report.matchNumber : '',
    Station: report.kind === 'match' ? report.station : '',
    Team: report.teamNumber,
    'Scout ID': toCell(report.scoutId),
    Scout: toCell(scoutName),
    'Config version': report.configVersion,
    Void: report.voided,
    Created: toCell(report.createdAt),
    Updated: toCell(report.updatedAt),
    'Uploaded at': uploadedAt,
    'Uploaded via': via,
  };
}

/** A Void cell an Admin ticked or typed into. */
function isVoidCell(cell: Cell | undefined): boolean {
  return cell === true || cell === 1 || (typeof cell === 'string' && /^\s*(true|yes|y|x|void)\s*$/i.test(cell));
}

/**
 * Inserts or updates one row per Report, matched by Report ID.
 * - A copy older than the stored one is ignored as stale. An equal one is written again, so a retry is harmless.
 * - A Void in the Sheet, whether an Admin set it or a device did, is never cleared.
 * - Columns are only ever appended: metadata columns first, then each new question code as it first appears.
 */
export function upsertReports(
  table: Table,
  reports: Report[],
  { now, via, names }: { now: Date; via: (report: Report) => 'device' | 'hub'; names: Map<string, string> },
): { table: Table; outcomes: ('stored' | 'stale')[] } {
  const header: Cell[] = table.length > 0 ? [...table[0]] : [];
  const rows: Cell[][] = table.slice(1).map((row) => [...row]);

  const columnOf = (name: string): number => {
    let index = header.indexOf(name);
    if (index === -1) {
      index = header.length;
      header.push(name);
    }
    return index;
  };
  for (const name of METADATA_COLUMNS) columnOf(name);

  const idColumn = columnOf('Report ID');
  const updatedColumn = columnOf('Updated');
  const voidColumn = columnOf('Void');
  const uploadedAt = now.toISOString();
  const outcomes: ('stored' | 'stale')[] = [];

  for (const report of reports) {
    let row = rows.find((r) => r[idColumn] === report.id);
    if (row && Date.parse(String(row[updatedColumn])) > Date.parse(report.updatedAt)) {
      outcomes.push('stale');
      continue;
    }
    if (!row) {
      row = [];
      rows.push(row);
    }
    const voidInSheet = isVoidCell(row[voidColumn]);

    for (const code of Object.keys(report.answers)) columnOf(code);
    const scoutName = (report.scoutId !== null && names.get(report.scoutId)) || '';
    for (const [name, value] of Object.entries(metadataFor(report, uploadedAt, via(report), scoutName))) row[columnOf(name)] = value;
    row[voidColumn] = report.voided || voidInSheet;
    // Every question-code column reflects this version of the Report, so a cleared answer clears its cell.
    header.forEach((name, i) => {
      if (typeof name === 'string' && CODE_PATTERN.test(name)) row[i] = Object.prototype.hasOwnProperty.call(report.answers, name) ? toCell(report.answers[name]) : '';
    });
    outcomes.push('stored');
  }

  return { table: rectangular([header, ...rows]), outcomes };
}
