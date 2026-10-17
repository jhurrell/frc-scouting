// The shared contract between the app and the Apps Script.
// Both sides build on these types so the fake Sheet gateway and the script logic can't drift apart.
// Vocabulary follows GLOSSARY.md.

export const STATIONS = ['Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'] as const;
export type Station = (typeof STATIONS)[number];

export const MATCH_STAGES = ['Pre-Match', 'Autonomous', 'Teleop', 'Endgame', 'Post-Match'] as const;
export type MatchStage = (typeof MATCH_STAGES)[number];

// ---- Season Config ----

export type QuestionType = 'counter' | 'yes-no' | 'single-choice' | 'multiple-choice' | 'number' | 'text';

export interface Question {
  /** Stable code, used as the Event Sheet column header. */
  code: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  /** For single-choice and multiple-choice. */
  options?: string[];
  /** For counter and number. */
  min?: number;
  max?: number;
}

export interface PitGroup {
  name: string;
  questions: Question[];
}

export interface SeasonConfig {
  season: string;
  version: number;
  match: {
    /** Questions per Match Stage. Stages are always shown in MATCH_STAGES order; a Stage may be absent. */
    stages: Partial<Record<MatchStage, Question[]>>;
  };
  pit: {
    groups: PitGroup[];
  };
}

// ---- Reports ----

export type Answer = number | boolean | string | string[];

export type ReportStatus = 'draft' | 'complete';

interface ReportBase {
  /** Generated on the device when the Report is created. */
  id: string;
  eventKey: string;
  /** The logged-in Scout. Null until login exists (ticket 05). */
  scoutId: string | null;
  configVersion: number;
  status: ReportStatus;
  voided: boolean;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  /** Keyed by question code. */
  answers: Record<string, Answer>;
}

export interface MatchReport extends ReportBase {
  kind: 'match';
  matchNumber: number;
  station: Station;
  teamNumber: number;
}

export interface PitReport extends ReportBase {
  kind: 'pit';
  teamNumber: number;
}

export type Report = MatchReport | PitReport;

// ---- Event Bundle ----

export interface ScheduledMatch {
  matchNumber: number;
  /** Team number at each Station. A Station is missing when the schedule doesn't name a team for it. */
  stations: Partial<Record<Station, number>>;
}

export interface RosterEntry {
  scoutId: string;
  name: string;
  /** Salted SHA-256 of the Scout's PIN. Never the PIN itself. */
  pinHash: string;
  salt: string;
}

export interface CoverageEntry {
  matchNumber: number;
  station: Station;
  /** Count of non-Void Match Reports. */
  count: number;
}

export interface EventBundle {
  /** The current event. New Reports take this event key. */
  eventKey: string;
  /** Sorted team numbers. */
  teams: number[];
  /** Qualification matches only. */
  schedule: ScheduledMatch[];
  roster: RosterEntry[];
  coverage: CoverageEntry[];
}

// ---- Sheet gateway ----

export type UploadOutcome =
  | { reportId: string; outcome: 'stored' }
  | { reportId: string; outcome: 'stale' }
  | { reportId: string; outcome: 'rejected'; reason: string };

export interface SheetGateway {
  /** Throws SheetGatewayError when the request can't be made or is refused, for example for a wrong access code. */
  fetchEventBundle(accessCode: string): Promise<EventBundle>;
  /** Returns one outcome per Report. Throws SheetGatewayError when the whole batch is refused. */
  upload(accessCode: string, reports: Report[]): Promise<UploadOutcome[]>;
}

export class SheetGatewayError extends Error {}

// ---- Apps Script web app protocol ----
// Every request is a POST whose body is a JSON ScriptRequest. The access code travels in the body, never the URL.

export type ScriptRequest =
  | { action: 'event-bundle'; accessCode: string }
  | { action: 'upload'; accessCode: string; reports: Report[] };

export type ScriptResponse =
  | { ok: true; bundle: EventBundle }
  | { ok: true; outcomes: UploadOutcome[] }
  | { ok: false; error: string };
