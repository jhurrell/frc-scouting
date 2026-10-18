import Dexie, { type Table } from 'dexie';
import type { EventBundle, Report } from '../shared/contract';

/** How the last Upload attempt went. Kept so every screen can show it, and so it survives a reload. */
export interface UploadStatus {
  /** When the last attempt finished. ISO 8601. */
  at: string;
  /** Why the last attempt failed as a whole, or null when it reached the Season Sheet. */
  error: string | null;
  /** Reports the Season Sheet refused, and the version it refused. A later change to a Report makes its rejection old news. */
  rejections: { reportId: string; updatedAt: string; reason: string }[];
}

export interface Settings {
  eventBundle: EventBundle;
  accessCode: string;
  /** The logged-in Scout. Absent when nobody is logged in. */
  scoutId: string;
  uploadStatus: UploadStatus;
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

/** The version of a Report its Scout handed off to a Hub by QR. The Hub Uploads it, so it isn't pending here. */
export interface HandoffRow {
  reportId: string;
  updatedAt: string;
}

/** A Report this device received as a Hub, on behalf of another Scout. */
export interface HubReportRow {
  reportId: string;
  /** When it was last scanned in. ISO 8601. */
  receivedAt: string;
}

export class ScoutingDb extends Dexie {
  reports!: Table<Report, string>;
  settings!: Table<SettingRow, string>;
  uploads!: Table<UploadRow, string>;
  handoffs!: Table<HandoffRow, string>;
  hubReports!: Table<HubReportRow, string>;

  constructor(name = 'scouting') {
    super(name);
    this.version(1).stores({
      reports: 'id, status, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({
      uploads: 'reportId',
    });
    this.version(3).stores({
      handoffs: 'reportId',
      hubReports: 'reportId, receivedAt',
    });
  }
}
