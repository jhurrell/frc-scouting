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

export class ScoutingError extends Error {}

export interface ScoutingCoreDeps {
  db: ScoutingDb;
  gateway: SheetGateway;
  /** Every Season Config version of the current season. New Reports use the highest version. */
  seasonConfigs: SeasonConfig[];
  now?: () => Date;
  newId?: () => string;
}

export interface NewMatchReport {
  matchNumber: number;
  station: Station;
  teamNumber: number;
}

export type ScoutingCore = ReturnType<typeof createScoutingCore>;

/** All scouting behaviour lives here. UI screens call these operations and nothing else. */
export function createScoutingCore({
  db,
  gateway,
  seasonConfigs,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: ScoutingCoreDeps) {
  if (seasonConfigs.length === 0) throw new ScoutingError('At least one Season Config is required');
  const latestConfig = seasonConfigs.reduce((a, b) => (b.version > a.version ? b : a));

  function seasonConfigFor(version: number): SeasonConfig {
    const config = seasonConfigs.find((c) => c.version === version);
    if (!config) throw new ScoutingError(`Unknown Season Config version ${version}`);
    return config;
  }

  function matchQuestions(config: SeasonConfig): Question[] {
    return MATCH_STAGES.flatMap((stage) => config.match.stages[stage] ?? []);
  }

  function findQuestion(report: Report, code: string): Question {
    const config = seasonConfigFor(report.configVersion);
    const questions = report.kind === 'match' ? matchQuestions(config) : config.pit.groups.flatMap((g) => g.questions);
    const question = questions.find((q) => q.code === code);
    if (!question) throw new ScoutingError(`Unknown question "${code}"`);
    return question;
  }

  async function loadDraft(reportId: string): Promise<Report> {
    const report = await db.reports.get(reportId);
    if (!report) throw new ScoutingError(`No Report ${reportId}`);
    if (report.status !== 'draft') throw new ScoutingError('Only a Draft can be changed');
    return report;
  }

  function checkAnswer(question: Question, value: Answer): void {
    if (question.type === 'counter') {
      const min = question.min ?? 0;
      const max = question.max ?? Infinity;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new ScoutingError(`"${question.code}" must be a whole number from ${min} to ${max}`);
      }
      return;
    }
    // The other question types arrive with the full question engine (ticket 02).
    throw new ScoutingError(`Question type "${question.type}" is not supported yet`);
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

      // Counters start at their minimum, so a counter always has an answer.
      const answers: Record<string, Answer> = {};
      for (const q of matchQuestions(latestConfig)) {
        if (q.type === 'counter') answers[q.code] = q.min ?? 0;
      }

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
        answers,
        matchNumber,
        station,
        teamNumber,
      };
      await db.reports.add(report);
      return report;
    },

    async answer(reportId: string, code: string, value: Answer): Promise<void> {
      await db.transaction('rw', db.reports, async () => {
        const report = await loadDraft(reportId);
        checkAnswer(findQuestion(report, code), value);
        await db.reports.put({
          ...report,
          answers: { ...report.answers, [code]: value },
          updatedAt: now().toISOString(),
        });
      });
    },

    /** One press of a counter's plus or minus. Reads and writes in one transaction, so rapid presses never lose or double a count. */
    async adjustCounter(reportId: string, code: string, delta: 1 | -1): Promise<void> {
      await db.transaction('rw', db.reports, async () => {
        const report = await loadDraft(reportId);
        const question = findQuestion(report, code);
        if (question.type !== 'counter') throw new ScoutingError(`"${code}" is not a counter`);
        const min = question.min ?? 0;
        const max = question.max ?? Infinity;
        const current = (report.answers[code] as number | undefined) ?? min;
        const next = Math.min(max, Math.max(min, current + delta));
        if (next === current) return;
        await db.reports.put({
          ...report,
          answers: { ...report.answers, [code]: next },
          updatedAt: now().toISOString(),
        });
      });
    },

    async complete(reportId: string): Promise<void> {
      await db.transaction('rw', db.reports, async () => {
        const report = await loadDraft(reportId);
        // Required-question checks arrive with the full question engine (ticket 02).
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
