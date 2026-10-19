import { useState, type FormEvent } from 'react';
import { eventLabel, type ScoutingCore } from '../core/scoutingCore';
import type { EventBundle } from '../shared/contract';
import type { Screen } from './App';

interface Props {
  core: ScoutingCore;
  bundle: EventBundle;
  navigate: (screen: Screen) => void;
}

/** A Scout picks a team from the event's team list, or types a team number that isn't on it. */
export function NewPitReportScreen({ core, bundle, navigate }: Props) {
  const [chosenTeam, setChosenTeam] = useState<number | null>(null);
  const [typedTeam, setTypedTeam] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function start(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const teamNumber = chosenTeam ?? (typedTeam.trim() === '' ? null : Number(typedTeam));
    if (teamNumber === null) return setError('Choose a team or type its number');
    try {
      const report = await core.startPitReport({ teamNumber });
      navigate({ name: 'report', reportId: report.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <button className="link" onClick={() => navigate({ name: 'home' })}>
        ‹ Home
      </button>
      <h1>New Pit Report</h1>
      <form onSubmit={start} className="stack">
        {bundle.teams.length === 0 ? (
          <p className="muted">The team list for {eventLabel(bundle)} isn't published yet. Type the team number below.</p>
        ) : (
          <fieldset className="teams">
            <legend>Team</legend>
            <div className="choices" role="radiogroup">
              {bundle.teams.map((team) => (
                <button
                  key={team}
                  type="button"
                  role="radio"
                  aria-checked={chosenTeam === team}
                  onClick={() => {
                    setChosenTeam(team);
                    setTypedTeam('');
                  }}
                >
                  {team}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label>
          {bundle.teams.length === 0 ? 'Team number' : 'Or type a team number that isn’t listed'}
          <input
            inputMode="numeric"
            value={typedTeam}
            onChange={(e) => {
              setTypedTeam(e.target.value);
              setChosenTeam(null);
            }}
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          Start
        </button>
      </form>
    </main>
  );
}
