// The QR envelope: one Complete Report as one line of plain ASCII text.
//
// The KU061 scanner sends what it reads as keystrokes, so the text must be plain ASCII. Each Report travels in
// a single QR code that must stay scannable from a phone screen, so the envelope is compact: answers go in the
// order of the Report's Season Config version, without their question codes. Every device ships every version.
//
//   SR1|id|kind|event|scout|version|void|created|updated|match|station|team|answer…|checksum
//
// - Fields are separated by "|". Text that could contain anything is escaped with encodeURIComponent, which
//   escapes "|" and "%" and turns any character into ASCII.
// - kind is "m" or "p". scout is empty for a Report made before login existed. void is 1 or 0.
// - created and updated are milliseconds since 1970 in base 36. match and station are empty for a Pit Report;
//   station is 1 to 6, in STATIONS order.
// - One answer per question, in form order. An empty field is unanswered. Counters and numbers are written as
//   numbers, yes/no as 1 or 0, a single choice as its option's index, a multiple choice as option indices joined
//   by ".", and text as "~" followed by the escaped text, so empty text differs from no answer.
// - checksum is FNV-1a of everything before it, in base 36. It catches a character a scanner dropped or changed.

import { STATIONS, type Answer, type Question, type Report, type SeasonConfig } from '../shared/contract';
import { formSections } from './seasonConfig';

const ENVELOPE = 'SR1';
const METADATA_FIELDS = 12;

/**
 * The longest envelope allowed. A QR code holding 600 characters at error correction level M is version 19,
 * 93 modules across, which still scans from a phone screen.
 */
export const MAX_QR_TEXT = 600;

export class QrCodecError extends Error {}

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function questionsOf(config: SeasonConfig, kind: Report['kind']): Question[] {
  return formSections(config, kind).flatMap((section) => section.questions);
}

function encodeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || new Date(ms).toISOString() !== iso) throw new QrCodecError(`Unexpected timestamp "${iso}"`);
  return ms.toString(36);
}

function encodeAnswer(question: Question, value: Answer | undefined): string {
  if (value === undefined) return '';
  switch (question.type) {
    case 'counter':
    case 'number':
      return String(value);
    case 'yes-no':
      return value ? '1' : '0';
    case 'single-choice':
      return String(question.options!.indexOf(value as string));
    case 'multiple-choice':
      return (value as string[]).map((option) => question.options!.indexOf(option)).join('.');
    case 'text':
      return `~${encodeURIComponent(value as string)}`;
  }
}

/** The envelope for a Complete Report. Throws QrCodecError if it won't fit in one QR code. */
export function encodeReport(report: Report, config: SeasonConfig): string {
  if (report.status !== 'complete') throw new QrCodecError('Only a Complete Report can be shown as a QR code');
  const isMatch = report.kind === 'match';
  const fields = [
    ENVELOPE,
    encodeURIComponent(report.id),
    isMatch ? 'm' : 'p',
    encodeURIComponent(report.eventKey),
    report.scoutId === null ? '' : encodeURIComponent(report.scoutId),
    String(report.configVersion),
    report.voided ? '1' : '0',
    encodeTime(report.createdAt),
    encodeTime(report.updatedAt),
    isMatch ? String(report.matchNumber) : '',
    isMatch ? String(STATIONS.indexOf(report.station) + 1) : '',
    String(report.teamNumber),
    ...questionsOf(config, report.kind).map((q) => encodeAnswer(q, report.answers[q.code])),
  ];
  const body = fields.join('|');
  const text = `${body}|${checksum(body)}`;
  if (text.length > MAX_QR_TEXT) {
    throw new QrCodecError(
      `This Report is too long for one QR code (${text.length} of ${MAX_QR_TEXT} characters). Shorten the text answers.`,
    );
  }
  return text;
}

/** The Season Config version an envelope was made with, so the caller can find it. Throws for anything that isn't an envelope. */
export function envelopeConfigVersion(text: string): number {
  const fields = text.trim().split('|');
  if (fields[0] !== ENVELOPE || fields.length < METADATA_FIELDS + 1) throw new QrCodecError('Not a Scouting Report QR code');
  const version = Number(fields[5]);
  if (!Number.isInteger(version) || version < 1) throw new QrCodecError('Bad Season Config version');
  return version;
}

function decodeWhole(field: string, what: string, min: number): number {
  const value = Number(field);
  if (field === '' || !Number.isInteger(value) || value < min) throw new QrCodecError(`Bad ${what}`);
  return value;
}

function decodeTime(field: string, what: string): string {
  const ms = parseInt(field, 36);
  if (!/^[0-9a-z]+$/.test(field) || !Number.isSafeInteger(ms)) throw new QrCodecError(`Bad ${what} time`);
  return new Date(ms).toISOString();
}

function decodeText(field: string): string {
  try {
    return decodeURIComponent(field);
  } catch {
    throw new QrCodecError('Bad escaped text');
  }
}

function decodeAnswer(question: Question, field: string): Answer | undefined {
  if (field === '') return undefined;
  const bad = () => new QrCodecError(`Bad answer for "${question.code}"`);
  const option = (index: string) => {
    const chosen = /^\d+$/.test(index) ? question.options![Number(index)] : undefined;
    if (chosen === undefined) throw bad();
    return chosen;
  };
  switch (question.type) {
    case 'counter':
    case 'number': {
      const value = Number(field);
      if (!/^-?[0-9.e+]+$/i.test(field) || !Number.isFinite(value)) throw bad();
      return value;
    }
    case 'yes-no':
      if (field !== '1' && field !== '0') throw bad();
      return field === '1';
    case 'single-choice':
      return option(field);
    case 'multiple-choice':
      return field.split('.').map(option);
    case 'text':
      if (!field.startsWith('~')) throw bad();
      return decodeText(field.slice(1));
  }
}

/**
 * The Report in an envelope, given the Season Config version it names (see envelopeConfigVersion). Throws
 * QrCodecError for anything damaged: a wrong checksum, a wrong number of fields or a value that can't be read.
 */
export function decodeReport(text: string, config: SeasonConfig): Report {
  const trimmed = text.trim();
  const cut = trimmed.lastIndexOf('|');
  const body = trimmed.slice(0, cut);
  if (cut === -1 || checksum(body) !== trimmed.slice(cut + 1)) {
    throw new QrCodecError('The QR code was misread (its checksum is wrong). Scan it again.');
  }
  const fields = body.split('|');
  if (fields[0] !== ENVELOPE) throw new QrCodecError('Not a Scouting Report QR code');
  const [, id, kind, eventKey, scoutId, version, voided, created, updated, match, station, team, ...answerFields] = fields;
  if (kind !== 'm' && kind !== 'p') throw new QrCodecError('Bad Report kind');
  if (decodeWhole(version, 'Season Config version', 1) !== config.version) {
    throw new QrCodecError(`Season Config version ${version} was expected to match ${config.version}`);
  }
  if (voided !== '0' && voided !== '1') throw new QrCodecError('Bad Void flag');

  const questions = questionsOf(config, kind === 'm' ? 'match' : 'pit');
  if (answerFields.length !== questions.length) {
    throw new QrCodecError(`Expected ${questions.length} answers for Season Config version ${config.version}, found ${answerFields.length}`);
  }
  const answers: Record<string, Answer> = {};
  questions.forEach((question, i) => {
    const answer = decodeAnswer(question, answerFields[i]);
    if (answer !== undefined) answers[question.code] = answer;
  });

  const base = {
    id: decodeText(id),
    eventKey: decodeText(eventKey),
    scoutId: scoutId === '' ? null : decodeText(scoutId),
    configVersion: config.version,
    status: 'complete' as const,
    voided: voided === '1',
    createdAt: decodeTime(created, 'created'),
    updatedAt: decodeTime(updated, 'updated'),
    answers,
    teamNumber: decodeWhole(team, 'team number', 1),
  };
  if (base.id === '' || base.eventKey === '') throw new QrCodecError('Missing Report ID or event key');
  if (kind === 'p') {
    if (match !== '' || station !== '') throw new QrCodecError('A Pit Report has no match or Station');
    return { ...base, kind: 'pit' };
  }
  const stationName = STATIONS[decodeWhole(station, 'Station', 1) - 1];
  if (!stationName) throw new QrCodecError('Bad Station');
  return { ...base, kind: 'match', matchNumber: decodeWhole(match, 'match number', 1), station: stationName };
}
