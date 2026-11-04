// Kleine Oberflaechen-Bausteine. h`` escaped jeden Wert automatisch; nur roh() umgeht das.

class Roh { constructor(t) { this.t = t; } toString() { return this.t; } }
export const roh = (t) => new Roh(t);
const esc = (w) => String(w ?? "").replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
const wert = (w) => (w instanceof Roh ? w.t : Array.isArray(w) ? w.map(wert).join("") : w === false || w == null ? "" : esc(w));
export const h = (teile, ...werte) => roh(teile.reduce((a, t, i) => a + t + (i < werte.length ? wert(werte[i]) : ""), ""));

export const euro = (x) => `${Number(x || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const datumDe = (iso) => (iso && iso.length === 10 ? `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso || "");
export const zahl = (t) => { const n = parseFloat(String(t ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
export const zahlText = (x) => (x == null || x === "" ? "" : String(x).replace(".", ","));

const pfad = (d) => roh(`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);
export const ICON = {
  start: pfad('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>'),
  rechnung: pfad('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  kunde: pfad('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-4 4-5.5 7.5-5.5s6.3 1.5 7.5 5.5"/>'),
  heim: pfad('<path d="M5 21V5l7-2 7 2v16"/><path d="M10 21v-5h4v5M9.5 8h.01M14.5 8h.01M9.5 12h.01M14.5 12h.01"/>'),
  mehr: pfad('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  plus: pfad('<path d="M12 5v14M5 12h14"/>'),
  haken: pfad('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  kreuz: pfad('<path d="M6 6l12 12M18 6 6 18"/>'),
  stift: pfad('<path d="m4 20 1-4L16 5l3 3L8 19z"/>'),
  weiter: pfad('<path d="m9 5 7 7-7 7"/>'),
  zurueck: pfad('<path d="m15 5-7 7 7 7"/>'),
  teilen: pfad('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v10h14V11"/>'),
  kalender: pfad('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'),
  suche: pfad('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  mail: pfad('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>'),
  drucker: pfad('<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>'),
};

let meldungTimer;
export function meldung(text, art = "ok") {
  const m = document.getElementById("meldung");
  m.textContent = text;
  m.className = `meldung sichtbar ${art}`;
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => { m.className = "meldung"; }, art === "fehler" ? 6000 : 2800);
}

// Native <dialog>. Der Rueckgabewert ist der value des gedrueckten Knopfs oder "".
// baue(root) darf Felder verdrahten; mit Rueckgabe von pruefe() bleibt der Dialog bei Fehlern offen.
export function dialog(inhalt, { baue, pruefe } = {}) {
  return new Promise((ok) => {
    const d = document.createElement("dialog");
    d.className = "dlg";
    d.innerHTML = `<form method="dialog">${inhalt}</form>`;
    document.body.append(d);
    const form = d.querySelector("form");
    let wert = "";
    form.addEventListener("submit", (e) => {
      const knopf = e.submitter?.value ?? "";
      if (knopf && knopf !== "abbrechen" && pruefe) {
        const fehler = pruefe(new FormData(form), knopf);
        if (fehler) {
          e.preventDefault();
          const f = form.querySelector(".dlg-fehler");
          if (f) f.textContent = fehler;
          return;
        }
      }
      wert = knopf;
      daten = new FormData(form);
    });
    let daten = null;
    d.addEventListener("close", () => {
      d.remove();
      ok({ wert: wert === "abbrechen" ? "" : wert, daten });
    });
    baue?.(d);
    d.showModal();
  });
}

export async function bestaetigen(titel, text, { ja = "Ja", gefahr = false } = {}) {
  const { wert } = await dialog(h`
    <h2>${titel}</h2>
    <p>${text}</p>
    <div class="knopfreihe">
      <button class="knopf ${gefahr ? "gefahr" : "haupt"}" value="ja">${ja}</button>
      <button class="knopf" value="abbrechen">Abbrechen</button>
    </div>`.t);
  return wert === "ja";
}

// iOS verlangt, dass das Teilen direkt aus einem Fingertipp kommt. Dateien muessen also
// VOR dem Tipp fertig sein: Darum entstehen sie beim Aufbau der Seite oder in diesem Dialog.
export function kannDateiTeilen(datei) {
  try { return !!navigator.canShare && navigator.canShare({ files: [datei] }); } catch { return false; }
}
export async function dateiAusgeben(datei, angaben = {}) {
  if (kannDateiTeilen(datei)) {
    try {
      await navigator.share({ files: [datei], title: datei.name, ...angaben });
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(datei);
  const a = document.createElement("a");
  a.href = url;
  a.download = datei.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
export async function dateiDialog(datei, titel, text) {
  let geteilt = false;
  await dialog(h`
    <h2>${titel}</h2>
    <p>${text}</p>
    <div class="knopfreihe">
      <button type="button" class="knopf haupt" data-teilen>${ICON.teilen} Teilen oder sichern</button>
      <button class="knopf" value="abbrechen">Schließen</button>
    </div>`.t, {
    baue: (d) => d.querySelector("[data-teilen]").addEventListener("click", async () => {
      geteilt = (await dateiAusgeben(datei)) || geteilt;
      if (geteilt) d.close();
    }),
  });
  return geteilt;
}
