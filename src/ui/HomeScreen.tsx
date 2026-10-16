import { useLiveQuery } from 'dexie-react-hooks';
import type { ScoutingCore } from '../core/scoutingCore';
import type { Report } from '../shared/contract';
import type { Screen } from './App';

function describeReport(report: Report): string {
  return report.kind === 'match'
    ? `Match ${report.matchNumber} · ${report.station} · Team ${report.teamNumber}`
    : `Pit · Team ${report.teamNumber}`;
}

export function HomeScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const bundle = useLiveQuery(() => core.getEventBundle());
  const reports = useLiveQuery(() => core.listReports(), [], []);

  return (
    <main>
      <h1>Scouting</h1>
      <p className="muted">{bundle ? `Event ${bundle.eventKey}` : 'No Event Bundle on this device yet'}</p>

      <button className="primary" disabled={!bundle} onClick={() => navigate({ name: 'new-match-report' })}>
        New Match Report
      </button>

      <h2>My Reports</h2>
      {reports.length === 0 && <p className="muted">No Reports yet.</p>}
      <ul className="report-list">
        {reports.map((report) => (
          <li key={report.id}>
            <button onClick={() => navigate({ name: 'match-report', reportId: report.id })}>
              <span>{describeReport(report)}</span>
              <span className={`badge ${report.status}`}>{report.status === 'draft' ? 'Draft' : 'Complete'}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
