/// <reference types="google-apps-script" />
// The thin adapter between the script logic and Google services. Not covered by automated tests:
// check it by hand against a test Season Sheet (docs/apps-script-setup.md).

import { handleRequest, type Cell, type SpreadsheetPort, type Table } from './logic';

function toCell(value: unknown): Cell {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return value === null || value === undefined ? '' : String(value);
}

function readSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet | null): Table {
  if (!sheet || sheet.getLastRow() === 0) return [];
  return sheet.getDataRange().getValues().map((row) => row.map(toCell));
}

function sheetsPort(): SpreadsheetPort {
  const season = SpreadsheetApp.getActiveSpreadsheet();
  return {
    readSeasonTab: (tab) => readSheet(season.getSheetByName(tab)),
    readEventTab: (id, tab) => readSheet(SpreadsheetApp.openById(id).getSheetByName(tab)),
    writeEventTab: (id, tab, table) => {
      if (table.length === 0) return;
      const spreadsheet = SpreadsheetApp.openById(id);
      const sheet = spreadsheet.getSheetByName(tab) ?? spreadsheet.insertSheet(tab);
      sheet.getRange(1, 1, table.length, table[0].length).setValues(table);
      sheet.setFrozenRows(1);
    },
  };
}

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  // One request at a time, so two Uploads can't overwrite each other's rows.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30_000)) return json({ ok: false, error: 'The Season Sheet is busy. Try again in a moment.' });
  try {
    const secrets = { accessCode: PropertiesService.getScriptProperties().getProperty('ACCESS_CODE') };
    return json(handleRequest(e.postData?.contents ?? '', sheetsPort(), secrets, new Date()));
  } catch (error) {
    return json({ ok: false, error: `The script failed: ${error instanceof Error ? error.message : String(error)}` });
  } finally {
    lock.releaseLock();
  }
}
