// Oberflaeche und Navigation. Fachregeln stehen in logik.js, Speicherung in speicher.js.
//
// Invariante: Erfolg wird erst gemeldet, nachdem speichern() durch ist.
import * as L from "./logik.js";
import * as S from "./speicher.js";
import { rechnungPdf, sammelPdf, stornoPdf, jahresPdf, leistungsnachweisPdf } from "./pdf.js";
import { backupVerpacken, backupEntpacken } from "./backup-format.js";
import { h, roh, euro, datumDe, zahl, zahlText, ICON, meldung, dialog, bestaetigen, dateiAusgeben, dateiDialog } from "./ui.js";

const main = document.querySelector("main");
const nav = document.querySelector("nav.leiste");
const libs = () => ({ jsPDF: window.jspdf.jsPDF, qrcode: window.qrcode });
const heute = () => L.isoDatum();
const db = () => S.aktuelleDb();
const PDF_TYP = { type: "application/pdf" };
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const TAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const BACKUP_TAGE = 3;

function anzeigen(inhalt, { navAktiv = null, titel = "Praxis" } = {}) {
  main.innerHTML = inhalt.t ?? inhalt;
  document.title = titel;
  document.body.classList.toggle("ohne-nav", !navAktiv);
  nav.hidden = !navAktiv;
  nav.querySelectorAll("a").forEach((a) => {
    if (a.dataset.nav === navAktiv) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}
const $ = (sel, wurzel = main) => wurzel.querySelector(sel);
const $$ = (sel, wurzel = main) => [...wurzel.querySelectorAll(sel)];
const hin = (ziel) => { if (location.hash === ziel) route(); else location.hash = ziel; };
const leseQuery = (q) => Object.fromEntries(new URLSearchParams(q || ""));
const zurueck = (ziel, text) => h`<a class="zurueck" href="${ziel}">${ICON.zurueck} ${text}</a>`;

async function sicher(arbeit, erfolg) {
  try {
    const r = await arbeit();
    await S.speichern();
    if (erfolg) meldung(erfolg);
    return r ?? true;
  } catch (e) {
    meldung(e.message || "Das hat nicht geklappt. Bitte noch einmal versuchen.", "fehler");
    return false;
  }
}
const statusPille = (r) => (r.storniert ? h`<span class="pille storno">Storniert</span>`
  : r.bezahlt ? h`<span class="pille bezahlt">Bezahlt</span>`
    : r.faellig < heute() ? h`<span class="pille ueber">Überfällig</span>` : h`<span class="pille offen">Offen</span>`);
const name = (r) => `${r.nachname}, ${r.vorname}`;

// ---------- PDFs: einmal erzeugen, dann unveraendert aufbewahren ----------
async function rechnungsPdfHolen(id) {
  const r = L.rechnungLesen(db(), id);
  const vorhanden = await S.pdfLesen(r.rechnungsnr);
  if (vorhanden) return new Uint8Array(vorhanden);
  const neu = rechnungPdf(libs(), { firma: L.firmaLesen(db()), rechnung: r, positionen: L.positionenLesen(db(), id) });
  await S.pdfSchreiben(r.rechnungsnr, neu);
  return neu;
}

// ---------- Backup-Stand ----------
async function backupLage() {
  const zuletzt = await S.kvLesen("letztes_backup");
  const aenderungen = (await S.kvLesen("aenderungen")) || 0;
  const tage = zuletzt ? Math.floor((Date.now() - new Date(zuletzt)) / 86400000) : null;
  const faellig = aenderungen > 0 && (tage === null || tage >= BACKUP_TAGE);
  return { zuletzt, aenderungen, tage, faellig };
}
const backupText = ({ zuletzt, tage }) => (!zuletzt ? "Noch keine Sicherung vorhanden."
  : tage === 0 ? "Letzte Sicherung heute." : tage === 1 ? "Letzte Sicherung gestern." : `Letzte Sicherung vor ${tage} Tagen.`);

// ---------- Start ----------
async function start() {
  const d = L.startDaten(db(), heute());
  const b = await backupLage();
  const jetzt = new Date();
  const zeilen = (liste) => liste.slice(0, 5).map((r) => h`
    <li class="zeile">
      <a class="zeile-text" href="#/rechnung/${r.id}" style="color:inherit;text-decoration:none">
        <div class="zeile-titel">${name(r)}</div>
        <div class="zeile-zusatz">${euro(r.betrag)}, fällig ${datumDe(r.faellig)}</div>
      </a>
      <button class="knopf klein" data-bezahlt="${r.id}">Bezahlt</button>
    </li>`);
  const anz = d.ueberfaellig.length;
  const lage = anz ? h`<b>${anz === 1 ? "1 Rechnung ist" : `${anz} Rechnungen sind`} überfällig.</b> ${d.bald.length === 1 ? "1 weitere ist noch offen." : d.bald.length ? `${d.bald.length} weitere sind noch offen.` : ""}`
    : d.bald.length ? h`Nichts ist überfällig. ${d.bald.length === 1 ? "1 Rechnung ist" : `${d.bald.length} Rechnungen sind`} noch offen.`
      : h`Alle Rechnungen sind bezahlt.`;
  anzeigen(h`
    <h1 class="tag"><small>${TAGE[jetzt.getDay()]}</small>${jetzt.getDate()}. ${MONATE[jetzt.getMonth()]}</h1>
    <p class="lage">${lage}</p>
    ${b.faellig && h`<div class="alarm"><strong>Bitte Daten sichern.</strong> ${backupText(b)} Ohne Sicherung gehen die Rechnungen verloren, falls dem iPhone etwas passiert.
      <a class="knopf gefahr" href="#/backup">Jetzt sichern</a></div>`}
    <a class="gross-aktion" href="#/rechnung/neu">${ICON.plus} Neue Rechnung</a>
    <div class="zahlen">
      <div><b>${euro(d.stats.einnahmen)}</b>bezahlt in ${jetzt.getFullYear()}</div>
      <div><b>${euro(d.stats.offen)}</b>noch offen</div>
    </div>
    ${anz > 0 && h`<div class="abschnitt"><h2>Überfällig</h2>${anz > 5 && h`<a href="#/offen">Alle ${anz} ansehen</a>`}</div>
      <ul class="liste">${zeilen(d.ueberfaellig)}</ul>`}
    ${d.bald.length > 0 && h`<div class="abschnitt"><h2>Offen</h2>${d.bald.length > 5 && h`<a href="#/offen">Alle ${d.bald.length} ansehen</a>`}</div>
      <ul class="liste">${zeilen(d.bald)}</ul>`}
  `, { navAktiv: "start" });
  bezahltKnoepfe();
}
function bezahltKnoepfe(nachher = route) {
  $$("[data-bezahlt]").forEach((k) => k.addEventListener("click", async () => {
    if (await sicher(() => L.bezahltSetzen(db(), Number(k.dataset.bezahlt), true, heute()), "Als bezahlt eingetragen.")) nachher();
  }));
}
function offeneAlle() {
  const d = L.startDaten(db(), heute());
  const alle = [...d.ueberfaellig, ...d.bald];
  anzeigen(h`${zurueck("#/", "Start")}<h1>Offene Rechnungen</h1>
    <ul class="liste">${alle.map((r) => h`
      <li class="zeile"><a class="zeile-text" href="#/rechnung/${r.id}" style="color:inherit;text-decoration:none">
        <div class="zeile-titel">${name(r)}</div>
        <div class="zeile-zusatz">${euro(r.betrag)}, fällig ${datumDe(r.faellig)}</div></a>
        <button class="knopf klein" data-bezahlt="${r.id}">Bezahlt</button></li>`)}</ul>`, { navAktiv: "start" });
  bezahltKnoepfe();
}

// ---------- Rechnungen ----------
function rechnungen(q) {
  const jahre = L.rechnungsJahre(db());
  const jahr = q.jahr || heute().slice(0, 4);
  const suche = (q.q || "").trim();
  const liste = L.rechnungenListe(db(), { jahr, suche });
  const storno = L.stornoAnzahl(db());
  anzeigen(h`
    <h1>Rechnungen</h1>
    <a class="gross-aktion" href="#/rechnung/neu">${ICON.plus} Neue Rechnung</a>
    <form class="suche" id="suche-form">${ICON.suche}<input type="search" name="q" value="${suche}" placeholder="Name oder Rechnungsnummer" enterkeyhint="search" aria-label="Rechnungen suchen"></form>
    <div class="chips">
      ${!suche && (jahre.length ? jahre : [jahr]).map((j) => h`<a class="chip" aria-current="${j === jahr}" href="#/rechnungen?jahr=${j}">${j}</a>`)}
      ${suche && h`<a class="chip" href="#/rechnungen">Suche beenden</a>`}
      ${storno > 0 && h`<a class="chip" href="#/storniert">Storniert (${storno})</a>`}
    </div>
    <div class="abschnitt"><span class="leise">${liste.length} ${liste.length === 1 ? "Rechnung" : "Rechnungen"}</span>
      ${liste.length > 0 && h`<button class="knopf klein" id="waehlen">Mehrere auswählen</button>`}</div>
    ${liste.length ? h`<ul class="liste" id="liste">${liste.map((r) => h`
      <li><a class="zeile" href="#/rechnung/${r.id}" data-id="${r.id}">
        <input type="checkbox" hidden aria-label="${r.rechnungsnr} auswählen" tabindex="-1">
        <div class="zeile-text"><div class="zeile-titel">${name(r)}</div>
        <div class="zeile-zusatz">${r.rechnungsnr}, ${datumDe(r.datum)}</div></div>
        <div class="zeile-betrag">${euro(r.betrag)}<br>${statusPille(r)}</div></a></li>`)}</ul>`
      : h`<div class="karte leer">${suche ? `Keine Rechnung zu „${suche}“ gefunden.` : `In ${jahr} gibt es noch keine Rechnungen.`}</div>`}
    <div class="summe-leiste" id="auswahl" hidden><div><b id="auswahl-n">0</b>ausgewählt</div>
      <button class="knopf klein haupt" id="sammel-pdf">PDF erstellen</button>
      <button class="knopf klein gefahr" id="sammel-storno">Stornieren</button></div>
  `, { navAktiv: "rechnung", titel: "Rechnungen" });
  $("#suche-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = new FormData(e.target).get("q").trim();
    hin(t ? `#/rechnungen?q=${encodeURIComponent(t)}` : "#/rechnungen");
  });
  auswahlModus();
}
function auswahlModus() {
  const knopf = $("#waehlen");
  if (!knopf) return;
  let aktiv = false;
  const gewaehlt = () => $$("#liste input:checked").map((c) => Number(c.closest("a").dataset.id));
  const auffrischen = () => { $("#auswahl-n").textContent = gewaehlt().length; };
  knopf.addEventListener("click", () => {
    aktiv = !aktiv;
    knopf.textContent = aktiv ? "Fertig" : "Mehrere auswählen";
    $("#auswahl").hidden = !aktiv;
    $$("#liste input").forEach((c) => { c.hidden = !aktiv; c.checked = false; });
    auffrischen();
  });
  $("#liste").addEventListener("click", (e) => {
    if (!aktiv) return;
    e.preventDefault();
    const a = e.target.closest("a");
    if (!a) return;
    const c = a.querySelector("input");
    c.checked = !c.checked;
    auffrischen();
  });
  $("#sammel-pdf").addEventListener("click", async () => {
    const ids = gewaehlt();
    if (!ids.length) return meldung("Bitte zuerst Rechnungen antippen.", "fehler");
    const firma = L.firmaLesen(db());
    const pdf = sammelPdf(libs(), ids.map((id) => ({ firma, rechnung: L.rechnungLesen(db(), id), positionen: L.positionenLesen(db(), id) })));
    await dateiDialog(new File([pdf], `Rechnungen-${heute()}.pdf`, PDF_TYP), "PDF ist fertig", `${ids.length} Rechnungen in einer Datei.`);
  });
  $("#sammel-storno").addEventListener("click", async () => {
    const ids = gewaehlt();
    if (!ids.length) return meldung("Bitte zuerst Rechnungen antippen.", "fehler");
    if (await stornoDialog(ids)) route();
  });
}
async function stornoDialog(ids) {
  const { wert, daten } = await dialog(h`
    <h2>${ids.length === 1 ? "Rechnung stornieren" : `${ids.length} Rechnungen stornieren`}</h2>
    <p>Das lässt sich nicht rückgängig machen. Die Rechnung bleibt zur Nachvollziehbarkeit erhalten.</p>
    <label class="feld"><span>Grund</span><textarea name="grund" rows="3" placeholder="z. B. Doppelt ausgestellt"></textarea></label>
    <p class="dlg-fehler"></p>
    <div class="knopfreihe"><button class="knopf gefahr" value="ja">Stornieren</button><button class="knopf" value="abbrechen">Abbrechen</button></div>`.t,
  { pruefe: (f) => (String(f.get("grund")).trim() ? "" : "Bitte einen Grund angeben.") });
  if (wert !== "ja") return false;
  return sicher(() => L.stornieren(db(), ids, daten.get("grund"), heute()), "Storniert.");
}
function storniert() {
  const liste = L.rechnungenListe(db(), { storniert: true });
  anzeigen(h`${zurueck("#/rechnungen", "Rechnungen")}<h1>Stornierte Rechnungen</h1>
    <p class="leise" style="margin-bottom:1rem">Zählen nicht als Umsatz.</p>
    ${liste.length ? h`<ul class="liste">${liste.map((r) => h`<li><a class="zeile" href="#/rechnung/${r.id}">
      <div class="zeile-text"><div class="zeile-titel">${name(r)}</div>
      <div class="zeile-zusatz">${r.rechnungsnr}, storniert am ${datumDe(r.storno_datum)}<br>${r.storno_grund}</div></div>
      <div class="zeile-betrag"><s>${euro(r.betrag)}</s></div></a></li>`)}</ul>`
      : h`<div class="karte leer">Keine stornierten Rechnungen.</div>`}`, { navAktiv: "rechnung", titel: "Storniert" });
}

async function rechnungAnsicht(id) {
  const r = L.rechnungLesen(db(), id);
  if (!r) return hin("#/rechnungen");
  const pos = L.positionenLesen(db(), id);
  const firma = L.firmaLesen(db());
  anzeigen(h`
    ${zurueck("#/rechnungen", "Rechnungen")}
    <div class="abschnitt"><h1 style="margin:0">${r.rechnungsnr}</h1>${statusPille(r)}</div>
    ${r.storniert ? h`<div class="alarm"><strong>Storniert am ${datumDe(r.storno_datum)}.</strong><br>Grund: ${r.storno_grund}</div>` : ""}
    ${r.bezahlt && !r.storniert ? h`<p class="leise" style="margin-bottom:1rem">Bezahlt am ${datumDe(r.bezahlt_am)}</p>` : ""}
    <div class="blatt ${r.storniert ? "storniert" : ""}">
      <h2>${r.vorname} ${r.nachname}</h2>
      <p style="margin-bottom:.75rem;color:#555">${[r.strasse, [r.plz, r.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}<br>
        Kundennummer ${r.kundennr}<br>Datum ${datumDe(r.datum)}<br>Fällig ${datumDe(r.faellig)}</p>
      ${pos.map((p) => h`<div class="blatt-pos"><div>${p.beschreibung}<small>${[datumDe(p.datum), p.menge !== 1 ? `${zahlText(p.menge)} × ${euro(p.einzelpreis)}` : ""].filter(Boolean).join(", ")}</small></div>
        <div style="white-space:nowrap">${euro(p.menge * p.einzelpreis)}</div></div>`)}
      <div class="blatt-summe"><span>Gesamt</span><span>${euro(r.betrag)}</span></div>
      ${r.notiz ? h`<p style="margin-top:.75rem;color:#555">Notiz (steht nicht auf der Rechnung): ${r.notiz}</p>` : ""}
    </div>
    <div class="knopfreihe">
      <button class="knopf haupt" id="teilen" disabled>${ICON.mail} Per E-Mail senden</button>
      <button class="knopf haupt" id="drucken" disabled>${ICON.drucker} Drucken</button>
    </div>
    <p class="leise klein" style="margin-top:.5rem">Im nächsten Fenster „Mail“ oder „Drucken“ antippen. Fehlt „Drucken“, im Fenster nach unten wischen. Der Drucker muss im selben WLAN sein.</p>
    <div class="knopfreihe">
      ${!r.storniert && !r.bezahlt ? h`<button class="knopf gut" id="bezahlt">${ICON.haken} Als bezahlt eintragen</button>` : ""}
      ${!r.storniert && r.bezahlt ? h`<button class="knopf" id="unbezahlt">Zurück auf offen setzen</button>` : ""}
    </div>
    ${r.storniert ? h`<div class="knopfreihe"><button class="knopf" id="original" disabled>Ursprüngliche Rechnung ansehen</button></div>` : ""}
    ${!r.storniert ? h`<div class="knopfreihe"><button class="knopf gefahr" id="storno">Rechnung stornieren</button></div>` : ""}
  `, { navAktiv: "rechnung", titel: r.rechnungsnr });

  const teilen = $("#teilen");
  // Dateien jetzt vorbereiten: Das Teilen muss direkt aus dem Fingertipp kommen.
  const original = new File([await rechnungsPdfHolen(id)], `${r.rechnungsnr}.pdf`, PDF_TYP);
  const datei = r.storniert
    ? new File([stornoPdf(libs(), { firma, rechnung: r, positionen: pos })], `Storno-${r.rechnungsnr}.pdf`, PDF_TYP)
    : original;
  if (!teilen.isConnected) return;
  const drucken = $("#drucken");
  teilen.disabled = false;
  drucken.disabled = false;
  const art = r.storniert ? "Stornorechnung" : "Rechnung";
  teilen.addEventListener("click", () => dateiAusgeben(datei, {
    title: `${art} ${r.rechnungsnr}`,
    text: `Guten Tag,\n\nanbei erhalten Sie Ihre ${art} ${r.rechnungsnr}.\n\nMit freundlichen Grüßen\n${firma.inhaber}`,
  }));
  // Nur die Datei: Zusaetzlicher Text wuerde beim Drucken mit ausgegeben.
  drucken.addEventListener("click", () => dateiAusgeben(datei));
  $("#original")?.removeAttribute("disabled");
  $("#original")?.addEventListener("click", () => dateiAusgeben(original));
  $("#bezahlt")?.addEventListener("click", async () => { if (await sicher(() => L.bezahltSetzen(db(), id, true, heute()), "Als bezahlt eingetragen.")) route(); });
  $("#unbezahlt")?.addEventListener("click", async () => { if (await sicher(() => L.bezahltSetzen(db(), id, false), "Wieder offen.")) route(); });
  $("#storno")?.addEventListener("click", async () => { if (await stornoDialog([id])) route(); });
}

function rechnungNeu(q) {
  const kunden = L.kundenListe(db());
  const leistungen = L.leistungenListe(db());
  const zustand = { kunde: q.kunde ? kunden.find((k) => k.id === Number(q.kunde)) || null : null, positionen: [] };
  const preisFuer = (preis) => (zustand.kunde?.standardpreis != null ? zustand.kunde.standardpreis : preis);

  anzeigen(h`
    ${zurueck("#/rechnungen", "Abbrechen")}
    <h1>Neue Rechnung</h1>
    <div id="fehler"></div>
    <section class="karte"><h2>Für wen?</h2><div id="kunde-wahl"></div></section>
    <section class="karte"><h2>Was wurde gemacht?</h2>
      <div class="chips">${leistungen.map((l) => h`<button type="button" class="chip" data-name="${l.name}" data-preis="${l.preis}">${l.name}, ${euro(l.preis)}</button>`)}</div>
      <div id="positionen"></div>
      <div class="knopfreihe" style="margin-top:.5rem">
        <button type="button" class="knopf" id="kal">${ICON.kalender} Mehrere Tage</button>
        <button type="button" class="knopf" id="eigene">${ICON.plus} Eigene Leistung</button>
      </div>
    </section>
    <section class="karte"><h2>Daten</h2>
      <div class="reihe">
        <label class="feld"><span>Rechnungsdatum</span><input type="date" id="datum" value="${heute()}"></label>
        <label class="feld"><span>Fällig am</span><input type="date" id="faellig" aria-describedby="f-h"></label>
      </div>
      <p class="leise klein" id="f-h" style="margin:-.5rem 0 1rem">Leer lassen für das übliche Zahlungsziel.</p>
      <label class="feld" style="margin:0"><span>Notiz <small>(steht nicht auf der Rechnung)</small></span><input type="text" id="notiz" placeholder="z. B. Bar bezahlt"></label>
    </section>
    <div class="summe-leiste"><div><b id="gesamt">0,00 €</b>Gesamt</div><button class="knopf haupt" id="erstellen">Rechnung erstellen</button></div>
  `, { navAktiv: "rechnung", titel: "Neue Rechnung" });

  function kundeZeichnen() {
    const w = $("#kunde-wahl");
    if (zustand.kunde) {
      const k = zustand.kunde;
      w.innerHTML = h`<div class="gewaehlt"><div><div class="zeile-titel">${k.nachname}, ${k.vorname}</div>
        <div class="zeile-zusatz">Nr. ${k.kundennr}${k.ort ? `, ${k.ort}` : ""}${k.standardpreis != null ? `, Preis ${euro(k.standardpreis)}` : ""}</div></div>
        <button type="button" class="knopf klein" id="kunde-aendern">Ändern</button></div>`.t;
      $("#kunde-aendern").addEventListener("click", () => { zustand.kunde = null; kundeZeichnen(); $("#kunde-suche").focus(); });
      return;
    }
    if (!kunden.length) { w.innerHTML = h`<p>Noch keine Kunden vorhanden. <a href="#/kunde/neu">Ersten Kunden anlegen</a></p>`.t; return; }
    w.innerHTML = h`<div class="suche" style="margin:0">${ICON.suche}<input type="search" id="kunde-suche" placeholder="Name oder Kundennummer" autocomplete="off" aria-label="Kunde suchen"></div><ul class="treffer" id="treffer" hidden></ul>`.t;
    const feld = $("#kunde-suche");
    const treffer = $("#treffer");
    feld.addEventListener("input", () => {
      const t = feld.value.trim().toLowerCase();
      const liste = t ? kunden.filter((k) => `${k.nachname}, ${k.vorname} ${k.vorname} ${k.nachname} ${k.ort}`.toLowerCase().includes(t) || k.kundennr.includes(t)).slice(0, 30) : [];
      treffer.hidden = !liste.length;
      treffer.innerHTML = liste.map((k) => h`<li><button type="button" class="zeile" data-k="${k.id}"><div class="zeile-text"><div class="zeile-titel">${k.nachname}, ${k.vorname}</div><div class="zeile-zusatz">Nr. ${k.kundennr}${k.ort ? `, ${k.ort}` : ""}</div></div></button></li>`.t).join("");
    });
    treffer.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (!b) return;
      zustand.kunde = kunden.find((k) => k.id === Number(b.dataset.k));
      kundeZeichnen();
    });
  }

  function positionenZeichnen() {
    $("#positionen").innerHTML = zustand.positionen.map((p, i) => h`
      <div class="position" data-i="${i}">
        <div class="position-kopf"><label class="feld"><span>Leistung</span><input data-f="beschreibung" value="${p.beschreibung}"></label>
          <button type="button" class="knopf rund" data-weg aria-label="Position entfernen">${ICON.kreuz}</button></div>
        <div class="reihe">
          <label class="feld" style="flex:1.7"><span>Datum</span><input type="date" data-f="datum" value="${p.datum}"></label>
          <label class="feld" style="flex:.8"><span>Menge</span><input inputmode="decimal" data-f="menge" value="${zahlText(p.menge)}"></label>
          <label class="feld"><span>Preis €</span><input inputmode="decimal" data-f="einzelpreis" value="${zahlText(p.einzelpreis)}"></label>
        </div></div>`.t).join("");
    summe();
  }
  const summe = () => {
    $("#gesamt").textContent = euro(L.rund2(zustand.positionen.reduce((s, p) => s + zahl(p.menge) * zahl(p.einzelpreis), 0)));
  };
  const dazu = (beschreibung, preis, datum = heute()) => {
    zustand.positionen.push({ beschreibung, menge: 1, einzelpreis: preis, datum });
    positionenZeichnen();
  };

  $("#positionen").addEventListener("input", (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    zustand.positionen[Number(e.target.closest(".position").dataset.i)][f] = e.target.value;
    summe();
  });
  $("#positionen").addEventListener("click", (e) => {
    const b = e.target.closest("[data-weg]");
    if (!b) return;
    zustand.positionen.splice(Number(b.closest(".position").dataset.i), 1);
    positionenZeichnen();
  });
  $$(".chip[data-name]").forEach((c) => c.addEventListener("click", () => dazu(c.dataset.name, preisFuer(Number(c.dataset.preis)))));
  $("#eigene").addEventListener("click", () => {
    dazu("", "");
    $$("#positionen [data-f=beschreibung]").at(-1).focus();
  });
  $("#kal").addEventListener("click", async () => {
    const tage = await kalenderDialog(leistungen);
    if (!tage) return;
    tage.daten.forEach((d) => zustand.positionen.push({ beschreibung: tage.name, menge: 1, einzelpreis: tage.preis === "" ? "" : preisFuer(tage.preis), datum: d }));
    positionenZeichnen();
  });

  const fehlerZeigen = (t) => {
    $("#fehler").innerHTML = t ? h`<div class="warnung">${t}</div>`.t : "";
    if (t) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  async function erstellen(duplikatOk = false) {
    if (!zustand.kunde) return fehlerZeigen("Bitte zuerst den Kunden auswählen.");
    const ohnePreis = zustand.positionen.find((p) => String(p.beschreibung).trim() && zahl(p.einzelpreis) <= 0);
    if (ohnePreis) return fehlerZeigen(`Bei „${ohnePreis.beschreibung}“ fehlt der Preis.`);
    if (zustand.positionen.some((p) => !String(p.beschreibung).trim())) return fehlerZeigen("Bitte jede Leistung benennen oder die leere Zeile entfernen.");
    let ergebnis;
    try {
      ergebnis = L.rechnungAnlegen(db(), {
        kundeId: zustand.kunde.id, datum: $("#datum").value, faellig: $("#faellig").value, notiz: $("#notiz").value, duplikatOk,
        positionen: zustand.positionen.map((p) => ({ ...p, menge: zahl(p.menge), einzelpreis: zahl(p.einzelpreis) })),
      }, heute());
    } catch (e) { return fehlerZeigen(e.message); }
    if (ergebnis.duplikat) {
      const ok = await bestaetigen("Rechnung schon vorhanden?", `Für diesen Kunden gibt es in diesem Monat schon die unbezahlte Rechnung ${ergebnis.duplikat}.`, { ja: "Trotzdem erstellen" });
      return ok ? erstellen(true) : undefined;
    }
    try {
      await S.speichern();
      await rechnungsPdfHolen(ergebnis.id);
    } catch (e) {
      return fehlerZeigen(`Die Rechnung konnte nicht gespeichert werden: ${e.message}`);
    }
    meldung(`Rechnung ${ergebnis.rechnungsnr} erstellt.`);
    hin(`#/rechnung/${ergebnis.id}`);
  }
  $("#erstellen").addEventListener("click", () => erstellen());
  kundeZeichnen();
  positionenZeichnen();
}

async function kalenderDialog(leistungen) {
  const auswahl = new Set();
  const d0 = new Date();
  let j = d0.getFullYear(), m = d0.getMonth();
  const { wert, daten } = await dialog(h`
    <h2>Mehrere Tage</h2>
    <label class="feld"><span>Leistung</span><select name="leistung">
      ${leistungen.map((l, i) => h`<option value="${i}">${l.name}, ${euro(l.preis)}</option>`)}
      <option value="eigene">Eigene Beschreibung</option></select></label>
    <label class="feld" data-eigene hidden><span>Beschreibung</span><input name="eigene"></label>
    <div class="kal-kopf"><button type="button" class="knopf rund" data-m="-1" aria-label="Voriger Monat">${ICON.zurueck}</button><strong data-titel></strong><button type="button" class="knopf rund" data-m="1" aria-label="Nächster Monat">${ICON.weiter}</button></div>
    <div class="kal">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => h`<span>${t}</span>`)}</div>
    <div class="kal" data-tage></div>
    <p class="dlg-fehler"></p>
    <div class="knopfreihe"><button class="knopf haupt" value="ja" data-los>Tage einfügen</button><button class="knopf" value="abbrechen">Abbrechen</button></div>`.t, {
    baue(d) {
      const zeichne = () => {
        d.querySelector("[data-titel]").textContent = `${MONATE[m]} ${j}`;
        const start = (new Date(j, m, 1).getDay() + 6) % 7;
        const anzahl = new Date(j, m + 1, 0).getDate();
        d.querySelector("[data-tage]").innerHTML = "<i></i>".repeat(start) + Array.from({ length: anzahl }, (_, i) => {
          const iso = L.isoDatum(new Date(j, m, i + 1));
          return `<button type="button" data-tag="${iso}" aria-pressed="${auswahl.has(iso)}">${i + 1}</button>`;
        }).join("");
        d.querySelector("[data-los]").textContent = auswahl.size === 1 ? "1 Tag einfügen" : `${auswahl.size} Tage einfügen`;
      };
      d.addEventListener("click", (e) => {
        const t = e.target.closest("[data-tag]");
        const w = e.target.closest("[data-m]");
        if (t) {
          if (auswahl.has(t.dataset.tag)) auswahl.delete(t.dataset.tag); else auswahl.add(t.dataset.tag);
          zeichne();
        }
        if (w) {
          m += Number(w.dataset.m);
          if (m > 11) { m = 0; j++; }
          if (m < 0) { m = 11; j--; }
          zeichne();
        }
      });
      d.querySelector("select").addEventListener("change", (e) => { d.querySelector("[data-eigene]").hidden = e.target.value !== "eigene"; });
      if (!leistungen.length) d.querySelector("[data-eigene]").hidden = false;
      zeichne();
    },
    pruefe(f) {
      if (!auswahl.size) return "Bitte mindestens einen Tag antippen.";
      if (f.get("leistung") === "eigene" && !String(f.get("eigene")).trim()) return "Bitte die Leistung beschreiben.";
      return "";
    },
  });
  if (wert !== "ja") return null;
  const eigen = daten.get("leistung") === "eigene";
  const l = leistungen[Number(daten.get("leistung"))];
  return { daten: [...auswahl].sort(), name: eigen ? daten.get("eigene").trim() : l.name, preis: eigen ? "" : l.preis };
}

// ---------- Kunden ----------
function kunden() {
  const liste = L.kundenListe(db());
  anzeigen(h`
    <h1>Kunden</h1>
    <a class="gross-aktion" href="#/kunde/neu">${ICON.plus} Neuer Kunde</a>
    <div class="suche">${ICON.suche}<input type="search" id="suche" placeholder="Name, Ort oder Nummer" aria-label="Kunden suchen" autocomplete="off"></div>
    ${liste.length ? h`<ul class="liste" id="liste">${liste.map((k) => h`
      <li data-such="${`${k.nachname} ${k.vorname} ${k.vorname} ${k.nachname} ${k.ort} ${k.kundennr}`.toLowerCase()}"><a class="zeile" href="#/kunde/${k.id}">
        <div class="zeile-text"><div class="zeile-titel">${k.nachname}, ${k.vorname}</div>
        <div class="zeile-zusatz">Nr. ${k.kundennr}${k.ort ? `, ${k.ort}` : ""}, ${k.rechnungen_count} ${k.rechnungen_count === 1 ? "Rechnung" : "Rechnungen"}</div></div>
        ${ICON.weiter}</a></li>`)}</ul><div class="karte leer" id="nichts" hidden>Niemand gefunden.</div>`
      : h`<div class="karte leer">Noch keine Kunden. Lege oben den ersten an.</div>`}
  `, { navAktiv: "kunde", titel: "Kunden" });
  $("#suche").addEventListener("input", (e) => {
    const t = e.target.value.trim().toLowerCase();
    let n = 0;
    $$("#liste > li").forEach((li) => { const s = li.dataset.such.includes(t); li.hidden = !s; if (s) n++; });
    if ($("#nichts")) { $("#nichts").hidden = n > 0; $("#liste").hidden = n === 0; }
  });
}
function kundeForm(id) {
  const k = id ? L.kundeLesen(db(), id) : null;
  if (id && !k) return hin("#/kunden");
  anzeigen(h`
    ${zurueck("#/kunden", "Kunden")}
    <h1>${k ? `${k.vorname} ${k.nachname}` : "Neuer Kunde"}</h1>
    <form id="form">
      <div class="karte">
        ${k ? h`<p class="leise" style="margin-bottom:1rem">Kundennummer ${k.kundennr}</p>`
          : h`<label class="feld"><span>Kundennummer</span><input name="kundennr" required value="${L.naechsteKundennr(db())}" inputmode="numeric"></label>`}
        <div class="reihe"><label class="feld"><span>Vorname</span><input name="vorname" required value="${k?.vorname}"></label>
        <label class="feld"><span>Nachname</span><input name="nachname" required value="${k?.nachname}"></label></div>
        <label class="feld"><span>Straße und Hausnummer</span><input name="strasse" value="${k?.strasse}" autocomplete="off"></label>
        <div class="reihe"><label class="feld" style="flex:.6"><span>PLZ</span><input name="plz" inputmode="numeric" maxlength="5" value="${k?.plz}"></label>
        <label class="feld"><span>Ort</span><input name="ort" value="${k?.ort}"></label></div>
        <label class="feld"><span>Telefon</span><input name="telefon" type="tel" value="${k?.telefon}"></label>
        <label class="feld"><span>Eigener Preis <small>(wird bei Rechnungen vorausgefüllt)</small></span><input name="standardpreis" inputmode="decimal" placeholder="z. B. 25,00" value="${zahlText(k?.standardpreis)}"></label>
        <label class="feld"><span>Notiz</span><textarea name="notiz" rows="2">${k?.notiz}</textarea></label>
        <label class="haken-feld"><input type="checkbox" name="blut" ${k?.["blutverdünner"] ? "checked" : ""}> Nimmt Blutverdünner</label>
        <label class="haken-feld"><input type="checkbox" name="diab" ${k?.diabetiker ? "checked" : ""}> Diabetiker</label>
      </div>
      <div class="knopfreihe"><button class="knopf haupt">Speichern</button>
      ${k ? h`<a class="knopf" href="#/rechnung/neu?kunde=${k.id}">Rechnung schreiben</a>` : ""}</div>
    </form>`, { navAktiv: "kunde", titel: k ? `${k.nachname}, ${k.vorname}` : "Neuer Kunde" });
  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const sp = String(f.get("standardpreis")).trim();
    const ok = await sicher(() => L.kundeSpeichern(db(), {
      id: k?.id, kundennr: f.get("kundennr"), vorname: f.get("vorname").trim(), nachname: f.get("nachname").trim(),
      strasse: f.get("strasse").trim(), plz: f.get("plz").trim(), ort: f.get("ort").trim(), telefon: f.get("telefon").trim(),
      notiz: f.get("notiz"), standardpreis: sp ? zahl(sp) : null, blutverduenner: f.get("blut"), diabetiker: f.get("diab"),
    }), "Kunde gespeichert.");
    if (ok) hin("#/kunden");
  });
}

// ---------- Heime ----------
function heime() {
  const liste = L.heimeListe(db());
  anzeigen(h`<h1>Heime</h1>
    ${liste.length ? h`<ul class="liste">${liste.map((x) => h`<li><a class="zeile" href="#/heim/${x.id}">
      <div class="zeile-text"><div class="zeile-titel">${x.name}</div><div class="zeile-zusatz">${x.strasse}${x.ort ? `, ${x.plz} ${x.ort}` : ""}</div></div>${ICON.weiter}</a></li>`)}</ul>`
      : h`<div class="karte leer">Noch keine Heime angelegt.</div>`}
    <button class="knopf" id="neu" style="width:100%">${ICON.plus} Neues Heim anlegen</button>`, { navAktiv: "heim", titel: "Heime" });
  $("#neu").addEventListener("click", async () => {
    const { wert, daten } = await dialog(h`<h2>Neues Heim</h2>
      <label class="feld"><span>Name</span><input name="name" required></label>
      <label class="feld"><span>Straße und Hausnummer</span><input name="strasse" required></label>
      <div class="reihe"><label class="feld" style="flex:.6"><span>PLZ</span><input name="plz" inputmode="numeric"></label><label class="feld"><span>Ort</span><input name="ort"></label></div>
      <p class="leise klein">Kunden mit genau dieser Straße erscheinen automatisch im Heim.</p>
      <div class="knopfreihe"><button class="knopf haupt" value="ja">Anlegen</button><button class="knopf" value="abbrechen" formnovalidate>Abbrechen</button></div>`.t);
    if (wert === "ja" && await sicher(() => L.heimNeu(db(), Object.fromEntries(daten)), "Heim angelegt.")) route();
  });
}
function heimAnsicht(id) {
  const heim = L.heimLesen(db(), id);
  if (!heim) return hin("#/heime");
  const liste = L.heimBewohner(db(), heim.strasse);
  const t = heute();
  const erledigt = liste.filter((b) => b.letzte_pflege === t).length;
  const merk = new Map(liste.map((b) => [b.id, b]));
  anzeigen(h`${zurueck("#/heime", "Heime")}
    <h1>${heim.name}</h1>
    <p class="lage">${liste.length ? `Heute ${erledigt} von ${liste.length} erledigt.` : "Noch keine Bewohner eingetragen."}</p>
    <div class="suche">${ICON.suche}<input type="search" id="suche" placeholder="Name suchen" aria-label="Bewohner suchen" autocomplete="off"></div>
    <ul class="liste" id="liste">${liste.map((b) => {
    const fertig = b.letzte_pflege === t;
    return h`<li data-such="${`${b.nachname} ${b.vorname}`.toLowerCase()}"><div class="zeile">
      <button class="zeile-text" data-bearbeiten="${b.id}" style="background:none;border:0;padding:0;text-align:left">
        <div class="zeile-titel">${b.nachname}, ${b.vorname}</div>
        <div class="zeile-zusatz">${b["blutverdünner"] ? h`<span class="pille blut">Blutverdünner</span> ` : ""}${b.diabetiker ? h`<span class="pille diab">Diabetiker</span> ` : ""}
          ${b.letzte_pflege ? `Zuletzt ${datumDe(b.letzte_pflege)}` : "Noch keine Pflege"}${b.naechster_termin ? `, nächster Termin ${datumDe(b.naechster_termin)}` : ""}${b.naechster_termin && b.naechster_termin < t ? " (überfällig)" : ""}</div>
      </button>
      ${fertig ? h`<span class="knopf rund gut" role="img" aria-label="Heute erledigt">${ICON.haken}</span>`
        : h`<button class="knopf rund" data-pflege="${b.id}" aria-label="Fußpflege bei ${b.vorname} ${b.nachname} eintragen">${ICON.haken}</button>`}
    </div></li>`;
  })}</ul>
    <button class="knopf" id="neu" style="width:100%">${ICON.plus} Bewohner anlegen</button>`, { navAktiv: "heim", titel: heim.name });

  $("#suche").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$("#liste > li").forEach((li) => { li.hidden = !li.dataset.such.includes(q); });
  });
  $$("[data-pflege]").forEach((k) => k.addEventListener("click", async () => {
    const b = merk.get(Number(k.dataset.pflege));
    const { wert, daten } = await dialog(h`<h2>${b.vorname} ${b.nachname}</h2>
      <label class="feld"><span>Datum der Fußpflege</span><input type="date" name="datum" value="${t}" required></label>
      <label class="feld"><span>Nächster Termin <small>(freiwillig)</small></span><input type="date" name="naechster"></label>
      <label class="feld"><span>Notiz <small>(freiwillig)</small></span><input name="notiz"></label>
      <div class="knopfreihe"><button class="knopf haupt" value="ja">Eintragen</button><button class="knopf" value="abbrechen" formnovalidate>Abbrechen</button></div>`.t);
    if (wert === "ja" && await sicher(() => L.fusspflegeEintragen(db(), { bewohnerId: b.id, datum: daten.get("datum"), naechster: daten.get("naechster"), notiz: daten.get("notiz") }), "Eingetragen.")) route();
  }));
  $$("[data-bearbeiten]").forEach((k) => k.addEventListener("click", async () => {
    const b = merk.get(Number(k.dataset.bearbeiten));
    const { wert, daten } = await dialog(h`<h2>${b.vorname} ${b.nachname}</h2>
      <label class="haken-feld"><input type="checkbox" name="blut" ${b["blutverdünner"] ? "checked" : ""}> Nimmt Blutverdünner</label>
      <label class="haken-feld"><input type="checkbox" name="diab" ${b.diabetiker ? "checked" : ""}> Diabetiker</label>
      <div class="knopfreihe"><button class="knopf haupt" value="ja">Speichern</button><button class="knopf" value="abbrechen">Abbrechen</button></div>
      <div class="knopfreihe"><button class="knopf gefahr" value="entfernen">Aus diesem Heim entfernen</button></div>`.t);
    if (wert === "ja" && await sicher(() => L.bewohnerHinweise(db(), b.id, daten.get("blut"), daten.get("diab")), "Gespeichert.")) route();
    if (wert === "entfernen" && await bestaetigen("Aus dem Heim entfernen?", "Die Person bleibt in der Kundenliste, nur die Adresse wird gelöscht.", { ja: "Entfernen", gefahr: true })
      && await sicher(() => L.bewohnerAusHeim(db(), b.id), "Aus dem Heim entfernt.")) route();
  }));
  $("#neu").addEventListener("click", async () => {
    const { wert, daten } = await dialog(h`<h2>Neuer Bewohner</h2>
      <div class="reihe"><label class="feld"><span>Vorname</span><input name="vorname" required></label><label class="feld"><span>Nachname</span><input name="nachname" required></label></div>
      <label class="feld"><span>Telefon <small>(freiwillig)</small></span><input name="telefon" type="tel"></label>
      <label class="haken-feld"><input type="checkbox" name="blut"> Nimmt Blutverdünner</label>
      <label class="haken-feld"><input type="checkbox" name="diab"> Diabetiker</label>
      <div class="knopfreihe"><button class="knopf haupt" value="ja">Anlegen</button><button class="knopf" value="abbrechen" formnovalidate>Abbrechen</button></div>`.t);
    if (wert === "ja" && await sicher(() => L.bewohnerNeu(db(), heim, { vorname: daten.get("vorname").trim(), nachname: daten.get("nachname").trim(), telefon: daten.get("telefon"), blutverduenner: daten.get("blut"), diabetiker: daten.get("diab") }), "Bewohner angelegt.")) route();
  });
}

// ---------- Mehr ----------
async function mehr() {
  const b = await backupLage();
  const e = (ziel, titel, zusatz) => h`<li><a class="zeile" href="${ziel}"><div class="zeile-text"><div class="zeile-titel">${titel}</div><div class="zeile-zusatz">${zusatz}</div></div>${ICON.weiter}</a></li>`;
  anzeigen(h`<h1>Mehr</h1><ul class="liste">
    ${e("#/backup", "Daten sichern", backupText(b))}
    ${e("#/design", "Aussehen", "Farben und Textgröße")}
    ${e("#/jahr", "Jahresübersicht", "Umsatz nach Monaten")}
    ${e("#/leistungen", "Leistungen und Preise", "Vorlagen für Rechnungen")}
    ${e("#/firma", "Meine Daten", "Adresse, Bank, Zahlungsziel")}
    <li><button class="zeile" id="vorlage"><div class="zeile-text"><div class="zeile-titel">Leistungsnachweis</div><div class="zeile-zusatz">Leeres Blatt zum Ausdrucken</div></div>${ICON.teilen}</button></li>
  </ul>`, { navAktiv: "mehr", titel: "Mehr" });
  const datei = new File([leistungsnachweisPdf(libs(), L.firmaLesen(db()))], "Leistungsnachweis.pdf", PDF_TYP);
  $("#vorlage").addEventListener("click", () => dateiAusgeben(datei));
}
async function jahrAnsicht(q) {
  const jahre = L.rechnungsJahre(db());
  const jahr = q.jahr || heute().slice(0, 4);
  const d = L.jahresDaten(db(), jahr);
  anzeigen(h`${zurueck("#/mehr", "Mehr")}<h1>Jahresübersicht</h1>
    <div class="chips">${(jahre.length ? jahre : [jahr]).map((j) => h`<a class="chip" aria-current="${j === jahr}" href="#/jahr?jahr=${j}">${j}</a>`)}</div>
    <div class="zahlen"><div><b>${euro(d.gesamt.summe)}</b>Umsatz aus ${d.gesamt.anzahl} Rechnungen</div>
      <div><b>${euro(d.gesamt.bezahlt)}</b>bezahlt</div><div><b>${euro(d.gesamt.offen)}</b>noch offen</div></div>
    ${d.storniert.anzahl > 0 ? h`<p class="leise" style="margin-bottom:1rem">Nicht enthalten: ${d.storniert.anzahl} stornierte Rechnungen über ${euro(d.storniert.summe)}.</p>` : ""}
    ${d.monate.length ? h`<ul class="liste">${d.monate.map((m) => h`<li class="zeile"><div class="zeile-text"><div class="zeile-titel">${MONATE[Number(m.monat) - 1]}</div>
      <div class="zeile-zusatz">${m.anzahl} Rechnungen, ${euro(m.bezahlt)} bezahlt, ${euro(m.offen)} offen</div></div><div class="zeile-betrag">${euro(m.summe)}</div></li>`)}</ul>
      <button class="knopf" id="pdf" style="width:100%">${ICON.teilen} Als PDF senden oder drucken</button>`
      : h`<div class="karte leer">In ${jahr} gibt es keine Rechnungen.</div>`}`, { navAktiv: "mehr", titel: `Jahr ${jahr}` });
  if ($("#pdf")) {
    const datei = new File([jahresPdf(libs(), { jahr, firma: L.firmaLesen(db()), ...d })], `Jahresuebersicht-${jahr}.pdf`, PDF_TYP);
    $("#pdf").addEventListener("click", () => dateiAusgeben(datei));
  }
}
function leistungen() {
  const liste = L.leistungenListe(db());
  anzeigen(h`${zurueck("#/mehr", "Mehr")}<h1>Leistungen und Preise</h1>
    ${liste.map((l) => h`<form class="karte" data-id="${l.id}">
      <label class="feld"><span>Bezeichnung</span><input name="name" value="${l.name}" required></label>
      <label class="feld"><span>Preis in €</span><input name="preis" inputmode="decimal" value="${zahlText(l.preis)}" required></label>
      <div class="knopfreihe" style="margin:0"><button class="knopf haupt" value="sichern">Speichern</button><button class="knopf gefahr" value="weg">Löschen</button></div></form>`)}
    <form class="karte" id="neu"><h2>Neue Leistung</h2>
      <label class="feld"><span>Bezeichnung</span><input name="name" required></label>
      <label class="feld"><span>Preis in €</span><input name="preis" inputmode="decimal" required></label>
      <button class="knopf haupt" style="width:100%">Leistung anlegen</button></form>`, { navAktiv: "mehr", titel: "Leistungen" });
  $$("form[data-id]").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(f.dataset.id);
    const d = new FormData(f);
    if (e.submitter?.value === "weg") {
      if (await bestaetigen(`„${d.get("name")}“ löschen?`, "Bestehende Rechnungen bleiben unverändert.", { ja: "Löschen", gefahr: true })
        && await sicher(() => L.leistungLoeschen(db(), id), "Leistung gelöscht.")) route();
    } else if (await sicher(() => L.leistungAendern(db(), id, d.get("name").trim(), zahl(d.get("preis"))), "Leistung gespeichert.")) route();
  }));
  $("#neu").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    if (await sicher(() => L.leistungNeu(db(), d.get("name").trim(), zahl(d.get("preis"))), "Leistung angelegt.")) route();
  });
}
function firma() {
  const f = L.firmaLesen(db());
  const feld = (n, t, typ = "text") => h`<label class="feld"><span>${t}</span><input name="${n}" type="${typ}" value="${f[n]}"></label>`;
  anzeigen(h`${zurueck("#/mehr", "Mehr")}<h1>Meine Daten</h1>
    <p class="leise" style="margin-bottom:1rem">Diese Angaben stehen auf neuen Rechnungen. Fertige Rechnungen ändern sich nicht.</p>
    <form id="form"><div class="karte">${feld("name", "Name des Betriebs")}${feld("inhaber", "Vor- und Nachname")}${feld("strasse", "Straße")}${feld("plz_ort", "PLZ und Ort")}${feld("telefon", "Telefon", "tel")}${feld("mobil", "Mobil", "tel")}</div>
    <div class="karte">${feld("steuernr", "Steuernummer")}${feld("bank", "Bank")}${feld("iban", "IBAN")}${feld("bic", "BIC")}${feld("zahlungsziel_tage", "Zahlungsziel in Tagen", "number")}</div>
    <button class="knopf haupt" style="width:100%">Speichern</button></form>`, { navAktiv: "mehr", titel: "Meine Daten" });
  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.zahlungsziel_tage = Number(d.zahlungsziel_tage) || 14;
    if (await sicher(() => L.firmaSpeichern(db(), d), "Gespeichert.")) hin("#/mehr");
  });
}

// ---------- Aussehen ----------
const THEMES = [
  ["heide", "Heide", "Erika-Violett, ruhig und warm"],
  ["kamille", "Kamille", "Hell, gelb und freundlich"],
  ["abend", "Abend", "Dunkel, schont abends die Augen"],
  ["klar", "Klar", "Schwarz auf Weiß, gut bei Sonne"],
];
export function designAnwenden({ theme, text }) {
  const w = document.documentElement;
  if (theme) w.dataset.theme = theme;
  if (text) w.dataset.text = text;
  const farbe = getComputedStyle(w).getPropertyValue("--grund").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", farbe);
}
function design() {
  const w = document.documentElement;
  const zeichne = () => {
    anzeigen(h`${zurueck("#/mehr", "Mehr")}<h1>Aussehen</h1>
      <h2>Farben</h2><div class="themes">${THEMES.map(([id, n, t]) => h`
        <button class="theme-karte" data-theme="${id}" data-wahl="${id}" aria-pressed="${w.dataset.theme === id}"><strong>${n}</strong><small>${t}</small><i>Neue Rechnung</i></button>`)}</div>
      <h2>Textgröße</h2><div class="chips">${[["normal", "Normal"], ["gross", "Groß"], ["sehr-gross", "Sehr groß"]].map(([id, n]) => h`<button class="chip" data-text-wahl="${id}" aria-current="${(w.dataset.text || "normal") === id}">${n}</button>`)}</div>
      <p>So groß erscheint Text in der ganzen App.</p>`, { navAktiv: "mehr", titel: "Aussehen" });
    $$("[data-wahl]").forEach((k) => k.addEventListener("click", async () => {
      designAnwenden({ theme: k.dataset.wahl });
      try { localStorage.setItem("praxis-theme", k.dataset.wahl); } catch { /* nur Komfort */ }
      await S.kvSchreiben("theme", k.dataset.wahl);
      zeichne();
    }));
    $$("[data-text-wahl]").forEach((k) => k.addEventListener("click", async () => {
      designAnwenden({ text: k.dataset.textWahl });
      try { localStorage.setItem("praxis-text", k.dataset.textWahl); } catch { /* nur Komfort */ }
      await S.kvSchreiben("text", k.dataset.textWahl);
      zeichne();
    }));
  };
  zeichne();
}

// ---------- Backup ----------
async function backupErstellen() {
  let pw = await S.kvLesen("backup_passwort");
  if (!pw) {
    const { wert, daten } = await dialog(h`<h2>Passwort für Sicherungen</h2>
      <p>Damit wird jede Sicherung verschlüsselt. Bitte aufschreiben und an einem sicheren Ort aufbewahren. Ohne dieses Passwort lässt sich eine Sicherung nicht wieder einspielen.</p>
      <label class="feld"><span>Passwort</span><input name="a" type="text" autocomplete="off" autocapitalize="off"></label>
      <label class="feld"><span>Noch einmal</span><input name="b" type="text" autocomplete="off" autocapitalize="off"></label>
      <p class="dlg-fehler"></p>
      <div class="knopfreihe"><button class="knopf haupt" value="ja">Festlegen</button><button class="knopf" value="abbrechen">Abbrechen</button></div>`.t,
    { pruefe: (f) => (String(f.get("a")).length < 8 ? "Bitte mindestens 8 Zeichen." : f.get("a") !== f.get("b") ? "Die beiden Eingaben sind verschieden." : "") });
    if (wert !== "ja") return;
    pw = daten.get("a");
    await S.kvSchreiben("backup_passwort", pw);
  }
  meldung("Sicherung wird vorbereitet.");
  const pdfs = await S.allePdfs();
  const datenbank = S.datenbankBytes();
  const bytes = await backupVerpacken({ datenbank, pdfs, info: { rechnungen: db().get("SELECT COUNT(*) AS n FROM rechnungen").n } }, pw);
  const datei = new File([bytes], `Praxis-Backup-${heute()}.praxisbackup`, { type: "application/octet-stream" });
  const ok = await dateiDialog(datei, "Sicherung ist fertig", "Tippe unten und wähle „In Dateien sichern“, dann iCloud Drive.");
  if (ok) {
    await S.kvSchreiben("letztes_backup", new Date().toISOString());
    await S.kvSchreiben("aenderungen", 0);
    meldung("Sicherung gespeichert.");
  }
  route();
}
async function backupEinspielen(datei, nachher = "#/") {
  let bytes;
  try { bytes = new Uint8Array(await datei.arrayBuffer()); } catch { return meldung("Die Datei ließ sich nicht lesen.", "fehler"); }
  const { wert, daten } = await dialog(h`<h2>Sicherung öffnen</h2>
    <label class="feld"><span>Passwort der Sicherung</span><input name="pw" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <div class="knopfreihe"><button class="knopf haupt" value="ja">Öffnen</button><button class="knopf" value="abbrechen">Abbrechen</button></div>`.t);
  if (wert !== "ja") return;
  try {
    const inhalt = await backupEntpacken(bytes, daten.get("pw"));
    const lage = S.datenbankPruefen(inhalt.datenbank);
    const stand = new Date(inhalt.meta.erstellt).toLocaleDateString("de-DE");
    const vorhanden = !!S.aktuelleDb();
    if (!await bestaetigen("Sicherung einspielen?", `Stand ${stand}: ${lage.rechnungen} Rechnungen, ${lage.kunden} Kunden.${vorhanden ? " Die aktuellen Daten auf diesem iPhone werden ersetzt." : ""}`, { ja: "Einspielen", gefahr: vorhanden })) return;
    await S.einspielen(inhalt);
    await S.kvSchreiben("backup_passwort", inhalt.passwort);
    await S.kvSchreiben("letztes_backup", inhalt.meta.erstellt);
    meldung("Sicherung eingespielt.");
    hin(nachher);
  } catch (e) { meldung(e.message, "fehler"); }
}
async function backupSeite() {
  const b = await backupLage();
  const dauerhaft = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  anzeigen(h`${zurueck("#/mehr", "Mehr")}<h1>Daten sichern</h1>
    <p class="lage">${backupText(b)}${b.aenderungen > 0 && b.zuletzt ? ` Seitdem ${b.aenderungen} ${b.aenderungen === 1 ? "Änderung" : "Änderungen"}.` : ""}</p>
    <p style="margin-bottom:1rem">Alle Daten liegen nur auf diesem iPhone. Eine Sicherung in iCloud Drive schützt sie, falls das Gerät verloren geht oder kaputtgeht.</p>
    <button class="gross-aktion" id="sichern">${ICON.teilen} Jetzt sichern</button>
    <h2>Sicherung einspielen</h2>
    <p style="margin-bottom:.75rem">Stellt einen früheren Stand wieder her, zum Beispiel auf einem neuen iPhone.</p>
    <label class="knopf" style="width:100%">Sicherung auswählen<input type="file" id="datei" hidden></label>
    ${dauerhaft === false ? h`<p class="leise klein" style="margin-top:1rem">iOS hat den Speicher nicht als dauerhaft bestätigt. Regelmäßige Sicherungen sind deshalb besonders wichtig.</p>` : ""}
  `, { navAktiv: "mehr", titel: "Daten sichern" });
  $("#sichern").addEventListener("click", backupErstellen);
  $("#datei").addEventListener("change", (e) => { if (e.target.files[0]) backupEinspielen(e.target.files[0]); });
}

// ---------- Erster Start ----------
function willkommen() {
  const iosSafari = navigator.standalone === false;
  anzeigen(h`<h1 class="tag">Willkommen bei Praxis</h1>
    ${iosSafari ? h`<div class="karte"><h2>Zuerst auf den Home-Bildschirm</h2>
      <p style="margin-bottom:.75rem">Erst dort bleiben die Daten dauerhaft gespeichert und die App funktioniert ohne Internet.</p>
      <ol class="anleitung"><li>Unten in Safari auf das Teilen-Symbol tippen.</li><li>„Zum Home-Bildschirm“ wählen und bestätigen.</li><li>Safari schließen und Praxis vom Home-Bildschirm aus öffnen.</li></ol></div>`
      : h`<p class="lage">Alle Daten bleiben nur auf diesem Gerät.</p>
      <label class="gross-aktion" style="cursor:pointer">Sicherung einspielen<input type="file" id="datei" hidden></label>
      <button class="knopf" id="neu" style="width:100%">Ohne Daten neu beginnen</button>`}`, { titel: "Praxis" });
  $("#datei")?.addEventListener("change", (e) => { if (e.target.files[0]) backupEinspielen(e.target.files[0], "#/"); });
  $("#neu")?.addEventListener("click", async () => {
    S.neuBeginnen();
    await S.speichern({ zaehlt: false });
    meldung("Bitte zuerst deine Daten eintragen.");
    hin("#/firma");
  });
}

// ---------- Router ----------
async function route() {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  if (!db()) return willkommen();
  const [pfad, query] = (location.hash.slice(1) || "/").split("?");
  const q = leseQuery(query);
  const t = pfad.split("/").filter(Boolean);
  try {
    if (!t.length) return await start();
    if (t[0] === "offen") return offeneAlle();
    if (t[0] === "rechnungen") return rechnungen(q);
    if (t[0] === "storniert") return storniert();
    if (t[0] === "rechnung" && t[1] === "neu") return rechnungNeu(q);
    if (t[0] === "rechnung") return await rechnungAnsicht(Number(t[1]));
    if (t[0] === "kunden") return kunden();
    if (t[0] === "kunde") return kundeForm(t[1] === "neu" ? null : Number(t[1]));
    if (t[0] === "heime") return heime();
    if (t[0] === "heim") return heimAnsicht(Number(t[1]));
    if (t[0] === "mehr") return await mehr();
    if (t[0] === "jahr") return await jahrAnsicht(q);
    if (t[0] === "leistungen") return leistungen();
    if (t[0] === "firma") return firma();
    if (t[0] === "design") return design();
    if (t[0] === "backup") return await backupSeite();
    return await start();
  } catch (e) {
    console.error(e);
    anzeigen(h`<h1>Das hat nicht geklappt</h1><p>${e.message}</p><div class="knopfreihe"><a class="knopf" href="#/">Zum Start</a></div>`, { navAktiv: "start" });
  }
}

nav.innerHTML = [["start", "#/", "Start", ICON.start], ["rechnung", "#/rechnungen", "Rechnungen", ICON.rechnung], ["kunde", "#/kunden", "Kunden", ICON.kunde], ["heim", "#/heime", "Heime", ICON.heim], ["mehr", "#/mehr", "Mehr", ICON.mehr]]
  .map(([id, ziel, text, ico]) => h`<a href="${ziel}" data-nav="${id}">${ico}${text}</a>`.t).join("");
window.addEventListener("hashchange", route);
document.addEventListener("click", (e) => {
  const a = e.target.closest("nav.leiste a");
  if (a && a.getAttribute("href") === location.hash) route();
});

(async () => {
  try {
    await S.starten();
    // localStorage wird sofort geschrieben und gewinnt; IndexedDB greift, falls iOS es geleert hat.
    const lokal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    designAnwenden({
      theme: lokal("praxis-theme") || (await S.kvLesen("theme")) || "heide",
      text: lokal("praxis-text") || (await S.kvLesen("text")) || "normal",
    });
    navigator.storage?.persist?.().catch(() => {});
    await route();
  } catch (e) {
    console.error(e);
    main.innerHTML = h`<h1>Die App konnte nicht starten</h1><p>${e.message}</p>`.t;
  }
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
