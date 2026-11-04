// PDF-Erzeugung auf dem Geraet. jsPDF und qrcode werden hereingereicht,
// damit derselbe Code im Browser und in den Tests laeuft.
// Rechnungen bleiben bewusst schlicht und schwarz-weiss: Die Themes gelten nur fuer die App.

import { epcText } from "./logik.js";

const RAND = 15;
const BREITE = 210;
const UNTEN = 280;
const euro = (x) => `${Number(x).toFixed(2).replace(".", ",")} €`;
const datumDe = (iso) => (iso && iso.length === 10 ? `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso || "");
const mengeText = (m) => (m === 1 ? "1" : Number(m).toFixed(2).replace(".", ","));

function qrZeichnen(doc, qrcode, text, x, y, groesse) {
  const qr = qrcode(0, "M");
  const alt = qrcode.stringToBytes;
  qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
  qr.addData(text, "Byte");
  qr.make();
  qrcode.stringToBytes = alt;
  const n = qr.getModuleCount();
  const m = groesse / n;
  doc.setFillColor(0, 0, 0);
  for (let z = 0; z < n; z++) for (let s = 0; s < n; s++) {
    if (qr.isDark(z, s)) doc.rect(x + s * m, y + z * m, m + 0.01, m + 0.01, "F");
  }
}

function kopf(doc, firma, r) {
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(30);
  doc.text(doc.splitTextToSize(firma.name, 105), RAND, 20);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(70);
  const absender = [firma.strasse, firma.plz_ort, firma.telefon && `Tel: ${firma.telefon}`, firma.mobil && `Mobil: ${firma.mobil}`].filter(Boolean);
  doc.text(absender, BREITE - RAND, 20, { align: "right", lineHeightFactor: 1.35 });

  doc.setFontSize(7).setTextColor(110);
  doc.text(`${firma.name}, ${firma.strasse}, ${firma.plz_ort}`, RAND, 48);
  doc.setDrawColor(190).setLineWidth(0.2).line(RAND, 49, BREITE - RAND, 49);

  doc.setFontSize(10).setTextColor(20);
  doc.setFont("helvetica", "bold").text(`${r.vorname} ${r.nachname}`, RAND, 55);
  doc.setFont("helvetica", "normal");
  doc.text([r.strasse, [r.plz, r.ort].filter(Boolean).join(" ")].filter(Boolean), RAND, 60, { lineHeightFactor: 1.3 });
}

const SPALTEN = [
  { x: RAND, titel: "Pos." },
  { x: RAND + 12, titel: "Datum" },
  { x: RAND + 36, titel: "Beschreibung" },
  { x: 135, titel: "Menge", rechts: true },
  { x: 162, titel: "Einzelpreis", rechts: true },
  { x: BREITE - RAND, titel: "Gesamt", rechts: true },
];

function tabellenKopf(doc, y) {
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(70);
  for (const s of SPALTEN) doc.text(s.titel, s.x, y, s.rechts ? { align: "right" } : undefined);
  doc.setDrawColor(120).setLineWidth(0.4).line(RAND, y + 1.5, BREITE - RAND, y + 1.5);
  return y + 6;
}

function positionenZeichnen(doc, positionen, yStart, { durchgestrichen = false } = {}) {
  let y = tabellenKopf(doc, yStart);
  positionen.forEach((p, i) => {
    const text = doc.splitTextToSize(p.beschreibung, 72);
    const hoehe = Math.max(1, text.length) * 4.2 + 1.6;
    if (y + hoehe > UNTEN) {
      doc.addPage();
      y = tabellenKopf(doc, 20);
    }
    const summe = euro(p.menge * p.einzelpreis);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(durchgestrichen ? 120 : 30);
    doc.text(String(i + 1), SPALTEN[0].x, y);
    doc.text(datumDe(p.datum), SPALTEN[1].x, y);
    doc.text(text, SPALTEN[2].x, y);
    doc.text(mengeText(p.menge), SPALTEN[3].x, y, { align: "right" });
    doc.text(euro(p.einzelpreis), SPALTEN[4].x, y, { align: "right" });
    doc.text(summe, SPALTEN[5].x, y, { align: "right" });
    if (durchgestrichen) {
      doc.setDrawColor(120).setLineWidth(0.2).line(SPALTEN[0].x, y - 1.2, SPALTEN[5].x, y - 1.2);
    }
    y += hoehe;
    doc.setDrawColor(225).setLineWidth(0.15).line(RAND, y - 3.4, BREITE - RAND, y - 3.4);
  });
  return y;
}

function seitenzahlen(doc, startSeite = 1) {
  const ende = doc.getNumberOfPages();
  if (ende === startSeite) return;
  for (let i = startSeite; i <= ende; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(110);
    doc.text(`Seite ${i - startSeite + 1} von ${ende - startSeite + 1}`, BREITE - RAND, 292, { align: "right" });
  }
}

function rechnungZeichnen(doc, libs, { firma, rechnung: r, positionen }) {
  const start = doc.getNumberOfPages();
  kopf(doc, firma, r);
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20);
  doc.text(`Rechnung ${r.rechnungsnr}`, RAND, 82);

  const meta = [["Rechnungsdatum", datumDe(r.datum)], ["Kundennummer", r.kundennr], ["Fällig bis", datumDe(r.faellig)]];
  meta.forEach(([l, w], i) => {
    const x = RAND + i * 60;
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100).text(l, x, 90);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20).text(String(w), x, 95);
  });

  let y = positionenZeichnen(doc, positionen, 104);
  if (y + 62 > UNTEN) { doc.addPage(); y = 20; }

  doc.setDrawColor(40).setLineWidth(0.5).line(RAND, y, BREITE - RAND, y);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
  doc.text("Gesamtbetrag:", 162, y + 6, { align: "right" });
  doc.text(euro(r.betrag), BREITE - RAND, y + 6, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "bold").setFontSize(9).text("Zahlungsinformationen", RAND, y);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(50);
  const zahlung = [
    `Bitte überweisen Sie den Betrag innerhalb von ${firma.zahlungsziel_tage} Tagen:`,
    `Bank: ${firma.bank}`,
    `Kontoinhaber: ${firma.inhaber}`,
    `IBAN: ${firma.iban}    BIC: ${firma.bic}`,
    `Verwendungszweck: ${r.rechnungsnr} ${r.kundennr}`,
  ];
  doc.text(zahlung, RAND, y + 5, { lineHeightFactor: 1.35 });
  qrZeichnen(doc, libs.qrcode, epcText(firma, r), BREITE - RAND - 26, y - 3, 26);
  doc.setFontSize(7).setTextColor(100).text("Mit der Banking-App scannen", BREITE - RAND - 13, y + 26, { align: "center" });
  y += 33;

  doc.setFontSize(9).setTextColor(40);
  doc.text(["Vielen Dank für Ihr Vertrauen.", `Mit freundlichen Grüßen, ${firma.inhaber}`], RAND, y, { lineHeightFactor: 1.35 });
  y += 11;
  doc.setFontSize(7.5).setTextColor(90);
  doc.text("Gemäß § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).", RAND, y);
  seitenzahlen(doc, start);
}

const neuesDok = (libs) => new libs.jsPDF({ unit: "mm", format: "a4", compress: true });
const bytes = (doc) => new Uint8Array(doc.output("arraybuffer"));

export function rechnungPdf(libs, daten) {
  const doc = neuesDok(libs);
  doc.setProperties({ title: `Rechnung ${daten.rechnung.rechnungsnr}` });
  rechnungZeichnen(doc, libs, daten);
  return bytes(doc);
}

export function sammelPdf(libs, liste) {
  const doc = neuesDok(libs);
  doc.setProperties({ title: "Rechnungen" });
  liste.forEach((d, i) => {
    if (i) doc.addPage();
    rechnungZeichnen(doc, libs, d);
  });
  return bytes(doc);
}

export function stornoPdf(libs, { firma, rechnung: r, positionen }) {
  const doc = neuesDok(libs);
  doc.setProperties({ title: `Stornorechnung ${r.rechnungsnr}` });
  kopf(doc, firma, r);
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(150, 30, 30).text("Stornorechnung", RAND, 82);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(60);
  doc.text(`zur Rechnung Nr. ${r.rechnungsnr} vom ${datumDe(r.datum)}`, RAND, 88);

  [["Stornonummer", `STORNO-${r.rechnungsnr}`], ["Stornodatum", datumDe(r.storno_datum)],
    ["Kundennummer", r.kundennr], ["Originalbetrag", euro(r.betrag)]].forEach(([l, w], i) => {
    const x = RAND + [0, 55, 90, 125][i];
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(100).text(l, x, 97);
    doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(20).text(String(w), x, 102);
  });

  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(20).text("Stornogrund:", RAND, 111);
  const grund = doc.setFont("helvetica", "normal").setFontSize(9).splitTextToSize(r.storno_grund || "", 180);
  doc.text(grund, RAND, 116, { lineHeightFactor: 1.35 });
  let y = 118 + grund.length * 4.4;
  doc.setTextColor(70).text("Die nachfolgende Rechnung wird hiermit vollständig storniert. Der Rechnungsbetrag wird nicht in Rechnung gestellt:", RAND, y, { maxWidth: 180 });
  y = positionenZeichnen(doc, positionen, y + 11, { durchgestrichen: true });
  if (y + 56 > UNTEN) { doc.addPage(); y = 20; }

  doc.setDrawColor(40).setLineWidth(0.5).line(RAND, y, BREITE - RAND, y);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
  doc.text("Stornierter Betrag:", 162, y + 6, { align: "right" });
  doc.text(euro(r.betrag), BREITE - RAND, y + 6, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(70);
  const hinweis = doc.splitTextToSize(`Hinweis gemäß GoBD / § 14 UStG: Diese Stornorechnung hebt die Rechnung Nr. ${r.rechnungsnr} vom ${datumDe(r.datum)} vollständig auf. Beide Dokumente (Originalrechnung und diese Stornorechnung) sind aufzubewahren. Gemäß § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung). Aufbewahrungsfrist: 10 Jahre.`, 180);
  doc.text(hinweis, RAND, y, { lineHeightFactor: 1.35 });
  y += hinweis.length * 3.8 + 18;

  doc.setDrawColor(90).setLineWidth(0.2).line(RAND, y, RAND + 40, y).line(RAND + 50, y, BREITE - RAND, y);
  doc.setFontSize(7.5).setTextColor(90).text("Datum", RAND, y + 4).text(`Unterschrift, ${firma.name}`, RAND + 50, y + 4);
  seitenzahlen(doc);
  return bytes(doc);
}

export function jahresPdf(libs, { jahr, monate, gesamt, storniert, firma }) {
  const namen = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const doc = neuesDok(libs);
  doc.setProperties({ title: `Jahresübersicht ${jahr}` });
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20).text(`Jahresübersicht ${jahr}`, RAND, 22);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90).text(firma.name, RAND, 28);
  const x = [RAND, 90, 125, 160, BREITE - RAND];
  let y = 40;
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(60);
  ["Monat", "Rechnungen", "Umsatz", "Bezahlt", "Offen"].forEach((t, i) => doc.text(t, x[i], y, i ? { align: "right" } : undefined));
  doc.setDrawColor(90).line(RAND, y + 1.5, BREITE - RAND, y + 1.5);
  y += 7;
  const zeile = (name, z, fett) => {
    doc.setFont("helvetica", fett ? "bold" : "normal").setFontSize(10).setTextColor(25);
    [name, String(z.anzahl), euro(z.summe), euro(z.bezahlt), euro(z.offen)].forEach((t, i) => doc.text(t, x[i], y, i ? { align: "right" } : undefined));
    y += 6.5;
  };
  monate.forEach((m) => zeile(namen[Number(m.monat) - 1], m));
  doc.line(RAND, y - 3.5, BREITE - RAND, y - 3.5);
  y += 1;
  zeile("Gesamt", gesamt, true);
  if (storniert.anzahl) {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(90);
    doc.text(`Nicht enthalten: ${storniert.anzahl} stornierte Rechnungen über ${euro(storniert.summe)}.`, RAND, y + 3);
  }
  return bytes(doc);
}

// Querformat-Blatt zum Mitnehmen, 15 Zeilen wie die alte Vorlage.
export function leistungsnachweisPdf(libs, firma) {
  const doc = new libs.jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  doc.setProperties({ title: "Leistungsnachweis" });
  const r = 15, b = 297 - 2 * r;
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(18).text("Leistungsnachweis", r, 18);
  doc.setFont("helvetica", "normal").setFontSize(10).text(firma.name, r, 24);
  doc.setLineWidth(0.5).setDrawColor(0).rect(297 - r - 60, 10, 60, 15);
  doc.setFont("helvetica", "bold").setFontSize(8).text("Kundennummer", 297 - r - 30, 15, { align: "center" });
  doc.setFontSize(12).text("_______________", 297 - r - 30, 22, { align: "center" });
  doc.line(r, 28, 297 - r, 28);
  doc.setFontSize(11).text("Monat / Jahr:", r, 36);
  doc.setFont("helvetica", "normal").text("______________", r + 26, 36);
  doc.setFont("helvetica", "bold").text("Kunde:", r + 66, 36);
  doc.setFont("helvetica", "normal").text("______________________________________________", r + 80, 36);
  const breiten = [32, 20, 20, 15, b - 127, 40];
  const titel = ["Datum", "Beginn", "Ende", "Std.", "Leistungsbeschreibung", "Unterschrift"];
  let y = 42;
  const h = 9.6;
  doc.setLineWidth(0.25);
  doc.setFillColor(238, 238, 238).rect(r, y, b, h, "F");
  doc.setFont("helvetica", "bold").setFontSize(8);
  for (let z = 0; z <= 15; z++) {
    let x = r;
    breiten.forEach((w, i) => {
      doc.rect(x, y, w, h);
      if (z === 0) doc.text(titel[i], x + 2, y + 6);
      x += w;
    });
    y += h;
  }
  doc.setFont("helvetica", "normal").setFontSize(8).text("Vielen Dank für die Bestätigung der erbrachten Leistungen.", 148.5, y + 5, { align: "center" });
  return bytes(doc);
}
