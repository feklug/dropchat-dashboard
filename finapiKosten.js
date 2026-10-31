// finAPI-Kosten: Rechnung (Blatt "finAPI" → Kosten) – Browser-Fassung von
// dashboard/finapiKosten.mjs, ohne Preisliste. Die Preise kommen aus der
// Datenbank (dashboard_finapi_preise, dashboard/sql/dashboard_lesen.sql), damit
// ausgehandelte Konditionen nicht im öffentlichen Code stehen.
//
// Format der Preise: { quelle, stand, posten: [{ key, name, beschreibung,
// art: 'gestaffelt' | 'stufen', pauschalen?, jeNutzer?, stufen? }] } – Beträge
// in Cent, bis: null = ohne Obergrenze.
(function () {
  'use strict';

  /** Die Zeilen der Preisskala, wie finAPI sie zeigt – mit Nutzerbereich. */
  function preisZeilen(posten) {
    const zeilen = [];
    if (posten.art === 'stufen') {
      let von = 1;
      for (const s of posten.stufen) {
        zeilen.push({ von, bis: s.bis, cent: s.cent, jeNutzer: false });
        von = (s.bis ?? 0) + 1;
      }
      return zeilen;
    }
    let von = 1;
    for (const p of posten.pauschalen) {
      zeilen.push({ von, bis: p.bis, cent: p.cent, jeNutzer: false });
      von = p.bis + 1;
    }
    for (const t of posten.jeNutzer) {
      zeilen.push({ von, bis: t.bis, cent: t.cent, jeNutzer: true });
      von = (t.bis ?? 0) + 1;
    }
    return zeilen;
  }

  /** Monatsbetrag in Cent für `nutzer` Nutzer. Die Pauschale fällt auch bei 0 an. */
  function betragFuer(posten, nutzer) {
    const n = Math.max(0, Math.floor(nutzer));
    if (posten.art === 'stufen') {
      return posten.stufen.find((s) => s.bis === null || n <= s.bis).cent;
    }
    const pauschale = posten.pauschalen.find((p) => n <= p.bis);
    if (pauschale) return pauschale.cent;
    const letzte = posten.pauschalen[posten.pauschalen.length - 1];
    let summe = letzte.cent;
    let unten = letzte.bis; // bis hierher in der Pauschale
    for (const t of posten.jeNutzer) {
      const oben = t.bis === null ? n : Math.min(n, t.bis);
      if (oben > unten) summe += (oben - unten) * t.cent;
      if (t.bis === null || n <= t.bis) break;
      unten = t.bis;
    }
    return summe;
  }

  /**
   * Alles, was die Karte eines Kostentyps braucht: Betrag, welche Zeile der
   * Skala gerade gilt, was der nächste Nutzer kostet und wo der nächste
   * Preissprung liegt (null = keiner mehr).
   */
  function kostenPosten(posten, nutzer) {
    const zeilen = preisZeilen(posten);
    const n = Math.max(0, Math.floor(nutzer));
    const aktiv = zeilen.findIndex((z) => z.bis === null || Math.max(n, 1) <= z.bis);
    const cent = betragFuer(posten, n);
    const zeile = zeilen[aktiv];
    const naechsteGrenze = zeile.bis === null ? null : zeile.bis + 1;
    return {
      key: posten.key,
      name: posten.name,
      beschreibung: posten.beschreibung,
      art: posten.art,
      zeilen,
      aktiveZeile: aktiv,
      cent,
      naechsterNutzerCent: betragFuer(posten, n + 1) - cent,
      naechsteGrenze,
      // Pauschale/Stufe: was ab der Grenze im Monat fällig wird.
      centAbGrenze: naechsteGrenze === null ? null : betragFuer(posten, naechsteGrenze),
    };
  }

  /** Rechnung für einen Monat: alle Posten und die Summe. */
  function monatsRechnung(nutzer, preise) {
    const posten = preise.posten.map((p) => kostenPosten(p, nutzer));
    return { nutzer, posten, summeCent: posten.reduce((s, p) => s + p.cent, 0) };
  }

  window.FinapiKosten = { preisZeilen, betragFuer, kostenPosten, monatsRechnung };
})();
