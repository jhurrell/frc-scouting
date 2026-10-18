// The app's service worker. It keeps a copy of every file the app needs, so the app opens and runs with no connection
// after the first visit. The build (src/pwa/serviceWorkerPlugin.ts) fills in the version and the file list, and writes
// the result to dist/sw.js. Local development doesn't use it.
//
// Updates: when a new version is deployed, the browser installs the new service worker beside this one, and it waits.
// It takes over only when the app asks it to (the Scout chooses Update, between Reports) or when every window of the
// app has been closed. So a version never changes under a Scout in the middle of a match.

const VERSION = '__VERSION__';
const FILES = self.__PRECACHE__;
const CACHE = `scouting-${VERSION}`;

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so the copy is this version's file and not an older one.
  const requests = FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'update') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('scouting-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Only the app's own files. Uploads and Event Bundle downloads go to the Apps Script, on another origin, untouched.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Opening the app always gets this version's page, which only refers to this version's files.
  const cached = request.mode === 'navigate' ? caches.match(new URL('index.html', self.registration.scope).href) : caches.match(request);
  event.respondWith(cached.then((response) => response ?? fetch(request)));
});
