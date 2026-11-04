// Dauerhafter Speicher auf dem Geraet: SQLite im Arbeitsspeicher, nach jeder Aenderung
// als Ganzes in IndexedDB geschrieben. Bei 164 KB Datenbank ist das schnell und robust.
//
// Invarianten:
// - "db" und "db_vorher" werden in EINER IndexedDB-Transaktion geschrieben, ein Absturz
//   mitten im Speichern kann den letzten guten Stand also nicht zerstoeren.
// - Ein Einspielen ersetzt Daten erst, nachdem die neue Datenbank die Pruefung bestanden hat.

import { schemaSichern } from "./logik.js";

const DB_NAME = "praxis";
let idb, SQL, roh, db;

function oeffneIdb() {
  return new Promise((ok, fehler) => {
    const a = indexedDB.open(DB_NAME, 1);
    a.onupgradeneeded = () => {
      a.result.createObjectStore("kv");
      a.result.createObjectStore("pdfs");
    };
    a.onsuccess = () => ok(a.result);
    a.onerror = () => fehler(a.error);
  });
}
function tx(stores, modus, arbeit) {
  return new Promise((ok, fehler) => {
    const t = idb.transaction(stores, modus);
    let ergebnis;
    t.oncomplete = () => ok(ergebnis);
    t.onerror = t.onabort = () => fehler(t.error || new Error("Speichern fehlgeschlagen"));
    const r = arbeit(t, (w) => { ergebnis = w; });
    if (r && "onsuccess" in r) r.onsuccess = () => { ergebnis = r.result; };
  });
}

export const kvLesen = (k) => tx("kv", "readonly", (t) => t.objectStore("kv").get(k));
export const kvSchreiben = (k, w) => tx("kv", "readwrite", (t) => { t.objectStore("kv").put(w, k); });
export const pdfLesen = (nr) => tx("pdfs", "readonly", (t) => t.objectStore("pdfs").get(nr));
export const pdfSchreiben = (nr, bytes) => tx("pdfs", "readwrite", (t) => { t.objectStore("pdfs").put(bytes, nr); });

function huelle(r) {
  const fk = () => r.run("PRAGMA foreign_keys=ON");
  fk();
  const all = (sql, p = []) => {
    const st = r.prepare(sql);
    try {
      st.bind(p);
      const zeilen = [];
      while (st.step()) zeilen.push(st.getAsObject());
      return zeilen;
    } finally { st.free(); }
  };
  return {
    all, fk,
    get: (sql, p = []) => all(sql, p)[0],
    run: (sql, p = []) => r.run(sql, p),
    exec: (sql) => r.exec(sql),
    tx(fn) {
      r.run("BEGIN");
      try { const e = fn(); r.run("COMMIT"); return e; }
      catch (x) { r.run("ROLLBACK"); throw x; }
    },
  };
}

export async function starten() {
  idb = await oeffneIdb();
  SQL = await window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
  const bytes = await kvLesen("db");
  if (!bytes) return null;
  roh = new SQL.Database(bytes);
  db = huelle(roh);
  schemaSichern(db);
  return db;
}

export function neuBeginnen() {
  roh = new SQL.Database();
  db = huelle(roh);
  schemaSichern(db);
  return db;
}
export const aktuelleDb = () => db;

// Nach jeder Aenderung aufrufen und abwarten, bevor der Nutzerin Erfolg gemeldet wird.
export async function speichern({ zaehlt = true } = {}) {
  const neu = roh.export();
  db.fk();
  const alt = await kvLesen("db");
  const stand = zaehlt ? ((await kvLesen("aenderungen")) || 0) + 1 : (await kvLesen("aenderungen")) || 0;
  await tx("kv", "readwrite", (t) => {
    const s = t.objectStore("kv");
    if (alt) s.put(alt, "db_vorher");
    s.put(neu, "db");
    s.put(stand, "aenderungen");
  });
}

export function datenbankBytes() {
  const b = roh.export();
  db.fk();
  return b;
}

export async function allePdfs() {
  return tx("pdfs", "readonly", (t, fertig) => {
    const s = t.objectStore("pdfs");
    const aus = {};
    s.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { aus[c.key] = new Uint8Array(c.value); c.continue(); } else fertig(aus);
    };
  });
}

// Prueft eine eingehende Datenbank, ohne den aktuellen Stand anzufassen.
export function datenbankPruefen(bytes) {
  const test = new SQL.Database(bytes);
  try {
    const h = huelle(test);
    if (h.get("PRAGMA integrity_check").integrity_check !== "ok") throw new Error("Die Datenbank im Backup ist beschädigt.");
    for (const t of ["kunden", "rechnungen", "positionen", "einstellungen"]) {
      if (!h.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?", [t])) {
        throw new Error("Im Backup fehlen Daten der Praxis-App.");
      }
    }
    return {
      kunden: h.get("SELECT COUNT(*) AS n FROM kunden").n,
      rechnungen: h.get("SELECT COUNT(*) AS n FROM rechnungen").n,
    };
  } finally { test.close(); }
}

export async function einspielen({ datenbank, pdfs }) {
  datenbankPruefen(datenbank);
  const alt = await kvLesen("db");
  await tx(["kv", "pdfs"], "readwrite", (t) => {
    const kv = t.objectStore("kv");
    if (alt) kv.put(alt, "db_vorher");
    kv.put(datenbank, "db");
    kv.put(0, "aenderungen");
    const p = t.objectStore("pdfs");
    p.clear();
    for (const [nr, b] of Object.entries(pdfs)) p.put(b, nr);
  });
  roh = new SQL.Database(datenbank);
  db = huelle(roh);
  schemaSichern(db);
}
