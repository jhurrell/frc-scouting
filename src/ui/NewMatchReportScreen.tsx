import { useState, type FormEvent } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { STATIONS, type Station } from '../shared/contract';
import type { Screen } from './App';

export function NewMatchReportScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const [matchNumber, setMatchNumber] = useState('');
  const [station, setStation] = useState<Station>('Red 1');
  const [teamNumber, setTeamNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function start(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const report = await core.startMatchReport({
        matchNumber: Number(matchNumber),
        station,
        teamNumber: Number(teamNumber),
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
        <label>
          Station
          <select value={station} onChange={(e) => setStation(e.target.value as Station)}>
            {STATIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Team number
          <input inputMode="numeric" value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          Start
        </button>
      </form>
    </main>
  );
}
