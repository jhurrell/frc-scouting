import {
  countCoverage,
  SheetGatewayError,
  type EventBundle,
  type MatchReport,
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
  /** The Report IDs of every upload call that reached the fake, in order. */
  readonly batches: string[][] = [];
  /** How the newest stored copy of each Report arrived, by Report ID. */
  readonly uploadedVia = new Map<string, 'device' | 'hub'>();
  private gate: Promise<void> | null = null;

  constructor(
    private bundle: EventBundle,
    private readonly options: FakeSheetGatewayOptions = {},
  ) {}

  setEventBundle(bundle: EventBundle): void {
    this.bundle = bundle;
  }

  /** Holds every upload call that arrives from now on until the returned function is called. */
  pause(): () => void {
    let resume!: () => void;
    this.gate = new Promise((resolve) => (resume = resolve));
    return () => {
      this.gate = null;
      resume();
    };
  }

  private check(accessCode: string): void {
    if (this.offline) throw new SheetGatewayError('Could not reach the Season Sheet');
    if (this.options.accessCode !== undefined && accessCode !== this.options.accessCode) {
      throw new SheetGatewayError('Wrong access code');
    }
  }

  /** The bundle given to the fake, with Coverage counted from the Match Reports it has received, as the script does. */
  async fetchEventBundle(accessCode: string): Promise<EventBundle> {
    this.check(accessCode);
    const coverage = countCoverage(
      [...this.uploaded.values()].filter((r) => r.kind === 'match' && r.eventKey === this.bundle.eventKey) as MatchReport[],
    );
    return structuredClone({ ...this.bundle, coverage });
  }

  async upload(accessCode: string, reports: Report[], hubReportIds: string[] = []): Promise<UploadOutcome[]> {
    this.batches.push(reports.map((r) => r.id));
    if (this.gate) await this.gate;
    this.check(accessCode);
    return reports.map((report): UploadOutcome => {
      const reason = this.rejections.get(report.id);
      if (reason) return { reportId: report.id, outcome: 'rejected', reason };
      // Like the script: an older copy never overwrites a newer one.
      const held = this.uploaded.get(report.id);
      if (held && held.updatedAt > report.updatedAt) return { reportId: report.id, outcome: 'stale' };
      this.uploaded.set(report.id, structuredClone(report));
      this.uploadedVia.set(report.id, hubReportIds.includes(report.id) ? 'hub' : 'device');
      return { reportId: report.id, outcome: 'stored' };
    });
  }
}
