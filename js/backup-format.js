// Verschluesseltes Backup-Format, identisch im Browser und im Umzugs-Werkzeug.
// Aufbau: "PRAXISB1" | salt(16) | iv(12) | AES-256-GCM(Nutzlast), Schluessel per PBKDF2-SHA256.
// Nutzlast: Laenge(4) | Meta-JSON | Datenbank | PDFs direkt hintereinander.
// Ein falsches Passwort oder eine beschaedigte Datei scheitert an der GCM-Pruefung,
// es kann also nie halb gelesener Muell eingespielt werden.

const MAGIC = new TextEncoder().encode("PRAXISB1");
const ITERATIONEN = 310000;

async function schluessel(passwort, salt, nutzung) {
  const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONEN, hash: "SHA-256" },
    basis, { name: "AES-GCM", length: 256 }, false, [nutzung]);
}

export async function backupVerpacken({ datenbank, pdfs, info = {} }, passwort) {
  const eintraege = Object.entries(pdfs);
  const meta = new TextEncoder().encode(JSON.stringify({
    version: 1, erstellt: new Date().toISOString(), ...info,
    datenbank: datenbank.length, pdfs: eintraege.map(([nr, b]) => [nr, b.length]),
  }));
  const gesamt = 4 + meta.length + datenbank.length + eintraege.reduce((s, [, b]) => s + b.length, 0);
  const nutzlast = new Uint8Array(gesamt);
  new DataView(nutzlast.buffer).setUint32(0, meta.length);
  nutzlast.set(meta, 4);
  let pos = 4 + meta.length;
  nutzlast.set(datenbank, pos);
  pos += datenbank.length;
  for (const [, b] of eintraege) { nutzlast.set(b, pos); pos += b.length; }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const inhalt = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv },
    await schluessel(passwort, salt, "encrypt"), nutzlast));
  const aus = new Uint8Array(MAGIC.length + 28 + inhalt.length);
  aus.set(MAGIC, 0);
  aus.set(salt, MAGIC.length);
  aus.set(iv, MAGIC.length + 16);
  aus.set(inhalt, MAGIC.length + 28);
  return aus;
}

export async function backupEntpacken(bytes, passwort) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < MAGIC.length + 28 || MAGIC.some((x, i) => b[i] !== x)) {
    throw new Error("Das ist keine Backup-Datei der Praxis-App.");
  }
  const salt = b.slice(MAGIC.length, MAGIC.length + 16);
  const iv = b.slice(MAGIC.length + 16, MAGIC.length + 28);
  let nutzlast;
  try {
    nutzlast = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv },
      await schluessel(passwort, salt, "decrypt"), b.slice(MAGIC.length + 28)));
  } catch {
    throw new Error("Das Passwort stimmt nicht, oder die Datei ist beschädigt.");
  }
  const metaLaenge = new DataView(nutzlast.buffer).getUint32(0);
  const meta = JSON.parse(new TextDecoder().decode(nutzlast.subarray(4, 4 + metaLaenge)));
  let pos = 4 + metaLaenge;
  const datenbank = nutzlast.slice(pos, pos + meta.datenbank);
  pos += meta.datenbank;
  const pdfs = {};
  for (const [nr, laenge] of meta.pdfs) { pdfs[nr] = nutzlast.slice(pos, pos + laenge); pos += laenge; }
  return { meta, datenbank, pdfs };
}
