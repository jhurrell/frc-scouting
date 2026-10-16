import Dexie, { type Table } from 'dexie';
import type { EventBundle, Report } from '../shared/contract';

export interface Settings {
  eventBundle: EventBundle;
}

export interface SettingRow<K extends keyof Settings = keyof Settings> {
  key: K;
  value: Settings[K];
}

export class ScoutingDb extends Dexie {
  reports!: Table<Report, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'scouting') {
    super(name);
    this.version(1).stores({
      reports: 'id, status, updatedAt',
      settings: 'key',
    });
  }
}
