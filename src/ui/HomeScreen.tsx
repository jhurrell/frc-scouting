import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ListedReport, ScoutingCore } from '../core/scoutingCore';
import type { Report } from '../shared/contract';
import type { Screen } from './App';

function describeReport(report: Report): string {
  return report.kind === 'match'
    ? `Match ${report.matchNumber} · ${report.station} · Team ${report.teamNumber}`
    : `Pit · Team ${report.teamNumber}`;
}

function statusOf({ report, uploaded }: ListedReport): { text: string; className: string } {
  if (report.status === 'draft') return { text: 'Draft', className: 'draft' };
  return uploaded ? { text: 'Uploaded', className: 'complete' } : { text: 'Not uploaded', className: 'pending' };
}

export function HomeScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const bundle = useLiveQuery(() => core.getEventBundle());
  const reports = useLiveQuery(() => core.listReports(), [], []);
  const pending = useLiveQuery(() => core.pendingUploads(), [], []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function uploadNow() {
    setBusy(true);
    setMessage(null);
    try {
      const { stored, rejected } = await core.uploadPending();
      const parts = [`Uploaded ${stored} Report${stored === 1 ? '' : 's'}.`];
      for (const r of rejected) parts.push(`Not accepted (${r.reportId.slice(0, 8)}): ${r.reason}.`);
      setMessage({ text: parts.join(' '), error: rejected.length > 0 });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Scouting</h1>
      <p className="muted">
        {bundle ? `Event ${bundle.eventKey}` : 'No Event Bundle on this device yet'} ·{' '}
        <button className="link" onClick={() => navigate({ name: 'device-setup' })}>
          Device setup
        </button>
      </p>

      <button className="primary" disabled={!bundle} onClick={() => navigate({ name: 'new-match-report' })}>
        New Match Report
      </button>

      <button className="secondary" disabled={busy || pending.length === 0} onClick={uploadNow}>
        {busy ? 'Uploading…' : `Upload now (${pending.length} waiting)`}
      </button>
      {message && <p className={message.error ? 'error' : 'muted'}>{message.text}</p>}

      <h2>My Reports</h2>
      {reports.length === 0 && <p className="muted">No Reports yet.</p>}
      <ul className="report-list">
        {reports.map((item) => {
          const status = statusOf(item);
          return (
            <li key={item.report.id}>
              <button onClick={() => navigate({ name: 'match-report', reportId: item.report.id })}>
                <span>{describeReport(item.report)}</span>
                <span className={`badge ${status.className}`}>{status.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
