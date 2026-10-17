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
  if (report.status === 'draft') return { text: report.voided ? 'Void Draft' : 'Draft', className: report.voided ? 'void' : 'draft' };
  const upload = uploaded ? 'Uploaded' : 'Not uploaded';
  if (report.voided) return { text: `Void · ${upload}`, className: 'void' };
  return uploaded ? { text: upload, className: 'complete' } : { text: upload, className: 'pending' };
}

export function HomeScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const bundle = useLiveQuery(() => core.getEventBundle());
  const scout = useLiveQuery(() => core.currentScout());
  const reports = useLiveQuery(() => core.listReports(), [], []);
  const pending = useLiveQuery(() => core.pendingUploads(), [], []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const { eventKey, schedule, teams } = await core.refreshEventBundle();
      setMessage({ text: `Downloaded ${eventKey}: ${teams.length} teams, ${schedule.length} qualification matches.`, error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function uploadNow() {
    setBusy(true);
    setMessage(null);
    try {
      const { stored, stale, rejected } = await core.uploadPending();
      const parts = [`Uploaded ${stored} Report${stored === 1 ? '' : 's'}.`];
      if (stale > 0) parts.push(`${stale} already had a newer copy in the Sheet.`);
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
      {scout && (
        <p>
          Logged in as <strong>{scout.name}</strong> ·{' '}
          <button className="link" onClick={() => core.logout()}>
            Log out
          </button>
        </p>
      )}
      <p className="muted">
        {bundle
          ? `Event ${bundle.eventKey} · ${bundle.schedule.length} qualification matches`
          : 'No Event Bundle on this device yet. Connect to the internet and choose Refresh.'}{' '}
        ·{' '}
        <button className="link" disabled={busy} onClick={refresh}>
          Refresh
        </button>{' '}
        ·{' '}
        <button className="link" onClick={() => navigate({ name: 'device-setup' })}>
          Device setup
        </button>
      </p>

      <button className="primary" disabled={!bundle || !scout} onClick={() => navigate({ name: 'new-match-report' })}>
        New Match Report
      </button>
      {core.hasPitQuestions() && (
        <button className="secondary" disabled={!bundle || !scout} onClick={() => navigate({ name: 'new-pit-report' })}>
          New Pit Report
        </button>
      )}

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
              <button onClick={() => navigate({ name: 'report', reportId: item.report.id })}>
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
