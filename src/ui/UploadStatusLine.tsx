import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';

function subscribeToConnection(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Shown on every screen: how many Reports are waiting to Upload, and why the last Upload failed, if it did. */
export function UploadStatusLine({ core }: { core: ScoutingCore }) {
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine);
  const pending = useLiveQuery(() => core.pendingUploads(), [], []);
  const status = useLiveQuery(() => core.getUploadStatus());

  if (pending.length === 0) return <p className="upload-status muted">Nothing waiting to Upload</p>;

  const waiting = `${pending.length} Report${pending.length === 1 ? '' : 's'} waiting to Upload`;
  const refused = pending.filter((report) =>
    status?.rejections.some((r) => r.reportId === report.id && r.updatedAt === report.updatedAt),
  ).length;
  const notes: string[] = [];
  if (!online) notes.push('Offline: they’ll Upload when the connection comes back.');
  else if (status?.error) notes.push(`Last Upload failed: ${status.error}`);
  if (refused > 0) notes.push(`${refused} not accepted by the Season Sheet. See My Reports.`);

  return (
    <p className={`upload-status ${status?.error || refused > 0 ? 'error' : 'pending'}`} role="status">
      <strong>{waiting}</strong>
      {notes.map((note) => (
        <span key={note}> · {note}</span>
      ))}
    </p>
  );
}
