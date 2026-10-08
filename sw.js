/* Service Worker – macht die App offline nutzbar.
   Strategie: Bei Internetverbindung wird immer die neueste Version geladen
   (und im Speicher abgelegt). Ohne Verbindung kommt die gespeicherte Version.
   Eine Versionsnummer muss bei Änderungen nicht mehr angepasst werden. */
const CACHE = 'rd-checkliste-v3';
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
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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

  // Zuerst Netz (neueste Version), bei fehlender Verbindung aus dem Speicher
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          const key = req.mode === 'navigate' ? './index.html' : req;
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});
