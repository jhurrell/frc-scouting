import { useState, type FormEvent } from 'react';
import { eventLabel, type ScoutingCore } from '../core/scoutingCore';
import type { EventBundle } from '../shared/contract';
import type { Screen } from './App';

interface Props {
  core: ScoutingCore;
  bundle: EventBundle;
  navigate: (screen: Screen) => void;
}

/** A Scout picks their name and enters their PIN. The PIN is checked on the device, so this works offline. */
export function LoginScreen({ core, bundle, navigate }: Props) {
  const [scoutId, setScoutId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function logIn(event: FormEvent) {
    event.preventDefault();
    if (!scoutId) return setError('Choose your name');
    setError(null);
    try {
      await core.login(scoutId, pin);
      navigate({ name: 'home' });
    } catch (e) {
      setPin('');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      await core.refreshEventBundle();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const roster = [...bundle.roster].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main>
      <h1>Log in</h1>
      <p className="muted">
        {eventLabel(bundle)} ·{' '}
        <button className="link" disabled={busy} onClick={refresh}>
          Refresh
        </button>{' '}
        ·{' '}
        <button className="link" onClick={() => navigate({ name: 'device-setup' })}>
          Device setup
        </button>
      </p>

      {roster.length === 0 ? (
        <p>
          The roster is empty. An Admin adds Scouts in the Season Sheet's Scouts tab, then this device needs a
          Refresh.
        </p>
      ) : (
        <form onSubmit={logIn} className="stack">
          <fieldset className="roster">
            <legend>Who are you?</legend>
            <div className="choices" role="radiogroup">
              {roster.map((scout) => (
                <button
                  key={scout.scoutId}
                  type="button"
                  role="radio"
                  aria-checked={scoutId === scout.scoutId}
                  onClick={() => setScoutId(scout.scoutId)}
                >
                  {scout.name}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={!scoutId || pin.length !== 4}>
            Log in
          </button>
        </form>
      )}
      {roster.length === 0 && error && <p className="error">{error}</p>}
    </main>
  );
}
