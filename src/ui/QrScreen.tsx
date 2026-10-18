import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import type { Screen } from './App';
import { QrCode } from './QrCode';

interface Props {
  core: ScoutingCore;
  reportId: string;
  navigate: (screen: Screen) => void;
}

/** Shows one Complete Report as a QR code for a Hub to scan, then lets the Scout mark it handed off. */
export function QrScreen({ core, reportId, navigate }: Props) {
  const report = useLiveQuery(() => core.getReport(reportId), [reportId]);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    core.qrTextFor(reportId).then(setText, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [core, reportId]);

  const title = !report
    ? 'Report'
    : report.kind === 'match'
      ? `Match ${report.matchNumber} · ${report.station} · Team ${report.teamNumber}`
      : `Pit · Team ${report.teamNumber}`;

  async function handedOff() {
    try {
      await core.markHandedOff(reportId);
      navigate({ name: 'home' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <button className="link" onClick={() => navigate({ name: 'report', reportId })}>
        ‹ Back to the Report
      </button>
      <h1>QR code</h1>
      <p>{title}</p>
      {text && (
        <>
          <QrCode text={text} label={`QR code for ${title}`} />
          <p className="muted">
            Turn the brightness up and hold the screen steady for the Hub. Once the Hub has confirmed the scan, mark the
            Report as handed off so it stops counting as waiting here.
          </p>
          <button className="primary" onClick={handedOff}>
            The Hub has it: mark as handed off
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
