// Fachlogik der Praxis-App. Kennt weder Browser noch Oberflaeche, damit sie auch
// in den Node-Tests gegen die echte Datenbank laeuft.
//
// Invarianten:
// - Rechnungsnummer und Rechnung entstehen in EINER Transaktion: keine neuen Luecken.
// - Stornierte Rechnungen zaehlen nirgends als Umsatz oder als offen.
// - Daten bleiben ISO-Text (JJJJ-MM-TT), genau wie in der alten Flask-Datenbank.

const NICHT_STORNIERT = "(r.storniert IS NULL OR r.storniert = 0)";

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kunden (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kundennr TEXT UNIQUE NOT NULL,
    vorname TEXT NOT NULL, nachname TEXT NOT NULL, strasse TEXT DEFAULT '', plz TEXT DEFAULT '',
    ort TEXT DEFAULT '', telefon TEXT DEFAULT '', notiz TEXT DEFAULT '', aktiv INTEGER DEFAULT 1,
    erstellt TEXT DEFAULT (datetime('now','localtime')),
    "blutverdünner" INTEGER DEFAULT 0, diabetiker INTEGER DEFAULT 0, standardpreis REAL DEFAULT NULL);
  CREATE TABLE IF NOT EXISTS rechnungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT, rechnungsnr TEXT UNIQUE NOT NULL, kunde_id INTEGER NOT NULL,
    datum TEXT NOT NULL, faellig TEXT NOT NULL, bezahlt INTEGER DEFAULT 0, bezahlt_am TEXT,
    betrag REAL NOT NULL DEFAULT 0, notiz TEXT DEFAULT '',
    erstellt TEXT DEFAULT (datetime('now','localtime')),
    storniert INTEGER DEFAULT 0, storno_grund TEXT DEFAULT '', storno_datum TEXT DEFAULT '',
    FOREIGN KEY (kunde_id) REFERENCES kunden(id));
  CREATE TABLE IF NOT EXISTS positionen (
    id INTEGER PRIMARY KEY AUTOINCREMENT, rechnung_id INTEGER NOT NULL, beschreibung TEXT NOT NULL,
    menge REAL NOT NULL DEFAULT 1, einzelpreis REAL NOT NULL, datum TEXT DEFAULT '',
    FOREIGN KEY (rechnung_id) REFERENCES rechnungen(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS einstellungen (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS leistungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, preis REAL NOT NULL,
    aktiv INTEGER DEFAULT 1, reihenfolge INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS heim_fusspflege (
    id INTEGER PRIMARY KEY AUTOINCREMENT, bewohner_id INTEGER NOT NULL, datum TEXT NOT NULL,
    naechster_termin TEXT DEFAULT '', notiz TEXT DEFAULT '',
    erstellt TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (bewohner_id) REFERENCES kunden(id));
  CREATE TABLE IF NOT EXISTS heime (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, strasse TEXT DEFAULT '', plz TEXT DEFAULT '',
    ort TEXT DEFAULT '', aktiv INTEGER DEFAULT 1, erstellt TEXT DEFAULT (datetime('now','localtime')));
`;

export const FIRMA_LEER = {
  name: "", inhaber: "", strasse: "", plz_ort: "", telefon: "", mobil: "", steuernr: "",
  iban: "", bic: "", bank: "", zahlungsziel_tage: 14,
};

export function schemaSichern(db) {
  db.exec(SCHEMA);
  if (!db.get("SELECT value FROM einstellungen WHERE key='naechste_nr'")) {
    db.run("INSERT INTO einstellungen VALUES ('naechste_nr','1')");
  }
}

// ---------- Hilfen ----------
export function isoDatum(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function datumPlusTage(iso, tage) {
  const [j, m, t] = iso.split("-").map(Number);
  return isoDatum(new Date(j, m - 1, t + tage));
}
export const rund2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// ---------- Firma ----------
export function firmaLesen(db) {
  const z = db.get("SELECT value FROM einstellungen WHERE key='firma'");
  return { ...FIRMA_LEER, ...(z ? JSON.parse(z.value) : {}) };
}
export function firmaSpeichern(db, firma) {
  db.run("INSERT OR REPLACE INTO einstellungen VALUES ('firma', ?)", [JSON.stringify({ ...FIRMA_LEER, ...firma })]);
}

// ---------- Start ----------
export function startDaten(db, heute) {
  const offene = db.all(`SELECT r.*, k.vorname, k.nachname, k.kundennr FROM rechnungen r
    JOIN kunden k ON r.kunde_id = k.id WHERE r.bezahlt = 0 AND ${NICHT_STORNIERT} ORDER BY r.faellig ASC`);
  const stats = db.get(`SELECT
      COALESCE(SUM(CASE WHEN bezahlt=1 THEN betrag ELSE 0 END),0) AS einnahmen,
      COALESCE(SUM(CASE WHEN bezahlt=0 THEN betrag ELSE 0 END),0) AS offen
    FROM rechnungen r WHERE substr(datum,1,4) = ? AND ${NICHT_STORNIERT}`, [heute.slice(0, 4)]);
  return {
    ueberfaellig: offene.filter((r) => r.faellig < heute),
    bald: offene.filter((r) => r.faellig >= heute),
    stats,
    kundenAnzahl: db.get("SELECT COUNT(*) AS n FROM kunden WHERE aktiv=1").n,
  };
}

// ---------- Kunden ----------
export const kundenListe = (db) => db.all(`SELECT k.*, COUNT(r.id) AS rechnungen_count, MAX(r.datum) AS letzte_rechnung
  FROM kunden k LEFT JOIN rechnungen r ON k.id = r.kunde_id AND ${NICHT_STORNIERT}
  WHERE k.aktiv = 1 GROUP BY k.id ORDER BY k.nachname, k.vorname`);
export const kundeLesen = (db, id) => db.get("SELECT * FROM kunden WHERE id=?", [id]);
export const naechsteKundennr = (db) =>
  String((db.get("SELECT MAX(CAST(kundennr AS INTEGER)) AS m FROM kunden").m || 0) + 1);

export function kundeSpeichern(db, k) {
  const werte = [k.vorname, k.nachname, k.strasse || "", k.plz || "", k.ort || "", k.telefon || "", k.notiz || "",
    k.standardpreis ?? null, k.blutverduenner ? 1 : 0, k.diabetiker ? 1 : 0];
  if (k.id) {
    db.run(`UPDATE kunden SET vorname=?, nachname=?, strasse=?, plz=?, ort=?, telefon=?, notiz=?, standardpreis=?,
      "blutverdünner"=?, diabetiker=? WHERE id=?`, [...werte, k.id]);
    return k.id;
  }
  if (db.get("SELECT 1 AS x FROM kunden WHERE kundennr=?", [k.kundennr])) {
    throw new Error("Diese Kundennummer ist schon vergeben.");
  }
  db.run(`INSERT INTO kunden (vorname, nachname, strasse, plz, ort, telefon, notiz, standardpreis, "blutverdünner", diabetiker, kundennr)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [...werte, k.kundennr]);
  return db.get("SELECT last_insert_rowid() AS id").id;
}

// ---------- Rechnungen ----------
const RECHNUNG_FELDER = "r.*, k.vorname, k.nachname, k.kundennr, k.strasse, k.plz, k.ort";

export function rechnungenListe(db, { jahr, suche, storniert } = {}) {
  const basis = `SELECT ${RECHNUNG_FELDER} FROM rechnungen r JOIN kunden k ON r.kunde_id = k.id`;
  if (storniert) return db.all(`${basis} WHERE r.storniert = 1 ORDER BY r.storno_datum DESC, r.id DESC`);
  if (suche) {
    const t = `%${suche}%`;
    return db.all(`${basis} WHERE ${NICHT_STORNIERT} AND (k.vorname LIKE ? OR k.nachname LIKE ?
      OR (k.vorname || ' ' || k.nachname) LIKE ? OR (k.nachname || ', ' || k.vorname) LIKE ? OR r.rechnungsnr LIKE ?)
      ORDER BY r.datum DESC, r.id DESC`, [t, t, t, t, t]);
  }
  return db.all(`${basis} WHERE substr(r.datum,1,4) = ? AND ${NICHT_STORNIERT} ORDER BY r.datum DESC, r.id DESC`, [jahr]);
}
export const rechnungsJahre = (db) =>
  db.all("SELECT DISTINCT substr(datum,1,4) AS j FROM rechnungen ORDER BY j DESC").map((z) => z.j);
export const stornoAnzahl = (db) => db.get("SELECT COUNT(*) AS n FROM rechnungen WHERE storniert=1").n;
export const rechnungLesen = (db, id) =>
  db.get(`SELECT ${RECHNUNG_FELDER} FROM rechnungen r JOIN kunden k ON r.kunde_id = k.id WHERE r.id=?`, [id]);
export const positionenLesen = (db, id) => db.all("SELECT * FROM positionen WHERE rechnung_id=? ORDER BY id", [id]);

export function positionenPruefen(positionen) {
  return positionen
    .filter((p) => String(p.beschreibung || "").trim() && Number(p.einzelpreis) > 0)
    .map((p) => ({
      beschreibung: String(p.beschreibung).trim(),
      menge: Number(p.menge) || 1,
      einzelpreis: Number(p.einzelpreis),
      datum: p.datum || "",
    }));
}

export function rechnungAnlegen(db, { kundeId, datum, faellig, notiz = "", positionen, duplikatOk = false }, heute = isoDatum()) {
  if (!kundeId) throw new Error("Bitte zuerst einen Kunden auswählen.");
  const pos = positionenPruefen(positionen);
  if (!pos.length) throw new Error("Bitte mindestens eine Leistung mit Preis eintragen.");
  const dat = datum || heute;
  const tage = Number(firmaLesen(db).zahlungsziel_tage) || 14;
  const fae = faellig || datumPlusTage(dat, tage);

  if (!duplikatOk) {
    const d = db.get(`SELECT rechnungsnr FROM rechnungen r WHERE kunde_id=? AND substr(datum,1,7)=? AND bezahlt=0
      AND ${NICHT_STORNIERT}`, [kundeId, dat.slice(0, 7)]);
    if (d) return { duplikat: d.rechnungsnr };
  }

  const betrag = rund2(pos.reduce((s, p) => s + p.menge * p.einzelpreis, 0));
  return db.tx(() => {
    const nr = Number(db.get("SELECT value FROM einstellungen WHERE key='naechste_nr'").value);
    const rechnungsnr = `RE-${heute.slice(0, 4)}-${String(nr).padStart(4, "0")}`;
    db.run("UPDATE einstellungen SET value=? WHERE key='naechste_nr'", [String(nr + 1)]);
    db.run("INSERT INTO rechnungen (rechnungsnr, kunde_id, datum, faellig, betrag, notiz) VALUES (?,?,?,?,?,?)",
      [rechnungsnr, kundeId, dat, fae, betrag, notiz]);
    const id = db.get("SELECT last_insert_rowid() AS id").id;
    for (const p of pos) {
      db.run("INSERT INTO positionen (rechnung_id, beschreibung, menge, einzelpreis, datum) VALUES (?,?,?,?,?)",
        [id, p.beschreibung, p.menge, p.einzelpreis, p.datum]);
    }
    return { id, rechnungsnr };
  });
}

export function bezahltSetzen(db, id, bezahlt, heute = isoDatum()) {
  db.run("UPDATE rechnungen SET bezahlt=?, bezahlt_am=? WHERE id=?", [bezahlt ? 1 : 0, bezahlt ? heute : null, id]);
}

export function stornieren(db, ids, grund, heute = isoDatum()) {
  const g = String(grund || "").trim();
  if (!g) throw new Error("Bitte einen Grund für das Storno angeben.");
  db.tx(() => {
    for (const id of ids) {
      db.run("UPDATE rechnungen SET storniert=1, storno_grund=?, storno_datum=? WHERE id=? AND (storniert IS NULL OR storniert=0)",
        [g, heute, id]);
    }
  });
}

// ---------- Jahr ----------
export function jahresDaten(db, jahr) {
  const felder = `COUNT(*) AS anzahl, COALESCE(SUM(betrag),0) AS summe,
    COALESCE(SUM(CASE WHEN bezahlt=1 THEN betrag ELSE 0 END),0) AS bezahlt,
    COALESCE(SUM(CASE WHEN bezahlt=0 THEN betrag ELSE 0 END),0) AS offen`;
  const wo = `FROM rechnungen r WHERE substr(datum,1,4)=? AND ${NICHT_STORNIERT}`;
  return {
    monate: db.all(`SELECT substr(datum,6,2) AS monat, ${felder} ${wo} GROUP BY monat ORDER BY monat`, [jahr]),
    gesamt: db.get(`SELECT ${felder} ${wo}`, [jahr]),
    storniert: db.get(`SELECT COUNT(*) AS anzahl, COALESCE(SUM(betrag),0) AS summe FROM rechnungen
      WHERE substr(datum,1,4)=? AND storniert=1`, [jahr]),
  };
}

// ---------- Leistungen ----------
export const leistungenListe = (db) => db.all("SELECT * FROM leistungen WHERE aktiv=1 ORDER BY reihenfolge, id");
export const leistungNeu = (db, name, preis) => db.run("INSERT INTO leistungen (name, preis) VALUES (?,?)", [name, preis]);
export const leistungAendern = (db, id, name, preis) => db.run("UPDATE leistungen SET name=?, preis=? WHERE id=?", [name, preis, id]);
export const leistungLoeschen = (db, id) => db.run("UPDATE leistungen SET aktiv=0 WHERE id=?", [id]);

// ---------- Heime: Bewohner sind Kunden mit der Strasse des Heims ----------
export const heimeListe = (db) => db.all("SELECT * FROM heime WHERE aktiv=1 ORDER BY name");
export const heimLesen = (db, id) => db.get("SELECT * FROM heime WHERE id=?", [id]);
export const heimNeu = (db, h) =>
  db.run("INSERT INTO heime (name, strasse, plz, ort) VALUES (?,?,?,?)", [h.name, h.strasse, h.plz || "", h.ort || ""]);
export const heimBewohner = (db, strasse) => db.all(`SELECT k.*, f.datum AS letzte_pflege, f.naechster_termin
  FROM kunden k LEFT JOIN heim_fusspflege f ON f.id = (
    SELECT id FROM heim_fusspflege WHERE bewohner_id = k.id ORDER BY datum DESC, id DESC LIMIT 1)
  WHERE k.aktiv = 1 AND k.strasse = ? ORDER BY k.nachname, k.vorname`, [strasse]);
export const fusspflegeEintragen = (db, f) =>
  db.run("INSERT INTO heim_fusspflege (bewohner_id, datum, naechster_termin, notiz) VALUES (?,?,?,?)",
    [f.bewohnerId, f.datum, f.naechster || "", f.notiz || ""]);
export const bewohnerHinweise = (db, id, blut, diab) =>
  db.run(`UPDATE kunden SET "blutverdünner"=?, diabetiker=? WHERE id=?`, [blut ? 1 : 0, diab ? 1 : 0, id]);
export const bewohnerAusHeim = (db, id) => db.run("UPDATE kunden SET strasse='', plz='', ort='' WHERE id=?", [id]);
export function bewohnerNeu(db, heim, b) {
  return kundeSpeichern(db, {
    kundennr: naechsteKundennr(db), vorname: b.vorname, nachname: b.nachname, telefon: b.telefon,
    strasse: heim.strasse, plz: heim.plz, ort: heim.ort, blutverduenner: b.blutverduenner, diabetiker: b.diabetiker,
  });
}

// ---------- Ueberweisungs-QR (EPC/GiroCode), Feldfolge wie in der alten App ----------
export function epcText(firma, rechnung) {
  return ["BCD", "002", "1", "SCT", firma.bic, firma.inhaber, String(firma.iban).replace(/\s/g, ""),
    `EUR${Number(rechnung.betrag).toFixed(2)}`, "", rechnung.rechnungsnr, ""].join("\n");
}
