import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import type { MatchReport, PitReport, SeasonConfig } from '../shared/contract';
import demoV2 from '../seasons/demo-v2.json';
import { decodeReport, encodeReport, envelopeConfigVersion, MAX_QR_TEXT, QrCodecError } from './qrCodec';

const config: SeasonConfig = {
  season: 'test',
  version: 3,
  match: {
    stages: {
      'Pre-Match': [{ code: 'start', label: 'Start', type: 'single-choice', options: ['Left', 'Middle', 'Right'] }],
      Autonomous: [{ code: 'moved', label: 'Moved', type: 'yes-no' }],
      Teleop: [
        { code: 'scored', label: 'Scored', type: 'counter' },
        { code: 'cycle', label: 'Cycle', type: 'number', min: -10, max: 1000 },
      ],
      Endgame: [{ code: 'end', label: 'End', type: 'multiple-choice', options: ['Park', 'Climb', 'Defend'] }],
      'Post-Match': [{ code: 'notes', label: 'Notes', type: 'text' }],
    },
  },
  pit: { groups: [{ name: 'Robot', questions: [{ code: 'drive', label: 'Drive', type: 'text' }, { code: 'motors', label: 'Motors', type: 'counter' }] }] },
};

const matchReport: MatchReport = {
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  kind: 'match',
  eventKey: '2026nyro',
  scoutId: 's01',
  configVersion: 3,
  status: 'complete',
  voided: false,
  createdAt: '2026-10-16T12:00:00.000Z',
  updatedAt: '2026-10-16T12:03:27.481Z',
  answers: { start: 'Right', moved: true, scored: 12, cycle: 7.5, end: ['Park', 'Defend'], notes: 'Fast | 100% "great" café 🤖\nline two' },
  matchNumber: 42,
  station: 'Blue 3',
  teamNumber: 578,
};

const pitReport: PitReport = {
  id: 'p-1',
  kind: 'pit',
  eventKey: '2026nyro',
  scoutId: null,
  configVersion: 3,
  status: 'complete',
  voided: true,
  createdAt: '2026-10-15T09:00:00.000Z',
  updatedAt: '2026-10-15T09:10:00.000Z',
  answers: { drive: '', motors: 0 },
  teamNumber: 9999,
};

const roundTrip = (report: MatchReport | PitReport) => decodeReport(encodeReport(report, config), config);

describe('the QR envelope', () => {
  it('round-trips a Match Report with every question type, losing nothing', () => {
    expect(roundTrip(matchReport)).toEqual(matchReport);
  });

  it('round-trips a Pit Report, a missing Scout, a Void, and empty text as different from no answer', () => {
    expect(roundTrip(pitReport)).toEqual(pitReport);
    const { drive: _drive, ...unanswered } = pitReport.answers;
    expect(roundTrip({ ...pitReport, answers: unanswered })).toEqual({ ...pitReport, answers: unanswered });
  });

  it('round-trips unanswered questions, false, zero and negative numbers', () => {
    const sparse = { ...matchReport, answers: { moved: false, scored: 0, cycle: -2 } };
    expect(roundTrip(sparse)).toEqual(sparse);
  });

  it('is plain printable ASCII on one line, so a keyboard-style scanner can type it', () => {
    expect(encodeReport(matchReport, config)).toMatch(/^[\x20-\x7e]+$/);
  });

  it('names its Season Config version, so the receiver can pick the right one', () => {
    expect(envelopeConfigVersion(encodeReport(matchReport, config))).toBe(3);
    expect(() => envelopeConfigVersion('hello')).toThrow('Not a Scouting Report QR code');
  });

  it('ignores the Enter or spaces a scanner adds around the text', () => {
    expect(decodeReport(`  ${encodeReport(matchReport, config)}\r\n`, config)).toEqual(matchReport);
  });

  it('refuses a Draft', () => {
    expect(() => encodeReport({ ...matchReport, status: 'draft' }, config)).toThrow(QrCodecError);
  });
});

describe('a damaged scan', () => {
  const text = encodeReport(matchReport, config);

  it('is caught when a character changed', () => {
    const changed = text.replace('|42|', '|43|');
    expect(changed).not.toBe(text);
    expect(() => decodeReport(changed, config)).toThrow(/checksum/);
  });

  it('is caught when a character was dropped', () => {
    expect(() => decodeReport(text.slice(0, 20) + text.slice(21), config)).toThrow(/checksum/);
  });

  it('is caught when its answers don’t fit the Season Config version', () => {
    const other = { ...config, match: { stages: { Teleop: [{ code: 'scored', label: 'Scored', type: 'counter' as const }] } } };
    expect(() => decodeReport(text, other)).toThrow(QrCodecError);
  });
});

describe('the size limit', () => {
  it('fits a full demo Match Report with a few sentences of notes', () => {
    const demo = demoV2 as SeasonConfig;
    const full: MatchReport = {
      ...matchReport,
      configVersion: 2,
      answers: {
        start_pos: 'Middle',
        auto_moved: true,
        auto_scored: 4,
        tele_scored: 17,
        tele_cycle: 11.5,
        end_actions: ['Parked', 'Played defence'],
        notes: 'Strong driver, slow intake. Tipped once in teleop but recovered. Good partner for defence.',
      },
    };
    expect(encodeReport(full, demo).length).toBeLessThan(MAX_QR_TEXT / 2);
  });

  it('refuses a Report too long for one QR code, with a clear reason', () => {
    const long = { ...matchReport, answers: { notes: 'x'.repeat(MAX_QR_TEXT) } };
    expect(() => encodeReport(long, config)).toThrow(/too long for one QR code/);
  });

  it('keeps the largest allowed text within a QR code a phone screen can show', () => {
    const qr = QRCode.create('x'.repeat(MAX_QR_TEXT), { errorCorrectionLevel: 'M' });
    expect(qr.version).toBeLessThanOrEqual(19);
  });
});

describe('a real QR code', () => {
  /** Draws a QR code as camera-style RGBA pixels, with the quiet zone around it. */
  function render(text: string) {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const scale = 4;
    const quiet = 4;
    const size = (modules.size + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.get(row, col)) continue;
        for (let y = 0; y < scale; y++) {
          for (let x = 0; x < scale; x++) {
            const at = (((row + quiet) * scale + y) * size + (col + quiet) * scale + x) * 4;
            pixels.fill(0, at, at + 3);
          }
        }
      }
    }
    return { pixels, size };
  }

  it('is drawn and read back as the same Report', () => {
    const text = encodeReport(matchReport, config);
    const { pixels, size } = render(text);

    const read = jsQR(pixels, size, size);

    expect(read?.data).toBe(text);
    expect(decodeReport(read!.data, config)).toEqual(matchReport);
  });
});
