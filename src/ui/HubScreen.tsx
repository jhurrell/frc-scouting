import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type FormEvent } from 'react';
import type { ScanResult, ScoutingCore } from '../core/scoutingCore';
import type { Report } from '../shared/contract';
import type { Screen } from './App';
import { CameraScanner } from './CameraScanner';

function describe(report: Report): string {
  return report.kind === 'match'
    ? `Match ${report.matchNumber} · ${report.station} · Team ${report.teamNumber}`
    : `Pit · Team ${report.teamNumber}`;
}

const OUTCOME_TEXT: Record<ScanResult['outcome'], string> = {
  added: 'Added',
  updated: 'Updated with a newer copy',
  duplicate: 'Already had this one. Nothing changed.',
  older: 'Already had a newer copy. Kept that one.',
};

/**
 * Collects Scouts' Reports by QR code, from the camera or a keyboard-style scanner such as the KU061, which types
 * what it reads into the focused box and presses Enter. The Reports Upload from here under their own Scouts.
 */
export function HubScreen({ core, navigate }: { core: ScoutingCore; navigate: (screen: Screen) => void }) {
  const received = useLiveQuery(() => core.listHubReports(), [], []);
  const [typed, setTyped] = useState('');
  const [camera, setCamera] = useState(false);
  const [last, setLast] = useState<{ result: ScanResult } | { error: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function accept(text: string) {
    try {
      const result = await core.acceptScan(text);
      setLast({ result });
      navigator.vibrate?.(result.outcome === 'added' || result.outcome === 'updated' ? 80 : [40, 60, 40]);
    } catch (e) {
      setLast({ error: e instanceof Error ? e.message : String(e) });
      navigator.vibrate?.([200, 100, 200]);
    }
  }

  async function submitTyped(event: FormEvent) {
    event.preventDefault();
    const text = typed;
    setTyped('');
    input.current?.focus();
    if (text.trim() !== '') await accept(text);
  }

  return (
    <main>
      <button className="link" onClick={() => navigate({ name: 'home' })}>
        ‹ Home
      </button>
      <h1>Hub</h1>
      <p className="muted">
        Collect Scouts’ Reports by QR code. They Upload from this device under the Scout who made them.
      </p>

      <form onSubmit={submitTyped} className="stack">
        <label>
          Scanner input
          <input
            ref={input}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Click here, then scan with the KU061"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </form>

      <button className="secondary" onClick={() => setCamera(!camera)}>
        {camera ? 'Stop the camera' : 'Scan with the camera'}
      </button>
      {camera && <CameraScanner onScan={accept} />}

      {last &&
        ('error' in last ? (
          <p className="scan-result error" role="alert">
            Not accepted: {last.error}
          </p>
        ) : (
          <p className={`scan-result ${last.result.outcome}`} role="status">
            <strong>{OUTCOME_TEXT[last.result.outcome]}</strong>
            <br />
            {last.result.scoutName} · {describe(last.result.report)}
          </p>
        ))}

      <h2>Received here</h2>
      {received.length === 0 && <p className="muted">Nothing scanned yet.</p>}
      <ul className="report-list">
        {received.map(({ report, scoutName, uploaded }) => (
          <li key={report.id} className="row">
            <span>
              {scoutName} · {describe(report)}
              {report.voided && ' · Void'}
            </span>
            <span className={`badge ${uploaded ? 'complete' : 'pending'}`}>{uploaded ? 'Uploaded' : 'Waiting'}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
