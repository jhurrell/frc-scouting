import { useSyncExternalStore } from 'react';
import type { AppUpdates } from '../pwa/appUpdates';

/** Offers a new version of the app. App shows it only between Reports, so an update never interrupts a match. */
export function UpdateOffer({ updates }: { updates: AppUpdates }) {
  const ready = useSyncExternalStore(updates.subscribe, updates.isReady);
  if (!ready) return null;
  return (
    <p className="update-offer" role="status">
      A new version of the app is ready.{' '}
      <button className="link" onClick={() => updates.apply()}>
        Update now
      </button>
    </p>
  );
}
