// HETEC Sign – PC App Service Worker
// Wichtig: cached ausschließlich die App-Shell (HTML/Manifest/Icons).
// PDFs, Session-Daten und alle Firebase-/Storage-Requests laufen NIE durch den Cache.

const CACHE_NAME = 'hetec-sign-pc-shell-v1';
const SHELL_FILES = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShellFile =
    url.origin === self.location.origin &&
    SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));

  if (!isShellFile) {
    // Alles andere (Firestore, Storage, PDF-Bytes, Firebase Auth, CDN-Libs) unangetastet durchlassen.
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
