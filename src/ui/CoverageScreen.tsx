import { useCallback, useEffect, useState } from 'react';
import type { Coverage, CoverageCell, ScoutingCore } from '../core/scoutingCore';
import { STATIONS, type Station } from '../shared/contract';
import type { Screen } from './App';

const SHORT: Record<Station, string> = { 'Red 1': 'R1', 'Red 2': 'R2', 'Red 3': 'R3', 'Blue 1': 'B1', 'Blue 2': 'B2', 'Blue 3': 'B3' };

function cellState({ count }: CoverageCell): 'gap' | 'covered' | 'duplicate' {
  return count === 0 ? 'gap' : count === 1 ? 'covered' : 'duplicate';
}

function describeCell(matchNumber: number, station: Station, cell: CoverageCell): string {
  const team = cell.teamNumber === undefined ? '' : `, Team ${cell.teamNumber}`;
  const reports = cell.count === 0 ? 'no Reports' : cell.count === 1 ? '1 Report' : `${cell.count} Reports`;
  return `Match ${matchNumber}, ${station}${team}: ${reports}`;
}

/** A reason as a sentence of its own. */
function sentence(text = ''): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Which Stations in which matches have Match Reports, so a Scout lead can spot robots nobody has scouted. */
export function CoverageScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const [coverage, setCoverage] = useState<{ result: Coverage; at: Date } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setCoverage({ result: await core.refreshCoverage(), at: new Date() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [core]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scheduledCells = coverage?.result.rows.filter((r) => r.scheduled).flatMap((r) => Object.values(r.stations)) ?? [];
  const scouted = scheduledCells.filter((c) => c.count > 0).length;

  return (
    <main>
      <button className="link" onClick={() => navigate({ name: 'home' })}>
        ‹ Home
      </button>
      <h1>Coverage</h1>
      <p className="muted">
        {busy ? 'Getting Coverage…' : coverage ? `Event ${coverage.result.eventKey}` : ''}
        {!busy && (
          <>
            {coverage && ' · '}
            <button className="link" onClick={refresh}>
              Refresh
            </button>
          </>
        )}
      </p>
      {error && <p className="error">{error}</p>}

      {coverage &&
        (coverage.result.source === 'everyone' ? (
          <p className="coverage-source">
            From everyone’s Uploads, as of {coverage.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          </p>
        ) : (
          <p className="coverage-source local" role="status">
            <strong>This device only.</strong> Reports on other devices aren’t counted. {sentence(coverage.result.reason)}
          </p>
        ))}

      {coverage && (
        <>
          <p className="muted">
            {scouted} of {scheduledCells.length} scheduled Stations scouted. Green: scouted. Grey: nobody yet. Amber:
            more than one Report.
          </p>
          <table className="coverage">
            <thead>
              <tr>
                <th scope="col">Match</th>
                {STATIONS.map((station) => (
                  <th key={station} scope="col" className={station.startsWith('Red') ? 'red' : 'blue'} title={station}>
                    {SHORT[station]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.result.rows.map((row) => (
                <tr key={row.matchNumber}>
                  <th scope="row">
                    {row.matchNumber}
                    {!row.scheduled && <span className="unscheduled">*</span>}
                  </th>
                  {STATIONS.map((station) => {
                    const cell = row.stations[station];
                    return (
                      <td key={station} className={cellState(cell)} aria-label={describeCell(row.matchNumber, station, cell)}>
                        <span className="team">{cell.teamNumber ?? '—'}</span>
                        {cell.count > 1 && (
                          <>
                            <wbr />
                            <sup className="count">×{cell.count}</sup>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {coverage.result.rows.some((r) => !r.scheduled) && (
            <p className="muted">* Not in the schedule, such as a playoff match.</p>
          )}
        </>
      )}
    </main>
  );
}
