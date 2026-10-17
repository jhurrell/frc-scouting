import Dexie, { type Table } from 'dexie';
import type { EventBundle, Report } from '../shared/contract';

export interface Settings {
  eventBundle: EventBundle;
  accessCode: string;
}

export interface SettingRow<K extends keyof Settings = keyof Settings> {
  key: K;
  value: Settings[K];
}

/** The version of a Report the Season Sheet last stored. A Report is Uploaded when this matches its current updatedAt. */
export interface UploadRow {
  reportId: string;
  updatedAt: string;
}

export class ScoutingDb extends Dexie {
  reports!: Table<Report, string>;
  settings!: Table<SettingRow, string>;
  uploads!: Table<UploadRow, string>;

  constructor(name = 'scouting') {
    super(name);
    this.version(1).stores({
      reports: 'id, status, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({
      uploads: 'reportId',
    });
  }
}
