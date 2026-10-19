/// <reference types="node" />
import { createHash } from 'node:crypto';
import type { Cell, ScriptCrypto, SpreadsheetPort, Table, TbaPort } from './logic';

/** Season and Event Sheets held in memory, for tests. */
export class MemoryPort implements SpreadsheetPort {
  readonly seasonTabs = new Map<string, Table>();
  /** Keyed by Event Sheet ID, then tab name. */
  readonly eventSheets = new Map<string, Map<string, Table>>();
  /** Names of the Event Sheets created through createEventSheet, by ID. */
  readonly eventSheetNames = new Map<string, string>();

  /** As Sheets reads it: a HYPERLINK formula reads as the text it shows. */
  readSeasonTab(tab: string): Table {
    return (this.seasonTabs.get(tab) ?? []).map((row) => row.map(shownText));
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

/** The text Sheets shows for a cell: a HYPERLINK formula, written as logic.ts writes it, shows its label. */
function shownText(cell: Cell): Cell {
  const link = typeof cell === 'string' ? /^=HYPERLINK\(".*", "(.*)"\)$/.exec(cell) : null;
  return link ? link[1] : cell;
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

/** Real SHA-256 from Node, with predictable salts (salt-1, salt-2, …) for tests. */
export class NodeCrypto implements ScriptCrypto {
  private salts = 0;

  sha256Hex(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  newSalt(): string {
    return `salt-${++this.salts}`;
  }
}
