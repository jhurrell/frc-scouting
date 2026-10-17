import type { SpreadsheetPort, Table } from './logic';

/** Season and Event Sheets held in memory, for tests. */
export class MemoryPort implements SpreadsheetPort {
  readonly seasonTabs = new Map<string, Table>();
  /** Keyed by Event Sheet ID, then tab name. */
  readonly eventSheets = new Map<string, Map<string, Table>>();

  readSeasonTab(tab: string): Table {
    return structuredClone(this.seasonTabs.get(tab) ?? []);
  }

  readEventTab(eventSheetId: string, tab: string): Table {
    const sheet = this.eventSheets.get(eventSheetId);
    if (!sheet) throw new Error(`No Event Sheet ${eventSheetId}`);
    return structuredClone(sheet.get(tab) ?? []);
  }

  writeEventTab(eventSheetId: string, tab: string, table: Table): void {
    const sheet = this.eventSheets.get(eventSheetId);
    if (!sheet) throw new Error(`No Event Sheet ${eventSheetId}`);
    sheet.set(tab, structuredClone(table));
  }

  /** The tab as a list of objects keyed by header, for readable assertions. */
  rows(eventSheetId: string, tab: string): Record<string, unknown>[] {
    const [header = [], ...rows] = this.readEventTab(eventSheetId, tab);
    return rows.map((row) => Object.fromEntries(header.map((name, i) => [String(name), row[i]])));
  }
}
