import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { STATIONS, type Station } from '../shared/contract';
import type { Screen } from './App';

export function NewMatchReportScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const [matchNumber, setMatchNumber] = useState('');
  const [station, setStation] = useState<Station | null>(null);
  const [typedTeam, setTypedTeam] = useState('');
  const [error, setError] = useState<string | null>(null);

  const match = Number(matchNumber);
  const scheduled = useLiveQuery(() => (match >= 1 ? core.scheduledMatch(match) : undefined), [match]);
  const scheduledTeam = station ? scheduled?.stations[station] : undefined;

  async function start(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!station) return setError('Choose a Station');
    try {
      const report = await core.startMatchReport({
        matchNumber: match,
        station,
        teamNumber: scheduledTeam === undefined ? Number(typedTeam) : undefined,
      });
      navigate({ name: 'match-report', reportId: report.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <button className="link" onClick={() => navigate({ name: 'home' })}>
        ‹ Home
      </button>
      <h1>New Match Report</h1>
      <form onSubmit={start} className="stack">
        <label>
          Match number
          <input inputMode="numeric" value={matchNumber} onChange={(e) => setMatchNumber(e.target.value)} required />
        </label>
        {matchNumber !== '' && !scheduled && (
          <p className="muted">Match {matchNumber} isn't in the qualification schedule. Type the team number below.</p>
        )}

        <fieldset className="stations">
          <legend>Station</legend>
          <div className="choices" role="radiogroup">
            {STATIONS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={station === s}
                className={s.startsWith('Red') ? 'red' : 'blue'}
                onClick={() => setStation(s)}
              >
                {s}
                {scheduled?.stations[s] !== undefined && <span className="team">{scheduled.stations[s]}</span>}
              </button>
            ))}
          </div>
        </fieldset>

        {station &&
          (scheduledTeam !== undefined ? (
            <p>
              Team <strong>{scheduledTeam}</strong> <span className="muted">from the schedule</span>
            </p>
          ) : (
            <label>
              Team number
              <input inputMode="numeric" value={typedTeam} onChange={(e) => setTypedTeam(e.target.value)} required />
            </label>
          ))}

        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          Start
        </button>
      </form>
    </main>
  );
}
