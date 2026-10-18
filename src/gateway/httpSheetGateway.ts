import {
  SheetGatewayError,
  type EventBundle,
  type Report,
  type ScriptRequest,
  type ScriptResponse,
  type SheetGateway,
  type UploadOutcome,
} from '../shared/contract';

/** Talks to the Apps Script web app bound to the Season Sheet. */
export class HttpSheetGateway implements SheetGateway {
  constructor(
    private readonly scriptUrl: string,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async send(request: ScriptRequest): Promise<ScriptResponse & { ok: true }> {
    let response: Response;
    try {
      response = await this.fetchFn(this.scriptUrl, {
        method: 'POST',
        // text/plain keeps this a "simple" request: Apps Script can't answer a CORS preflight.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(request),
        redirect: 'follow',
      });
    } catch {
      throw new SheetGatewayError('Could not reach the Season Sheet. Check the connection and try again.');
    }
    if (!response.ok) throw new SheetGatewayError(`The Season Sheet answered with HTTP ${response.status}`);

    let body: ScriptResponse;
    try {
      body = (await response.json()) as ScriptResponse;
    } catch {
      throw new SheetGatewayError('The Season Sheet sent an unreadable answer. Is the script URL right?');
    }
    if (!body.ok) throw new SheetGatewayError(body.error);
    return body;
  }

  async fetchEventBundle(accessCode: string): Promise<EventBundle> {
    const body = await this.send({ action: 'event-bundle', accessCode });
    if (!('bundle' in body)) throw new SheetGatewayError('The Season Sheet sent no Event Bundle');
    return body.bundle;
  }

  async upload(accessCode: string, reports: Report[], hubReportIds: string[] = []): Promise<UploadOutcome[]> {
    const body = await this.send({ action: 'upload', accessCode, reports, ...(hubReportIds.length > 0 && { hubReportIds }) });
    if (!('outcomes' in body)) throw new SheetGatewayError('The Season Sheet sent no upload results');
    return body.outcomes;
  }
}
