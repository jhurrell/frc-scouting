import type { SpreadsheetPort, Table, TbaPort } from './logic';

/** Season and Event Sheets held in memory, for tests. */
export class MemoryPort implements SpreadsheetPort {
  readonly seasonTabs = new Map<string, Table>();
  /** Keyed by Event Sheet ID, then tab name. */
  readonly eventSheets = new Map<string, Map<string, Table>>();
  /** Names of the Event Sheets created through createEventSheet, by ID. */
  readonly eventSheetNames = new Map<string, string>();

  readSeasonTab(tab: string): Table {
    return structuredClone(this.seasonTabs.get(tab) ?? []);
  }

  writeSeasonTab(tab: string, table: Table): void {
    this.seasonTabs.set(tab, structuredClone(table));
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

  createEventSheet(name: string): string {
    const id = `sheet-${this.eventSheets.size + 1}`;
    this.eventSheets.set(id, new Map());
    this.eventSheetNames.set(id, name);
    return id;
  }

  /** The tab as a list of objects keyed by header, for readable assertions. */
  rows(eventSheetId: string, tab: string): Record<string, unknown>[] {
    const [header = [], ...rows] = this.readEventTab(eventSheetId, tab);
    return rows.map((row) => Object.fromEntries(header.map((name, i) => [String(name), row[i]])));
  }
}

/** The Blue Alliance's API held in memory, for tests. Paths it doesn't have answer "not found". */
export class MemoryTba implements TbaPort {
  readonly responses = new Map<string, unknown>();
  /** Every path requested. */
  readonly requested: string[] = [];

  get(path: string): unknown {
    this.requested.push(path);
    return structuredClone(this.responses.get(path) ?? null);
  }
}
