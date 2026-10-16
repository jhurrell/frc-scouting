import type { EventBundle, Report, SheetGateway, UploadOutcome } from '../shared/contract';

/** In-memory Sheet gateway for tests and local development. Accepts any access code. */
export class FakeSheetGateway implements SheetGateway {
  /** Every Report received, by Report ID. */
  readonly uploaded = new Map<string, Report>();

  constructor(private bundle: EventBundle) {}

  setEventBundle(bundle: EventBundle): void {
    this.bundle = bundle;
  }

  async fetchEventBundle(_accessCode: string): Promise<EventBundle> {
    return structuredClone(this.bundle);
  }

  async upload(_accessCode: string, reports: Report[]): Promise<UploadOutcome[]> {
    return reports.map((report) => {
      this.uploaded.set(report.id, structuredClone(report));
      return { reportId: report.id, outcome: 'stored' };
    });
  }
}
