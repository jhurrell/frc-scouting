import { MATCH_STAGES, type Question, type QuestionType, type Report, type SeasonConfig } from '../shared/contract';

const QUESTION_TYPES: readonly QuestionType[] = ['counter', 'yes-no', 'single-choice', 'multiple-choice', 'number', 'text'];
const CHOICE_TYPES: readonly QuestionType[] = ['single-choice', 'multiple-choice'];
const RANGE_TYPES: readonly QuestionType[] = ['counter', 'number'];

/** Short, lower-case codes keep Event Sheet headers stable and QR payloads small. */
const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

export class SeasonConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid Season Config:\n- ${problems.join('\n- ')}`);
  }
}

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function checkQuestion(raw: unknown, where: string, problems: string[]): void {
  if (!isObject(raw)) {
    problems.push(`${where}: must be an object`);
    return;
  }
  const at = isNonEmptyString(raw.code) ? `${where} (${raw.code})` : where;

  if (!isNonEmptyString(raw.code) || !CODE_PATTERN.test(raw.code)) {
    problems.push(`${at}: code must be lower-case letters, digits and underscores, starting with a letter`);
  }
  if (!isNonEmptyString(raw.label)) problems.push(`${at}: label is required`);
  if (raw.required !== undefined && typeof raw.required !== 'boolean') problems.push(`${at}: required must be true or false`);

  const type = raw.type as QuestionType;
  if (!QUESTION_TYPES.includes(type)) {
    problems.push(`${at}: type must be one of ${QUESTION_TYPES.join(', ')}`);
    return;
  }

  if (CHOICE_TYPES.includes(type)) {
    const options = raw.options;
    if (!Array.isArray(options) || options.length === 0 || !options.every(isNonEmptyString)) {
      problems.push(`${at}: a ${type} question needs a list of options`);
    } else if (new Set(options).size !== options.length) {
      problems.push(`${at}: options must not repeat`);
    } else if (type === 'multiple-choice' && options.some((o) => o.includes(','))) {
      // The Sheet writes the selections in one cell, separated by commas.
      problems.push(`${at}: multiple-choice options must not contain commas`);
    }
  } else if (raw.options !== undefined) {
    problems.push(`${at}: only choice questions have options`);
  }

  if (RANGE_TYPES.includes(type)) {
    const whole = type === 'counter';
    for (const bound of ['min', 'max'] as const) {
      const value = raw[bound];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || (whole && !Number.isInteger(value))) {
        problems.push(`${at}: ${bound} must be a ${whole ? 'whole number' : 'number'}`);
      }
    }
    if (typeof raw.min === 'number' && typeof raw.max === 'number' && raw.min > raw.max) {
      problems.push(`${at}: min is greater than max`);
    }
  } else if (raw.min !== undefined || raw.max !== undefined) {
    problems.push(`${at}: only counter and number questions have min and max`);
  }
}

function checkConfig(raw: unknown, problems: string[]): void {
  if (!isObject(raw)) {
    problems.push('Season Config must be an object');
    return;
  }
  const where = `version ${String(raw.version)}`;
  if (!isNonEmptyString(raw.season)) problems.push(`${where}: season is required`);
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    problems.push(`${where}: version must be a whole number of 1 or more`);
  }

  const codes = new Set<string>();
  function checkQuestions(list: unknown, listWhere: string): void {
    if (!Array.isArray(list)) {
      problems.push(`${listWhere}: must be a list of questions`);
      return;
    }
    list.forEach((question, i) => {
      checkQuestion(question, `${listWhere}[${i}]`, problems);
      const code = isObject(question) ? question.code : undefined;
      if (typeof code !== 'string') return;
      if (codes.has(code)) problems.push(`${where}: question code "${code}" is used more than once`);
      codes.add(code);
    });
  }

  const stages = isObject(raw.match) ? raw.match.stages : undefined;
  if (!isObject(stages)) {
    problems.push(`${where}: match.stages is required`);
  } else {
    for (const [stage, questions] of Object.entries(stages)) {
      if (!(MATCH_STAGES as readonly string[]).includes(stage)) {
        problems.push(`${where}: "${stage}" is not a Match Stage (use ${MATCH_STAGES.join(', ')})`);
        continue;
      }
      checkQuestions(questions, `${where} ${stage}`);
    }
  }

  const groups = isObject(raw.pit) ? raw.pit.groups : undefined;
  if (!Array.isArray(groups)) {
    problems.push(`${where}: pit.groups is required`);
  } else {
    const names = new Set<string>();
    groups.forEach((group, i) => {
      if (!isObject(group) || !isNonEmptyString(group.name)) {
        problems.push(`${where} pit group ${i + 1}: name is required`);
        return;
      }
      if (names.has(group.name)) problems.push(`${where}: pit group "${group.name}" appears more than once`);
      names.add(group.name);
      checkQuestions(group.questions, `${where} pit "${group.name}"`);
    });
  }
}

export interface FormSection {
  /** A Match Stage, or the name of a pit group. */
  title: string;
  questions: Question[];
}

/**
 * The sections of a Report's form, in order: the Match Stages in their fixed order for a Match Report, or the pit
 * groups in config order for a Pit Report. Sections without questions are left out.
 */
export function formSections(config: SeasonConfig, kind: Report['kind']): FormSection[] {
  const sections =
    kind === 'match'
      ? MATCH_STAGES.map((stage) => ({ title: stage as string, questions: config.match.stages[stage] ?? [] }))
      : config.pit.groups.map((group) => ({ title: group.name, questions: group.questions }));
  return sections.filter((section) => section.questions.length > 0);
}

export function allQuestions(config: SeasonConfig): Question[] {
  return [
    ...MATCH_STAGES.flatMap((stage) => config.match.stages[stage] ?? []),
    ...config.pit.groups.flatMap((group) => group.questions),
  ];
}

/** Checks every version of a season's Season Config, alone and against each other. Throws listing every problem found. */
export function validateSeasonConfigs(raw: readonly unknown[]): SeasonConfig[] {
  const problems: string[] = [];
  if (raw.length === 0) problems.push('At least one Season Config version is required');
  raw.forEach((config) => checkConfig(config, problems));
  if (problems.length > 0) throw new SeasonConfigError(problems);

  const configs = raw as SeasonConfig[];
  const seasons = new Set(configs.map((c) => c.season));
  if (seasons.size > 1) problems.push(`All versions must belong to one season, found: ${[...seasons].join(', ')}`);

  const versions = new Set<number>();
  const typeOfCode = new Map<string, { type: QuestionType; version: number }>();
  for (const config of [...configs].sort((a, b) => a.version - b.version)) {
    if (versions.has(config.version)) problems.push(`version ${config.version} appears more than once`);
    versions.add(config.version);
    for (const question of allQuestions(config)) {
      const earlier = typeOfCode.get(question.code);
      if (earlier && earlier.type !== question.type) {
        problems.push(
          `version ${config.version}: "${question.code}" was ${earlier.type} in version ${earlier.version} and cannot become ${question.type}`,
        );
      }
      if (!earlier) typeOfCode.set(question.code, { type: question.type, version: config.version });
    }
  }
  if (problems.length > 0) throw new SeasonConfigError(problems);
  return configs;
}
