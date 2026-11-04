// Haelt die App offline verfuegbar. Bei JEDER Aenderung an einer Datei VERSION erhoehen,
// sonst bekommt das iPhone das Update nicht. tests/app.test.mjs prueft die Dateiliste.
const VERSION = "praxis-1";
const DATEIEN = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/app.js", "js/logik.js", "js/speicher.js", "js/pdf.js", "js/ui.js", "js/backup-format.js",
  "vendor/sql-wasm.js", "vendor/sql-wasm.wasm", "vendor/jspdf.umd.min.js", "vendor/qrcode.js",
  "fonts/atkinson-hyperlegible-latin-400-normal.woff2", "fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "fonts/young-serif-latin-400-normal.woff2", "fonts/nunito-latin-800-normal.woff2",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((t) => t || fetch(e.request)));
});
