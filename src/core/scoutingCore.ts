import {
  PIN_PATTERN,
  pinHashText,
  type Answer,
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
import type { ScoutingDb, UploadRow } from './db';
import { formSections, validateSeasonConfigs } from './seasonConfig';

export class ScoutingError extends Error {}

/** Thrown by complete() when required questions are unanswered. */
export class UnansweredRequiredError extends ScoutingError {
  constructor(readonly codes: string[]) {
    super(`Still to answer: ${codes.join(', ')}`);
  }
}

export interface ScoutingCoreDeps {
  db: ScoutingDb;
  gateway: SheetGateway;
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
}

export interface UploadSummary {
  stored: number;
  /** Reports the Sheet already held a newer copy of. Nothing more to send for them. */
  stale: number;
  rejected: { reportId: string; reason: string }[];
}

export type ScoutingCore = ReturnType<typeof createScoutingCore>;

/** The PIN hash the script puts in the roster: lowercase hex SHA-256 of pinHashText(salt, pin). */
export async function hashPin(salt: string, pin: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pinHashText(salt, pin)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  seasonConfigs: rawConfigs,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
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

  async function getEventBundle(): Promise<EventBundle | undefined> {
    const row = await db.settings.get('eventBundle');
    return row?.value as EventBundle | undefined;
  }

  async function getAccessCode(): Promise<string> {
    const row = await db.settings.get('accessCode');
    if (!row) throw new ScoutingError('This device has no access code yet. An Admin needs to set it up.');
    return row.value as string;
  }

  /** Complete Reports the Season Sheet doesn't hold in their current version. Drafts never leave the device. */
  async function pendingUploads(): Promise<Report[]> {
    const complete = await db.reports.where('status').equals('complete').toArray();
    const uploads = new Map((await db.uploads.toArray()).map((u) => [u.reportId, u.updatedAt]));
    return complete.filter((r) => uploads.get(r.id) !== r.updatedAt);
  }

  return {
    latestConfig,
    seasonConfigFor,

    /** Device setup: stores the team access code on this device only. */
    async setAccessCode(accessCode: string): Promise<void> {
      const code = accessCode.trim();
      if (code === '') throw new ScoutingError('Enter the access code');
      await db.settings.put({ key: 'accessCode', value: code });
    },

    async hasAccessCode(): Promise<boolean> {
      return (await db.settings.get('accessCode')) !== undefined;
    },

    async refreshEventBundle(): Promise<EventBundle> {
      const bundle = await gateway.fetchEventBundle(await getAccessCode());
      await db.settings.put({ key: 'eventBundle', value: bundle });
      return bundle;
    },

    getEventBundle,

    currentScout,

    /** Checks the PIN against the roster on this device, so it works offline. The login lasts until logout. */
    async login(scoutId: string, pin: string): Promise<RosterEntry> {
      const bundle = await getEventBundle();
      if (!bundle) throw new ScoutingError('No Event Bundle on this device yet');
      const scout = bundle.roster.find((s) => s.scoutId === scoutId);
      if (!scout) throw new ScoutingError('Choose your name from the list');
      if (!PIN_PATTERN.test(pin) || (await hashPin(scout.salt, pin)) !== scout.pinHash) {
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
    },

    getReport(reportId: string): Promise<Report | undefined> {
      return db.reports.get(reportId);
    },

    pendingUploads,

    /**
     * Sends every pending Report to the Season Sheet in one batch. Reports the script stores are marked Uploaded;
     * rejected ones stay pending. Throws SheetGatewayError if the whole batch fails, leaving everything pending.
     */
    async uploadPending(): Promise<UploadSummary> {
      const accessCode = await getAccessCode();
      const pending = await pendingUploads();
      if (pending.length === 0) return { stored: 0, stale: 0, rejected: [] };

      const outcomes = await gateway.upload(accessCode, pending);
      const sent = new Map(pending.map((r) => [r.id, r.updatedAt]));
      const summary: UploadSummary = { stored: 0, stale: 0, rejected: [] };
      const stored: UploadRow[] = [];
      for (const outcome of outcomes) {
        const updatedAt = sent.get(outcome.reportId);
        if (updatedAt === undefined) continue;
        if (outcome.outcome === 'rejected') {
          summary.rejected.push({ reportId: outcome.reportId, reason: outcome.reason });
        } else {
          // Stored, or stale because the Sheet already has a newer copy: either way there's nothing more to send.
          stored.push({ reportId: outcome.reportId, updatedAt });
          summary[outcome.outcome] += 1;
        }
      }
      await db.uploads.bulkPut(stored);
      return summary;
    },

    /**
     * The logged-in Scout's Reports on this device, newest first. Empty when nobody is logged in.
     *
     * The home screen watches this with a Dexie live query. Outside a transaction, Dexie stops noticing reads made
     * after awaiting a helper that itself awaits another helper (currentScout here), so the list never refreshed
     * on Upload. The read transaction keeps every read visible to the live query.
     */
    listReports(): Promise<ListedReport[]> {
      return db.transaction('r', db.reports, db.settings, db.uploads, async () => {
        const scout = await currentScout();
        if (!scout) return [];
        const reports = (await db.reports.orderBy('updatedAt').reverse().toArray()).filter(
          (r) => r.scoutId === scout.scoutId,
        );
        const uploads = new Map((await db.uploads.toArray()).map((u) => [u.reportId, u.updatedAt]));
        return reports.map((report) => ({ report, uploaded: uploads.get(report.id) === report.updatedAt }));
      });
    },
  };
}
