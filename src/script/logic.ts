// The Apps Script's behaviour, as plain functions over 2D arrays.
// Nothing here touches Google services; the thin adapter in appsScriptAdapter.ts does that.
// See ADR 0001 and the spec's "Upload rules".

import {
  STATIONS,
  type Answer,
  type EventBundle,
  type Report,
  type ScriptRequest,
  type ScriptResponse,
  type UploadOutcome,
} from '../shared/contract';

export type Cell = string | number | boolean;
/** A tab's contents. Row 0 is the header row. An empty tab is []. */
export type Table = Cell[][];

/** Everything the script reads and writes in Google Sheets. */
export interface SpreadsheetPort {
  /** A tab of the Season Sheet, the spreadsheet the script is bound to. */
  readSeasonTab(tab: string): Table;
  readEventTab(eventSheetId: string, tab: string): Table;
  /** Writes the whole table into the tab from A1, creating the tab if needed. */
  writeEventTab(eventSheetId: string, tab: string, table: Table): void;
}

export interface ScriptSecrets {
  /** The team access code, from the script's properties. Null when an Admin hasn't set it. */
  accessCode: string | null;
}

export const SEASON_TABS = { settings: 'Settings', events: 'Events' } as const;
export const REPORT_TABS = { match: 'Match Reports', pit: 'Pit Reports' } as const;
export const CURRENT_EVENT_SETTING = 'Current event';

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

export function handleRequest(rawBody: string, port: SpreadsheetPort, secrets: ScriptSecrets, now: Date): ScriptResponse {
  let request: ScriptRequest;
  try {
    request = JSON.parse(rawBody) as ScriptRequest;
  } catch {
    return { ok: false, error: 'The request was not valid JSON' };
  }
  if (!secrets.accessCode) return { ok: false, error: 'The script has no ACCESS_CODE property. An Admin needs to set it.' };
  if (typeof request !== 'object' || request === null || request.accessCode !== secrets.accessCode) {
    return { ok: false, error: 'Wrong access code' };
  }

  switch (request.action) {
    case 'event-bundle': {
      const bundle = buildEventBundle(port);
      return typeof bundle === 'string' ? { ok: false, error: bundle } : { ok: true, bundle };
    }
    case 'upload':
      if (!Array.isArray(request.reports)) return { ok: false, error: 'An upload needs a list of Reports' };
      return { ok: true, outcomes: uploadReports(request.reports, port, now) };
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

/** The Event Bundle for the current event, or an error message. */
export function buildEventBundle(port: SpreadsheetPort): EventBundle | string {
  const eventKey = readKeyValueTab(port.readSeasonTab(SEASON_TABS.settings)).get(CURRENT_EVENT_SETTING);
  if (!eventKey) return `No current event. Set "${CURRENT_EVENT_SETTING}" in the Season Sheet's ${SEASON_TABS.settings} tab.`;
  // The schedule, teams, roster and Coverage arrive in tickets 04, 05 and 10.
  return { eventKey, teams: [], schedule: [], roster: [], coverage: [] };
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

export function uploadReports(reports: unknown[], port: SpreadsheetPort, now: Date): UploadOutcome[] {
  const eventSheets = readKeyValueTab(port.readSeasonTab(SEASON_TABS.events));
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
    const table = upsertReports(port.readEventTab(sheetId, tab), items.map((i) => i.report), now, 'device');
    port.writeEventTab(sheetId, tab, table);
    for (const { index, report } of items) outcomes.set(index, { reportId: report.id, outcome: 'stored' });
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

function metadataFor(report: Report, uploadedAt: string, via: string): Record<MetadataColumn, Cell> {
  return {
    'Report ID': toCell(report.id),
    Event: toCell(report.eventKey),
    Kind: report.kind,
    Match: report.kind === 'match' ? report.matchNumber : '',
    Station: report.kind === 'match' ? report.station : '',
    Team: report.teamNumber,
    'Scout ID': toCell(report.scoutId),
    Scout: '', // Filled from the roster once login exists (ticket 05).
    'Config version': report.configVersion,
    Void: report.voided,
    Created: toCell(report.createdAt),
    Updated: toCell(report.updatedAt),
    'Uploaded at': uploadedAt,
    'Uploaded via': via,
  };
}

/**
 * Inserts or updates one row per Report, matched by Report ID.
 * Columns are only ever appended: metadata columns first, then each new question code as it first appears.
 */
export function upsertReports(table: Table, reports: Report[], now: Date, via: string): Table {
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
  const uploadedAt = now.toISOString();

  for (const report of reports) {
    for (const code of Object.keys(report.answers)) columnOf(code);

    let row = rows.find((r) => r[idColumn] === report.id);
    if (!row) {
      row = [];
      rows.push(row);
    }
    for (const [name, value] of Object.entries(metadataFor(report, uploadedAt, via))) row[columnOf(name)] = value;
    // Every question-code column reflects this version of the Report, so a cleared answer clears its cell.
    header.forEach((name, i) => {
      if (typeof name === 'string' && CODE_PATTERN.test(name)) row[i] = Object.prototype.hasOwnProperty.call(report.answers, name) ? toCell(report.answers[name]) : '';
    });
  }

  return [header, ...rows].map((row) => Array.from({ length: header.length }, (_, i) => row[i] ?? ''));
}
