import {
  SheetGatewayError,
  type EventBundle,
  type Report,
  type SheetGateway,
  type UploadOutcome,
} from '../shared/contract';

export interface FakeSheetGatewayOptions {
  /** When set, any other access code is refused, as the real script would. */
  accessCode?: string;
}

/** In-memory Sheet gateway for tests and local development. */
export class FakeSheetGateway implements SheetGateway {
  /** The newest copy of every Report received, by Report ID. */
  readonly uploaded = new Map<string, Report>();
  /** Simulates the script being unreachable. */
  offline = false;
  /** Report IDs the fake rejects, with the reason. */
  readonly rejections = new Map<string, string>();

  constructor(
    private bundle: EventBundle,
    private readonly options: FakeSheetGatewayOptions = {},
  ) {}

  setEventBundle(bundle: EventBundle): void {
    this.bundle = bundle;
  }

  private check(accessCode: string): void {
    if (this.offline) throw new SheetGatewayError('Could not reach the Season Sheet');
    if (this.options.accessCode !== undefined && accessCode !== this.options.accessCode) {
      throw new SheetGatewayError('Wrong access code');
    }
  }

  async fetchEventBundle(accessCode: string): Promise<EventBundle> {
    this.check(accessCode);
    return structuredClone(this.bundle);
  }

  async upload(accessCode: string, reports: Report[]): Promise<UploadOutcome[]> {
    this.check(accessCode);
    return reports.map((report): UploadOutcome => {
      const reason = this.rejections.get(report.id);
      if (reason) return { reportId: report.id, outcome: 'rejected', reason };
      // Like the script: an older copy never overwrites a newer one.
      const held = this.uploaded.get(report.id);
      if (held && held.updatedAt > report.updatedAt) return { reportId: report.id, outcome: 'stale' };
      this.uploaded.set(report.id, structuredClone(report));
      return { reportId: report.id, outcome: 'stored' };
    });
  }
}
