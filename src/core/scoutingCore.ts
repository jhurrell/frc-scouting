import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  countCoverage,
  PIN_PATTERN,
  STATIONS,
  pinHashText,
  type Answer,
  type CoverageEntry,
  type EventBundle,
  type MatchReport,
  type PitReport,
  type Question,
  type ScheduledMatch,
  type Report,
  type RosterEntry,
  type SeasonConfig,
  type SheetGateway,
  type Station,
} from '../shared/contract';
import type { ScoutingDb, UploadRow, UploadStatus } from './db';
import { decodeReport, encodeReport, envelopeConfigVersion, QrCodecError } from './qrCodec';
import { formSections, validateSeasonConfigs } from './seasonConfig';

export class ScoutingError extends Error {}

/** Thrown by complete() when required questions are unanswered. */
export class UnansweredRequiredError extends ScoutingError {
  constructor(readonly codes: string[]) {
    super(`Still to answer: ${codes.join(', ')}`);
  }
}

/** The device's connection, as far as the browser knows it. */
export interface Network {
  isOnline(): boolean;
  /** Calls the listener whenever the connection comes back. */
  onOnline(listener: () => void): void;
}

export interface ScoutingCoreDeps {
  db: ScoutingDb;
  gateway: SheetGateway;
  /**
   * Watches the connection for automatic Uploads. Without it, Reports Upload only when asked, which keeps tests
   * that don't care about automatic Upload free of background work.
   */
  network?: Network;
  /** Every Season Config version of the current season, as loaded from data. Validated here; new Reports use the highest version. */
  seasonConfigs: readonly unknown[];
  now?: () => Date;
  newId?: () => string;
}

export interface NewMatchReport {
  matchNumber: number;
  station: Station;
  /** Leave out to fill it in from the schedule. Needed when the schedule has no team for this match and Station. */
  teamNumber?: number;
}

export interface NewPitReport {
  /** Chosen from the Event Bundle's team list, or typed for a team that isn't on it yet. */
  teamNumber: number;
}

export interface ListedReport {
  report: Report;
  /** True when the Season Sheet holds this exact version of the Report. */
  uploaded: boolean;
  /** True when the Scout handed this exact version off to a Hub by QR. */
  handedOff: boolean;
  /** Why the Season Sheet refused this version of the Report, if it did. */
  rejection?: string;
}

/** What happened to a scan at the Hub. */
export type ScanOutcome =
  /** New to this Hub, and now waiting to Upload. */
  | 'added'
  /** A newer copy of a Report the Hub had. It replaced the older one. */
  | 'updated'
  /** The Hub already had this version. Nothing changed. */
  | 'duplicate'
  /** The Hub already had a newer version. Nothing changed. */
  | 'older';

export interface ScanResult {
  outcome: ScanOutcome;
  report: Report;
  /** The Scout who made the Report, from the roster, or their Scout ID if the roster doesn't have them. */
  scoutName: string;
}

/** A Report received at this Hub, for the Hub screen. */
export interface HubReport {
  report: Report;
  scoutName: string;
  receivedAt: string;
  uploaded: boolean;
}

/** One Station in one match on the Coverage grid. */
export interface CoverageCell {
  /** The team the schedule puts at this Station, if it names one. */
  teamNumber?: number;
  /** Non-Void Match Reports for this match and Station. */
  count: number;
}

export interface CoverageRow {
  matchNumber: number;
  /** False for a match the schedule doesn't have, such as a playoff, that has Match Reports anyway. */
  scheduled: boolean;
  stations: Record<Station, CoverageCell>;
}

export interface Coverage {
  eventKey: string;
  /**
   * 'everyone': from every Scout's Uploads, in the Event Bundle just downloaded. 'this-device': only the Complete
   * Match Reports on this device, including any received as a Hub, because the Season Sheet couldn't be reached.
   */
  source: 'everyone' | 'this-device';
  /** Why Coverage is from this device only. */
  reason?: string;
  /** Every scheduled match, plus any other match with Match Reports, in match order. */
  rows: CoverageRow[];
}

/** The Coverage grid: the schedule's matches by Station, with the counts filled in. */
function coverageGrid(bundle: EventBundle, counts: CoverageEntry[]): CoverageRow[] {
  const scheduled = new Map(bundle.schedule.map((m) => [m.matchNumber, m]));
  const matchNumbers = new Set([...scheduled.keys(), ...counts.map((c) => c.matchNumber)]);
  return [...matchNumbers]
    .sort((a, b) => a - b)
    .map((matchNumber) => {
      const match = scheduled.get(matchNumber);
      const stations = Object.fromEntries(
        STATIONS.map((station) => {
          const teamNumber = match?.stations[station];
          const count = counts.find((c) => c.matchNumber === matchNumber && c.station === station)?.count ?? 0;
          return [station, teamNumber === undefined ? { count } : { teamNumber, count }];
        }),
      ) as Record<Station, CoverageCell>;
      return { matchNumber, scheduled: match !== undefined, stations };
    });
}

export interface UploadSummary {
  stored: number;
  /** Reports the Sheet already held a newer copy of. Nothing more to send for them. */
  stale: number;
  rejected: { reportId: string; reason: string }[];
}

export type ScoutingCore = ReturnType<typeof createScoutingCore>;

// The core avoids crypto.subtle and crypto.randomUUID: browsers only offer them on a secure page (HTTPS or
// localhost), and a phone testing against the dev server over the local network isn't one.

/** The PIN hash the script puts in the roster: lowercase hex SHA-256 of pinHashText(salt, pin). */
export function hashPin(salt: string, pin: string): string {
  return bytesToHex(sha256(utf8ToBytes(pinHashText(salt, pin))));
}

/** A random version 4 UUID, made from crypto.getRandomValues, which works on any page. */
export function newReportId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isAnswered(value: Answer | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function checkAnswer(question: Question, value: Answer): void {
  const fail = (rule: string) => {
    throw new ScoutingError(`"${question.label}" ${rule}`);
  };
  switch (question.type) {
    case 'counter':
    case 'number': {
      const whole = question.type === 'counter';
      const min = question.min ?? (whole ? 0 : -Infinity);
      const max = question.max ?? Infinity;
      if (typeof value !== 'number' || !Number.isFinite(value) || (whole && !Number.isInteger(value))) {
        fail(whole ? 'must be a whole number' : 'must be a number');
      }
      if ((value as number) < min || (value as number) > max) fail(`must be from ${min} to ${max}`);
      return;
    }
    case 'yes-no':
      if (typeof value !== 'boolean') fail('must be yes or no');
      return;
    case 'single-choice':
      if (typeof value !== 'string' || !question.options!.includes(value)) fail('must be one of its options');
      return;
    case 'multiple-choice':
      if (
        !Array.isArray(value) ||
        !value.every((v) => question.options!.includes(v)) ||
        new Set(value).size !== value.length
      ) {
        fail('must be a selection of its options');
      }
      return;
    case 'text':
      if (typeof value !== 'string') fail('must be text');
      return;
  }
}

/** All scouting behaviour lives here. UI screens call these operations and nothing else. */
export function createScoutingCore({
  db,
  gateway,
  network,
  seasonConfigs: rawConfigs,
  now = () => new Date(),
  newId = newReportId,
}: ScoutingCoreDeps) {
  const seasonConfigs = validateSeasonConfigs(rawConfigs);
  const latestConfig = seasonConfigs.reduce((a, b) => (b.version > a.version ? b : a));

  function seasonConfigFor(version: number): SeasonConfig {
    const config = seasonConfigs.find((c) => c.version === version);
    if (!config) throw new ScoutingError(`Unknown Season Config version ${version}`);
    return config;
  }

  function questionsFor(report: Report): Question[] {
    return formSections(seasonConfigFor(report.configVersion), report.kind).flatMap((section) => section.questions);
  }

  function findQuestion(report: Report, code: string): Question {
    const question = questionsFor(report).find((q) => q.code === code);
    if (!question) throw new ScoutingError(`Unknown question "${code}"`);
    return question;
  }

  function unansweredRequiredIn(report: Report): string[] {
    return questionsFor(report)
      .filter((q) => q.required && !isAnswered(report.answers[q.code]))
      .map((q) => q.code);
  }

  async function loadReport(reportId: string): Promise<Report> {
    const report = await db.reports.get(reportId);
    if (!report) throw new ScoutingError(`No Report ${reportId}`);
    return report;
  }

  /** The logged-in Scout, or undefined. A Scout who has left the roster counts as logged out. */
  async function currentScout(): Promise<RosterEntry | undefined> {
    const row = await db.settings.get('scoutId');
    if (!row) return undefined;
    return (await getEventBundle())?.roster.find((s) => s.scoutId === row.value);
  }

  async function requireScout(): Promise<RosterEntry> {
    const scout = await currentScout();
    if (!scout) throw new ScoutingError('Log in first');
    return scout;
  }

  /** A Report the logged-in Scout may change: their own, and not Void. */
  async function loadOwn(reportId: string): Promise<Report> {
    const [report, scout] = await Promise.all([loadReport(reportId), requireScout()]);
    if (report.scoutId !== scout.scoutId) throw new ScoutingError('Only the Scout who made a Report can change it');
    return report;
  }

  async function loadChangeable(reportId: string): Promise<Report> {
    const report = await loadOwn(reportId);
    if (report.voided) throw new ScoutingError("A Void Report can't be changed");
    return report;
  }

  /**
   * Reads, changes and writes a Report's answers in one transaction, so rapid taps never lose or double a change.
   * A Complete Report stays Complete, so a change that would leave a required question unanswered is refused.
   * Every change gives the Report a new updated time, which puts a Complete Report back in the Upload queue.
   */
  async function changeAnswers(
    reportId: string,
    change: (report: Report) => Record<string, Answer> | undefined,
  ): Promise<void> {
    await db.transaction('rw', db.reports, db.settings, async () => {
      const report = await loadChangeable(reportId);
      const answers = change(report);
      if (!answers) return;
      const changed = { ...report, answers, updatedAt: now().toISOString() };
      if (changed.status === 'complete') {
        const missing = unansweredRequiredIn(changed);
        if (missing.length > 0) throw new UnansweredRequiredError(missing);
      }
      await db.reports.put(changed);
    });
  }

  /** What every new Draft starts with: the current event, the logged-in Scout and the latest Season Config. */
  async function draftBase() {
    const bundle = await getEventBundle();
    if (!bundle) throw new ScoutingError('No Event Bundle on this device yet');
    const scout = await requireScout();
    const timestamp = now().toISOString();
    return {
      bundle,
      base: {
        id: newId(),
        eventKey: bundle.eventKey,
        scoutId: scout.scoutId,
        configVersion: latestConfig.version,
        status: 'draft' as const,
        voided: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        answers: {},
      },
    };
  }

  /** Saves a new Draft. Counters start at their minimum, so a counter always has an answer. */
  async function addDraft<R extends Report>(report: R): Promise<R> {
    for (const q of questionsFor(report)) {
      if (q.type === 'counter') report.answers[q.code] = q.min ?? 0;
    }
    await db.reports.add(report);
    return report;
  }

  function checkTeamNumber(teamNumber: number): void {
    if (!Number.isInteger(teamNumber) || teamNumber < 1) throw new ScoutingError('Team number must be 1 or more');
  }

  async function getUploadStatus(): Promise<UploadStatus | undefined> {
    return (await db.settings.get('uploadStatus'))?.value as UploadStatus | undefined;
  }

  /**
   * One Upload attempt: sends every pending Report in one batch and records how it went. Throws when the whole
   * batch fails, after recording the reason. Earlier rejections are kept then, because nothing new was learned.
   */
  async function attemptUpload(): Promise<UploadSummary> {
    const accessCode = await getAccessCode();
    const pending = await pendingUploads();
    if (pending.length === 0) return { stored: 0, stale: 0, rejected: [] };

    const received = new Set((await db.hubReports.bulkGet(pending.map((r) => r.id))).map((row) => row?.reportId));
    const hubReportIds = pending.filter((r) => received.has(r.id)).map((r) => r.id);

    let outcomes;
    try {
      outcomes = await gateway.upload(accessCode, pending, hubReportIds);
    } catch (error) {
      const previous = await getUploadStatus();
      const status: UploadStatus = {
        at: now().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        rejections: previous?.rejections ?? [],
      };
      await db.settings.put({ key: 'uploadStatus', value: status });
      throw error;
    }

    const sent = new Map(pending.map((r) => [r.id, r.updatedAt]));
    const summary: UploadSummary = { stored: 0, stale: 0, rejected: [] };
    const stored: UploadRow[] = [];
    const status: UploadStatus = { at: now().toISOString(), error: null, rejections: [] };
    for (const outcome of outcomes) {
      const updatedAt = sent.get(outcome.reportId);
      if (updatedAt === undefined) continue;
      if (outcome.outcome === 'rejected') {
        summary.rejected.push({ reportId: outcome.reportId, reason: outcome.reason });
        status.rejections.push({ reportId: outcome.reportId, updatedAt, reason: outcome.reason });
      } else {
        // Stored, or stale because the Sheet already has a newer copy: either way there's nothing more to send.
        stored.push({ reportId: outcome.reportId, updatedAt });
        summary[outcome.outcome] += 1;
      }
    }
    await db.transaction('rw', db.uploads, db.settings, async () => {
      await db.uploads.bulkPut(stored);
      await db.settings.put({ key: 'uploadStatus', value: status });
    });
    return summary;
  }

  // Uploads run one at a time. A request made while one runs waits for it, then runs once more, so Reports
  // completed meanwhile still go. Requests made while one is already waiting share that next run.
  let running: Promise<UploadSummary> | null = null;
  let next: Promise<UploadSummary> | null = null;

  function uploadPending(): Promise<UploadSummary> {
    if (next) return next;
    if (!running) {
      running = attemptUpload().finally(() => (running = null));
      return running;
    }
    next = running
      .catch(() => undefined)
      .then(() => {
        next = null;
        return uploadPending();
      });
    return next;
  }

  /**
   * An automatic Upload: only with a network to watch, while it says the device is online, and when there's
   * something to send. Failures are recorded in the Upload status rather than thrown, since nobody is waiting.
   */
  async function uploadInBackground(): Promise<void> {
    if (!network?.isOnline()) return;
    try {
      if ((await pendingUploads()).length === 0) return;
      await uploadPending();
    } catch {
      // Already recorded in the Upload status.
    }
  }

  network?.onOnline(() => void uploadInBackground());

  async function getEventBundle(): Promise<EventBundle | undefined> {
    const row = await db.settings.get('eventBundle');
    return row?.value as EventBundle | undefined;
  }

  async function refreshEventBundle(): Promise<EventBundle> {
    const bundle = await gateway.fetchEventBundle(await getAccessCode());
    await db.settings.put({ key: 'eventBundle', value: bundle });
    return bundle;
  }

  async function getAccessCode(): Promise<string> {
    const row = await db.settings.get('accessCode');
    if (!row) throw new ScoutingError('This device has no access code yet. An Admin needs to set it up.');
    return row.value as string;
  }

  /**
   * Complete Reports the Season Sheet doesn't hold in their current version, leaving out those handed off to a
   * Hub, which Uploads them instead. Drafts never leave the device. (All reads start before the first await, so
   * a live query sees them; see listReports.)
   */
  async function pendingUploads(): Promise<Report[]> {
    const [complete, uploadRows, handoffRows] = await Promise.all([
      db.reports.where('status').equals('complete').toArray(),
      db.uploads.toArray(),
      db.handoffs.toArray(),
    ]);
    const uploads = new Map(uploadRows.map((u) => [u.reportId, u.updatedAt]));
    const handoffs = new Map(handoffRows.map((h) => [h.reportId, h.updatedAt]));
    return complete.filter((r) => uploads.get(r.id) !== r.updatedAt && handoffs.get(r.id) !== r.updatedAt);
  }

  function scoutNameIn(bundle: EventBundle | undefined, scoutId: string | null): string {
    if (scoutId === null) return 'Unknown Scout';
    return bundle?.roster.find((s) => s.scoutId === scoutId)?.name ?? scoutId;
  }

  return {
    latestConfig,
    seasonConfigFor,

    /** Whether this app ships the Season Config version, for a Report made by a newer app. */
    hasSeasonConfig(version: number): boolean {
      return seasonConfigs.some((c) => c.version === version);
    },

    /** Device setup: stores the team access code on this device only. */
    async setAccessCode(accessCode: string): Promise<void> {
      const code = accessCode.trim();
      if (code === '') throw new ScoutingError('Enter the access code');
      await db.settings.put({ key: 'accessCode', value: code });
    },

    async hasAccessCode(): Promise<boolean> {
      return (await db.settings.get('accessCode')) !== undefined;
    },

    refreshEventBundle,

    getEventBundle,

    currentScout,

    /** Checks the PIN against the roster on this device, so it works offline. The login lasts until logout. */
    async login(scoutId: string, pin: string): Promise<RosterEntry> {
      const bundle = await getEventBundle();
      if (!bundle) throw new ScoutingError('No Event Bundle on this device yet');
      const scout = bundle.roster.find((s) => s.scoutId === scoutId);
      if (!scout) throw new ScoutingError('Choose your name from the list');
      if (!PIN_PATTERN.test(pin) || hashPin(scout.salt, pin) !== scout.pinHash) {
        throw new ScoutingError('Wrong PIN');
      }
      await db.settings.put({ key: 'scoutId', value: scout.scoutId });
      return scout;
    },

    async logout(): Promise<void> {
      await db.settings.delete('scoutId');
    },

    /** The qualification match from the Event Bundle's schedule, or undefined for playoffs, practice and unscheduled matches. */
    async scheduledMatch(matchNumber: number): Promise<ScheduledMatch | undefined> {
      return (await getEventBundle())?.schedule.find((m) => m.matchNumber === matchNumber);
    },

    /**
     * Starts a Draft. The team number comes from the schedule when the schedule names one for this match and Station;
     * otherwise the Scout types it.
     */
    async startMatchReport({ matchNumber, station, teamNumber: typedTeam }: NewMatchReport): Promise<MatchReport> {
      const { bundle, base } = await draftBase();
      if (!Number.isInteger(matchNumber) || matchNumber < 1) throw new ScoutingError('Match number must be 1 or more');
      const scheduledTeam = bundle.schedule.find((m) => m.matchNumber === matchNumber)?.stations[station];
      if (scheduledTeam !== undefined && typedTeam !== undefined && typedTeam !== scheduledTeam) {
        throw new ScoutingError(`The schedule has Team ${scheduledTeam} at ${station} in match ${matchNumber}`);
      }
      const teamNumber = typedTeam ?? scheduledTeam;
      if (teamNumber === undefined) {
        throw new ScoutingError(`The schedule has no team at ${station} in match ${matchNumber}. Enter the team number.`);
      }
      checkTeamNumber(teamNumber);
      return addDraft<MatchReport>({ ...base, kind: 'match', matchNumber, station, teamNumber });
    },

    /** Whether the latest Season Config asks any pit questions. A season without them has no Pit Reports. */
    hasPitQuestions(): boolean {
      return formSections(latestConfig, 'pit').length > 0;
    },

    /** Starts a Pit Report Draft for a team. It has no match or Station. */
    async startPitReport({ teamNumber }: NewPitReport): Promise<PitReport> {
      if (formSections(latestConfig, 'pit').length === 0) throw new ScoutingError('This season has no pit questions');
      const { base } = await draftBase();
      checkTeamNumber(teamNumber);
      return addDraft<PitReport>({ ...base, kind: 'pit', teamNumber });
    },

    /** Sets an answer, replacing any earlier one. */
    async answer(reportId: string, code: string, value: Answer): Promise<void> {
      await changeAnswers(reportId, (report) => {
        checkAnswer(findQuestion(report, code), value);
        return { ...report.answers, [code]: value };
      });
    },

    /** Removes an answer, for example when a Scout deselects a choice or empties a number. Counters can't be cleared. */
    async clearAnswer(reportId: string, code: string): Promise<void> {
      await changeAnswers(reportId, (report) => {
        if (findQuestion(report, code).type === 'counter') throw new ScoutingError(`"${code}" is a counter and can't be cleared`);
        if (!(code in report.answers)) return undefined;
        const { [code]: _removed, ...rest } = report.answers;
        return rest;
      });
    },

    /** One press of a counter's plus or minus. */
    async adjustCounter(reportId: string, code: string, delta: 1 | -1): Promise<void> {
      await changeAnswers(reportId, (report) => {
        const question = findQuestion(report, code);
        if (question.type !== 'counter') throw new ScoutingError(`"${code}" is not a counter`);
        const min = question.min ?? 0;
        const max = question.max ?? Infinity;
        const current = (report.answers[code] as number | undefined) ?? min;
        const next = Math.min(max, Math.max(min, current + delta));
        return next === current ? undefined : { ...report.answers, [code]: next };
      });
    },

    /** One tap on an option of a multiple-choice question: selects it, or deselects it if already selected. */
    async toggleChoice(reportId: string, code: string, option: string): Promise<void> {
      await changeAnswers(reportId, (report) => {
        const question = findQuestion(report, code);
        if (question.type !== 'multiple-choice') throw new ScoutingError(`"${code}" is not a multiple-choice question`);
        if (!question.options!.includes(option)) throw new ScoutingError(`"${option}" is not an option of "${code}"`);
        const current = (report.answers[code] as string[] | undefined) ?? [];
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : question.options!.filter((o) => o === option || current.includes(o));
        const { [code]: _old, ...rest } = report.answers;
        return next.length > 0 ? { ...rest, [code]: next } : rest;
      });
    },

    /** Codes of the required questions this Report hasn't answered yet, in form order. */
    async unansweredRequired(reportId: string): Promise<string[]> {
      const report = await db.reports.get(reportId);
      if (!report) throw new ScoutingError(`No Report ${reportId}`);
      return unansweredRequiredIn(report);
    },

    async complete(reportId: string): Promise<void> {
      await db.transaction('rw', db.reports, db.settings, async () => {
        const report = await loadChangeable(reportId);
        if (report.status !== 'draft') throw new ScoutingError('This Report is already Complete');
        const missing = unansweredRequiredIn(report);
        if (missing.length > 0) throw new UnansweredRequiredError(missing);
        await db.reports.put({ ...report, status: 'complete', updatedAt: now().toISOString() });
      });
      void uploadInBackground();
    },

    /**
     * Marks a Report as wrong, for example scouted on the wrong team. It is kept, and a Complete Report Uploads its
     * Void like any other change. There is no undo: once the Sheet has the Void, no Upload can clear it.
     */
    async voidReport(reportId: string): Promise<void> {
      await db.transaction('rw', db.reports, db.settings, async () => {
        const report = await loadOwn(reportId);
        if (report.voided) return;
        await db.reports.put({ ...report, voided: true, updatedAt: now().toISOString() });
      });
      void uploadInBackground();
    },

    /**
     * The QR envelope for one of the logged-in Scout's Complete Reports, to show to a Hub. Throws ScoutingError
     * when the Report can't travel as one QR code, for example because its text answers are too long.
     */
    async qrTextFor(reportId: string): Promise<string> {
      const report = await loadOwn(reportId);
      try {
        return encodeReport(report, seasonConfigFor(report.configVersion));
      } catch (error) {
        if (error instanceof QrCodecError) throw new ScoutingError(error.message);
        throw error;
      }
    },

    /**
     * The Scout says a Hub has scanned this version of their Report. It stops counting as pending here, because the
     * Hub Uploads it. Changing the Report afterwards makes it pending again, since the Hub has the older version.
     */
    async markHandedOff(reportId: string): Promise<void> {
      const report = await loadOwn(reportId);
      if (report.status !== 'complete') throw new ScoutingError('Only a Complete Report can be handed off');
      await db.handoffs.put({ reportId, updatedAt: report.updatedAt });
    },

    /**
     * The Hub takes in one scanned QR code, from the camera or a keyboard-style scanner. The Report keeps its
     * original Scout and goes in this device's Upload queue. Rescanning a version the Hub has does nothing, and a
     * newer copy replaces an older one. Throws ScoutingError, with a reason to show, for a scan it can't use.
     */
    async acceptScan(text: string): Promise<ScanResult> {
      await requireScout();
      let report: Report;
      try {
        const version = envelopeConfigVersion(text);
        const config = seasonConfigs.find((c) => c.version === version);
        if (!config) {
          throw new ScoutingError(`This QR code uses Season Config version ${version}, which this app doesn't have. Update the app.`);
        }
        report = decodeReport(text, config);
      } catch (error) {
        if (error instanceof QrCodecError) throw new ScoutingError(error.message);
        throw error;
      }
      for (const question of questionsFor(report)) {
        const value = report.answers[question.code];
        if (value === undefined) continue;
        try {
          checkAnswer(question, value);
        } catch (error) {
          throw new ScoutingError(`The scanned Report has a bad answer: ${(error as Error).message}`);
        }
      }
      const missing = unansweredRequiredIn(report);
      if (missing.length > 0) throw new ScoutingError(`The scanned Report is missing required answers: ${missing.join(', ')}`);

      const scanned = report;
      const outcome = await db.transaction('rw', db.reports, db.hubReports, async (): Promise<ScanOutcome> => {
        const held = await db.reports.get(scanned.id);
        if (held && held.updatedAt === scanned.updatedAt) return 'duplicate';
        if (held && held.updatedAt > scanned.updatedAt) return 'older';
        await db.reports.put(scanned);
        await db.hubReports.put({ reportId: scanned.id, receivedAt: now().toISOString() });
        return held ? 'updated' : 'added';
      });
      if (outcome === 'added' || outcome === 'updated') void uploadInBackground();
      return { outcome, report: scanned, scoutName: scoutNameIn(await getEventBundle(), scanned.scoutId) };
    },

    /** Reports this device received as a Hub, most recently scanned first. (All reads start at once; see listReports.) */
    async listHubReports(): Promise<HubReport[]> {
      const [rows, bundleRow, uploadRows, allReports] = await Promise.all([
        db.hubReports.orderBy('receivedAt').reverse().toArray(),
        db.settings.get('eventBundle'),
        db.uploads.toArray(),
        db.reports.toArray(),
      ]);
      const bundle = bundleRow?.value as EventBundle | undefined;
      const uploads = new Map(uploadRows.map((u) => [u.reportId, u.updatedAt]));
      const reports = new Map(allReports.map((r) => [r.id, r]));
      return rows.flatMap((row) => {
        const report = reports.get(row.reportId);
        if (!report) return [];
        return [{ report, receivedAt: row.receivedAt, scoutName: scoutNameIn(bundle, report.scoutId), uploaded: uploads.get(report.id) === report.updatedAt }];
      });
    },

    /**
     * Coverage for the current event. Online, it downloads the Event Bundle again, whose Coverage snapshot counts
     * everyone's Uploads; this device's pending Reports go up first so the snapshot includes them. When the device
     * is offline or the Season Sheet can't be reached, it counts only this device's Reports and says why.
     */
    async refreshCoverage(): Promise<Coverage> {
      let reason: string;
      if (network && !network.isOnline()) {
        reason = 'This device is offline';
      } else {
        try {
          await uploadInBackground();
          const bundle = await refreshEventBundle();
          return { eventKey: bundle.eventKey, source: 'everyone', rows: coverageGrid(bundle, bundle.coverage) };
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
      }
      const [bundle, complete] = await Promise.all([getEventBundle(), db.reports.where('status').equals('complete').toArray()]);
      if (!bundle) throw new ScoutingError('No Event Bundle on this device yet');
      const counts = countCoverage(complete.filter((r): r is MatchReport => r.kind === 'match' && r.eventKey === bundle.eventKey));
      return { eventKey: bundle.eventKey, source: 'this-device', reason, rows: coverageGrid(bundle, counts) };
    },

    getReport(reportId: string): Promise<Report | undefined> {
      return db.reports.get(reportId);
    },

    pendingUploads,

    /**
     * "Upload now": sends every pending Report to the Season Sheet in one batch. Reports the script stores are marked
     * Uploaded; rejected ones stay pending, with their reason. Throws SheetGatewayError if the whole batch fails,
     * leaving everything pending.
     */
    uploadPending,

    /**
     * Asks for an automatic Upload, for example when a Scout finishes editing a Complete Report. Completing and
     * Voiding ask by themselves, and so does the connection coming back. Never throws.
     */
    uploadInBackground,

    /** How the last Upload attempt went, or undefined before the first one. */
    getUploadStatus,

    /**
     * The logged-in Scout's Reports on this device, newest first. Empty when nobody is logged in.
     *
     * The home screen watches this with a Dexie live query, which only notices reads Dexie can see. Dexie loses
     * sight of reads made after awaiting a helper that itself awaits another, so every read here starts at once,
     * before the first await. (Wrapping the reads in a transaction instead failed in real browsers: IndexedDB
     * committed it early while the nested helpers were still awaiting.)
     */
    async listReports(): Promise<ListedReport[]> {
      const [scoutRow, bundleRow, newestFirst, uploadRows, statusRow, handoffRows] = await Promise.all([
        db.settings.get('scoutId'),
        db.settings.get('eventBundle'),
        db.reports.orderBy('updatedAt').reverse().toArray(),
        db.uploads.toArray(),
        db.settings.get('uploadStatus'),
        db.handoffs.toArray(),
      ]);
      const roster = (bundleRow?.value as EventBundle | undefined)?.roster ?? [];
      const scout = roster.find((s) => s.scoutId === scoutRow?.value);
      if (!scout) return [];
      const uploads = new Map(uploadRows.map((u) => [u.reportId, u.updatedAt]));
      const handoffs = new Map(handoffRows.map((h) => [h.reportId, h.updatedAt]));
      const rejections = (statusRow?.value as UploadStatus | undefined)?.rejections ?? [];
      return newestFirst
        .filter((report) => report.scoutId === scout.scoutId)
        .map((report) => {
          const uploaded = uploads.get(report.id) === report.updatedAt;
          const rejection = rejections.find((r) => r.reportId === report.id && r.updatedAt === report.updatedAt);
          const handedOff = handoffs.get(report.id) === report.updatedAt;
          return { report, uploaded, handedOff, ...(rejection && !uploaded && { rejection: rejection.reason }) };
        });
    },
  };
}
