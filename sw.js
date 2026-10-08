/* Service Worker – macht die App offline nutzbar.
   Nach Änderungen an index.html, app.js oder styles.css die Versionsnummer erhöhen,
   damit die Geräte die neue Version laden. faelle.json wird immer zuerst online gesucht. */
const CACHE = 'rd-checkliste-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './faelle.json',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Fallbeispiele: zuerst Netz (damit Änderungen sofort ankommen), sonst Cache
  if (url.pathname.endsWith('/faelle.json')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./faelle.json', copy));
          return res;
        })
        .catch(() => caches.match('./faelle.json'))
    );
    return;
  }

  // App-Seite: bei Navigation immer index.html liefern
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Übrige Dateien: zuerst Cache, sonst Netz
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
