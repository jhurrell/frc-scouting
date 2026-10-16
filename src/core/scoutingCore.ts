import {
  MATCH_STAGES,
  type Answer,
  type EventBundle,
  type MatchReport,
  type Question,
  type Report,
  type SeasonConfig,
  type SheetGateway,
  type Station,
} from '../shared/contract';
import type { ScoutingDb } from './db';
import { validateSeasonConfigs } from './seasonConfig';

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
  teamNumber: number;
}

export type ScoutingCore = ReturnType<typeof createScoutingCore>;

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
    const config = seasonConfigFor(report.configVersion);
    return report.kind === 'match'
      ? MATCH_STAGES.flatMap((stage) => config.match.stages[stage] ?? [])
      : config.pit.groups.flatMap((g) => g.questions);
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

  async function loadDraft(reportId: string): Promise<Report> {
    const report = await db.reports.get(reportId);
    if (!report) throw new ScoutingError(`No Report ${reportId}`);
    if (report.status !== 'draft') throw new ScoutingError('Only a Draft can be changed');
    return report;
  }

  /** Reads, changes and writes a Draft's answers in one transaction, so rapid taps never lose or double a change. */
  async function changeAnswers(
    reportId: string,
    change: (report: Report) => Record<string, Answer> | undefined,
  ): Promise<void> {
    await db.transaction('rw', db.reports, async () => {
      const report = await loadDraft(reportId);
      const answers = change(report);
      if (!answers) return;
      await db.reports.put({ ...report, answers, updatedAt: now().toISOString() });
    });
  }

  async function getEventBundle(): Promise<EventBundle | undefined> {
    const row = await db.settings.get('eventBundle');
    return row?.value;
  }

  return {
    latestConfig,
    seasonConfigFor,

    async refreshEventBundle(): Promise<EventBundle> {
      // The access code arrives with device setup (ticket 03).
      const bundle = await gateway.fetchEventBundle('');
      await db.settings.put({ key: 'eventBundle', value: bundle });
      return bundle;
    },

    getEventBundle,

    async startMatchReport({ matchNumber, station, teamNumber }: NewMatchReport): Promise<MatchReport> {
      const bundle = await getEventBundle();
      if (!bundle) throw new ScoutingError('No Event Bundle on this device yet');
      if (!Number.isInteger(matchNumber) || matchNumber < 1) throw new ScoutingError('Match number must be 1 or more');
      if (!Number.isInteger(teamNumber) || teamNumber < 1) throw new ScoutingError('Team number must be 1 or more');

      const timestamp = now().toISOString();
      const report: MatchReport = {
        id: newId(),
        kind: 'match',
        eventKey: bundle.eventKey,
        scoutId: null,
        configVersion: latestConfig.version,
        status: 'draft',
        voided: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        answers: {},
        matchNumber,
        station,
        teamNumber,
      };
      // Counters start at their minimum, so a counter always has an answer.
      for (const q of questionsFor(report)) {
        if (q.type === 'counter') report.answers[q.code] = q.min ?? 0;
      }
      await db.reports.add(report);
      return report;
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
      await db.transaction('rw', db.reports, async () => {
        const report = await loadDraft(reportId);
        const missing = unansweredRequiredIn(report);
        if (missing.length > 0) throw new UnansweredRequiredError(missing);
        await db.reports.put({ ...report, status: 'complete', updatedAt: now().toISOString() });
      });
    },

    getReport(reportId: string): Promise<Report | undefined> {
      return db.reports.get(reportId);
    },

    /** This device's Reports, newest first. */
    async listReports(): Promise<Report[]> {
      return (await db.reports.orderBy('updatedAt').reverse().toArray()) as Report[];
    },
  };
}
