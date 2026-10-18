/** Whether a new version of the app is ready, and a way to switch to it. */
export interface AppUpdates {
  subscribe(listener: () => void): () => void;
  /** True once a new version has been downloaded and is waiting to take over. */
  isReady(): boolean;
  /** Switches to the new version and reloads the app. Only call it between Reports. */
  apply(): void;
}

/** For local development and browsers without service workers: never an update. */
export const noUpdates: AppUpdates = {
  subscribe: () => () => {},
  isReady: () => false,
  apply: () => {},
};

/** How often an app left open, as a Hub might be all day, checks for a new version. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Registers the service worker that keeps the app working offline (src/pwa/serviceWorker.js), and watches for updates. */
export function registerServiceWorker(url: string): AppUpdates {
  const listeners = new Set<() => void>();
  let waiting: ServiceWorker | undefined;
  let applying = false;

  function setWaiting(worker: ServiceWorker) {
    waiting = worker;
    for (const listener of listeners) listener();
  }

  // Ask the browser not to clear the app's storage when space runs low, so Reports that haven't Uploaded are kept.
  navigator.storage?.persist?.().catch(() => {});

  navigator.serviceWorker
    .register(url)
    .then((registration) => {
      // A version downloaded on an earlier visit that is still waiting.
      if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          // With no controller yet, this is the first install on this device, not an update.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaiting(installing);
        });
      });

      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    })
    .catch((error) => console.warn('Could not register the service worker', error));

  // Reload only for an update this window asked for. The first install also changes the controller.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) window.location.reload();
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isReady: () => waiting !== undefined,
    apply() {
      if (!waiting || applying) return;
      applying = true;
      waiting.postMessage('update');
    },
  };
}
