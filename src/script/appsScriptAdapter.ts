/// <reference types="google-apps-script" />
// The thin adapter between the script logic and Google services. Not covered by automated tests:
// check it by hand against a test Season Sheet (docs/apps-script-setup.md).

import {
  createEvent,
  EVENT_TABS,
  eventKeyFrom,
  handleRequest,
  refreshSchedule,
  REPORT_TABS,
  savedEventName,
  ScriptError,
  tbaKnowsEvent,
  type Cell,
  type ScriptCrypto,
  type SpreadsheetPort,
  type Table,
  type TbaPort,
} from './logic';

const TBA_API = 'https://www.thebluealliance.com/api/v3';

function toCell(value: unknown): Cell {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return value === null || value === undefined ? '' : String(value);
}

function readSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet | null): Table {
  if (!sheet || sheet.getLastRow() === 0) return [];
  return sheet.getDataRange().getValues().map((row) => row.map(toCell));
}

function writeSheet(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, tab: string, table: Table): void {
  const sheet = spreadsheet.getSheetByName(tab) ?? spreadsheet.insertSheet(tab);
  sheet.clearContents();
  if (table.length === 0) return;
  sheet.getRange(1, 1, table.length, table[0].length).setValues(table);
  sheet.setFrozenRows(1);
  // In a Report tab, the Void column is checkboxes, so an Admin can Void a Report with one tick.
  const voidColumn = table[0].indexOf('Void');
  const isReportTab = (Object.values(REPORT_TABS) as string[]).includes(tab);
  if (isReportTab && voidColumn !== -1 && table.length > 1) {
    sheet.getRange(2, voidColumn + 1, table.length - 1, 1).insertCheckboxes();
  }
}

function sheetsPort(): SpreadsheetPort {
  const season = SpreadsheetApp.getActiveSpreadsheet();
  return {
    readSeasonTab: (tab) => readSheet(season.getSheetByName(tab)),
    writeSeasonTab: (tab, table) => writeSheet(season, tab, table),
    readEventTab: (id, tab) => readSheet(SpreadsheetApp.openById(id).getSheetByName(tab)),
    writeEventTab: (id, tab, table) => writeSheet(SpreadsheetApp.openById(id), tab, table),
    createEventSheet: (name) => {
      const spreadsheet = SpreadsheetApp.create(name);
      spreadsheet.getSheets()[0].setName(EVENT_TABS.schedule);
      // Keep the season's spreadsheets together in the Season Sheet's folder.
      const folders = DriveApp.getFileById(season.getId()).getParents();
      if (folders.hasNext()) DriveApp.getFileById(spreadsheet.getId()).moveTo(folders.next());
      return spreadsheet.getId();
    },
  };
}

function tbaPort(): TbaPort {
  const key = PropertiesService.getScriptProperties().getProperty('TBA_KEY');
  if (!key) throw new ScriptError('The script has no TBA_KEY property. See docs/apps-script-setup.md.');
  // Remembered for one menu action, so checking the event and then creating it asks TBA once.
  const answers = new Map<string, unknown>();
  return {
    get: (path) => {
      if (answers.has(path)) return answers.get(path);
      const response = UrlFetchApp.fetch(TBA_API + path, { headers: { 'X-TBA-Auth-Key': key }, muteHttpExceptions: true });
      const status = response.getResponseCode();
      if (status !== 200 && status !== 404) throw new ScriptError(`The Blue Alliance answered ${status} for ${path}.`);
      answers.set(path, status === 404 ? null : JSON.parse(response.getContentText()));
      return answers.get(path);
    },
  };
}

const appsScriptCrypto: ScriptCrypto = {
  sha256Hex: (text) =>
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
      .map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0'))
      .join(''),
  newSalt: () => Utilities.getUuid(),
};

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/** Runs one change at a time, so two Uploads, or an Upload and a menu action, can't overwrite each other. */
function withLock<T>(busy: () => T, work: () => T): T {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30_000)) return busy();
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  return withLock(
    () => json({ ok: false, error: 'The Season Sheet is busy. Try again in a moment.' }),
    () => {
      try {
        const env = {
          accessCode: PropertiesService.getScriptProperties().getProperty('ACCESS_CODE'),
          now: new Date(),
          crypto: appsScriptCrypto,
        };
        return json(handleRequest(e.postData?.contents ?? '', sheetsPort(), env));
      } catch (error) {
        return json({ ok: false, error: `The script failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  );
}

// ---- The Scouting menu in the Season Sheet ----

export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Scouting')
    .addItem('Create event…', 'menuCreateEvent')
    .addItem('Refresh schedule', 'menuRefreshSchedule')
    .addToUi();
}

/** Shows the action's message, or its error, in a dialog. Questions to the Admin go in `ask`, outside the lock. */
function runMenuAction<T>(title: string, ask: () => T | null, action: (answers: T) => string): void {
  const ui = SpreadsheetApp.getUi();
  try {
    const answers = ask();
    if (answers === null) return;
    const message = withLock(() => 'The Season Sheet is busy. Try again in a moment.', () => action(answers));
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert(title, error instanceof Error ? error.message : String(error), ui.ButtonSet.OK);
  }
}

export function menuCreateEvent(): void {
  const ui = SpreadsheetApp.getUi();
  runMenuAction(
    'Create event',
    () => {
      const answer = ui.prompt('Create event', 'Event key from The Blue Alliance, for example 2026nyro:', ui.ButtonSet.OK_CANCEL);
      if (answer.getSelectedButton() !== ui.Button.OK) return null;
      const eventKey = eventKeyFrom(answer.getResponseText());
      const tba = tbaPort();
      if (!tbaKnowsEvent(eventKey, tba)) {
        const choice = ui.alert(
          'Create event',
          `The Blue Alliance has no event ${eventKey}. Check the key for typos.\n\n` +
            'Create it anyway, and type the teams and schedule into its Event Sheet by hand?',
          ui.ButtonSet.YES_NO,
        );
        if (choice !== ui.Button.YES) return null;
        if (!savedEventName(eventKey, sheetsPort())) {
          const nameAnswer = ui.prompt(
            'Create event',
            'Event name, for example Rochester Rumble (leave blank to show only the event key):',
            ui.ButtonSet.OK_CANCEL,
          );
          if (nameAnswer.getSelectedButton() !== ui.Button.OK) return null;
          return { eventKey, tba, eventName: nameAnswer.getResponseText() };
        }
      }
      return { eventKey, tba, eventName: '' };
    },
    ({ eventKey, tba, eventName }) => createEvent(eventKey, sheetsPort(), tba, eventName),
  );
}

export function menuRefreshSchedule(): void {
  runMenuAction(
    'Refresh schedule',
    () => tbaPort(),
    (tba) => refreshSchedule(sheetsPort(), tba),
  );
}
