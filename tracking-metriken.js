(function (root) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  function tagWien(zeit) {
    const teile = formatter.formatToParts(new Date(zeit));
    return ['year', 'month', 'day'].map((typ) => teile.find((t) => t.type === typ).value).join('-');
  }
  const abstand = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  function berechne({ besuche, registrierungen, screen, modus, nenner, heute = tagWien(new Date()) }) {
    const starts = new Map(registrierungen.map((a) => [a.person_id, tagWien(a.created_at)])
      .filter(([, tag]) => tag <= heute));
    const erster = [...starts.values()].sort()[0];
    const tage = [];
    const oeffnungenProNutzer = [];
    const minutenProNutzer = [];
    const nutzerAnzahl = [];
    if (!erster) return { tage, oeffnungenProNutzer, minutenProNutzer, nutzerAnzahl };
    const werte = new Map();
    function bucket(personId, datum) {
      const start = starts.get(personId);
      if (!start || datum < start || datum > heute) return null;
      const key = modus === 'kalender' ? datum : abstand(start, datum);
      if (!werte.has(key)) werte.set(key, { oeffnungen: 0, ms: 0, aktive: new Set() });
      return werte.get(key);
    }
    for (const b of besuche) {
      if (b.screen !== screen || !starts.has(b.person_id)) continue;
      const tag = tagWien(b.geoeffnet_am);
      const start = bucket(b.person_id, tag);
      if (start) { start.oeffnungen++; start.aktive.add(b.person_id); }
      const dauer = b.tagesdauer_ms && typeof b.tagesdauer_ms === 'object'
        ? Object.entries(b.tagesdauer_ms)
        : [[tag, (b.verweildauer_sekunden || 0) * 1000]];
      for (const [datum, ms] of dauer) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(ms) || ms <= 0) continue;
        const ziel = bucket(b.person_id, datum);
        if (ziel) { ziel.ms += ms; ziel.aktive.add(b.person_id); }
      }
    }
    for (let d = 0; d <= abstand(erster, heute); d++) {
      const key = modus === 'kalender'
        ? new Date(Date.parse(erster) + d * 86400000).toISOString().slice(0, 10) : d;
      const wert = werte.get(key);
      const anzahl = nenner === 'aktiv' ? (wert?.aktive.size || 0)
        : [...starts.values()].filter((start) => modus === 'kalender' ? start <= key : abstand(start, heute) >= d).length;
      tage.push(key);
      nutzerAnzahl.push(anzahl);
      oeffnungenProNutzer.push(anzahl ? (wert?.oeffnungen || 0) / anzahl : 0);
      minutenProNutzer.push(anzahl ? (wert?.ms || 0) / 60000 / anzahl : 0);
    }
    return { tage, oeffnungenProNutzer, minutenProNutzer, nutzerAnzahl };
  }
  const api = { tagWien, berechne };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackingMetriken = api;
})(globalThis);
