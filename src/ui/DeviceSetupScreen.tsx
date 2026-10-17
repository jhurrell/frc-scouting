import { useState, type FormEvent } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import type { Screen } from './App';

/** An Admin enters the team access code once per device. It is stored on the device only. */
export function DeviceSetupScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await core.setAccessCode(accessCode);
      await core.refreshEventBundle();
      navigate({ name: 'home' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Device setup</h1>
      <p className="muted">An Admin enters the team access code once on each device.</p>
      <form onSubmit={save} className="stack">
        <label>
          Access code
          <input
            type="password"
            autoComplete="off"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Save and download the Event Bundle'}
        </button>
      </form>
    </main>
  );
}
