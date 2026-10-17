import { describe, expect, it } from 'vitest';
import { SheetGatewayError, type MatchReport } from '../shared/contract';
import { handleRequest } from '../script/logic';
import { MemoryPort } from '../script/memoryPort';
import { HttpSheetGateway } from './httpSheetGateway';

// A contract test: the app's HTTP client talking to the real script logic, with only the network and
// Google Sheets replaced. If the two sides disagree about the protocol, this fails.

const ACCESS_CODE = 'team-code';

function scriptBehindFetch(port: MemoryPort): typeof fetch {
  return async (_url, init) => {
    expect(init?.method).toBe('POST');
    const body = handleRequest(String(init?.body), port, { accessCode: ACCESS_CODE }, new Date('2026-10-16T13:00:00Z'));
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
}

function seasonSheet(): MemoryPort {
  const port = new MemoryPort();
  port.seasonTabs.set('Settings', [['Setting', 'Value'], ['Current event', '2026test']]);
  port.seasonTabs.set('Events', [['Event key', 'Event Sheet ID'], ['2026test', 'sheet-1']]);
  port.eventSheets.set('sheet-1', new Map());
  return port;
}

const report: MatchReport = {
  id: 'r1',
  kind: 'match',
  eventKey: '2026test',
  scoutId: null,
  configVersion: 1,
  status: 'complete',
  voided: false,
  createdAt: '2026-10-16T12:00:00.000Z',
  updatedAt: '2026-10-16T12:00:00.000Z',
  answers: { tele_scored: 4 },
  matchNumber: 3,
  station: 'Red 2',
  teamNumber: 578,
};

describe('HttpSheetGateway against the script logic', () => {
  it('downloads the Event Bundle', async () => {
    const gateway = new HttpSheetGateway('https://script.example/exec', scriptBehindFetch(seasonSheet()));
    expect((await gateway.fetchEventBundle(ACCESS_CODE)).eventKey).toBe('2026test');
  });

  it('uploads Reports into the Event Sheet', async () => {
    const port = seasonSheet();
    const gateway = new HttpSheetGateway('https://script.example/exec', scriptBehindFetch(port));

    expect(await gateway.upload(ACCESS_CODE, [report])).toEqual([{ reportId: 'r1', outcome: 'stored' }]);
    expect(port.rows('sheet-1', 'Match Reports')).toMatchObject([{ 'Report ID': 'r1', tele_scored: 4 }]);
  });

  it('turns a refusal into a SheetGatewayError with the script’s message', async () => {
    const gateway = new HttpSheetGateway('https://script.example/exec', scriptBehindFetch(seasonSheet()));
    await expect(gateway.upload('guess', [report])).rejects.toThrow(new SheetGatewayError('Wrong access code'));
  });
});

describe('HttpSheetGateway failures', () => {
  it('reports an unreachable script', async () => {
    const gateway = new HttpSheetGateway('https://script.example/exec', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(gateway.fetchEventBundle(ACCESS_CODE)).rejects.toThrow(SheetGatewayError);
  });

  it('reports an answer that is not JSON, such as a Google sign-in page', async () => {
    const gateway = new HttpSheetGateway('https://script.example/exec', async () => new Response('<html>Sign in</html>'));
    await expect(gateway.fetchEventBundle(ACCESS_CODE)).rejects.toThrow(/unreadable answer/);
  });
});
