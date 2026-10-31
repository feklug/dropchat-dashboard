// DropChat Dashboard (dashboard_live) – Sitzung und Datenzugriff.
//
// 1. Prüft beim Öffnen: angemeldet und Admin (dashboard_ich)? Sonst zurück
//    zum Login (index.html).
// 2. dashboardFetch(url, optionen): ersetzt die Endpunkte des alten lokalen
//    Servers (dashboard/server.mjs) durch die Datenbankfunktionen aus
//    dashboard/sql/dashboard_lesen.sql und dashboard_schreiben.sql. Gibt ein Response-ähnliches Objekt
//    zurück ({ ok, status, json() }) – so bleibt dashboard.js fast wie
//    retention.html.
//
// Geprüft wird in der Datenbank. Was hier passiert, ist nur Komfort.
(function () {
  'use strict';

  const konfig = window.DASHBOARD_KONFIG;
  const db = window.supabase.createClient(konfig.supabaseUrl, konfig.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  function zumLogin() {
    location.replace('index.html');
  }

  // Alle Datenabrufe warten, bis der Zugang bestätigt ist.
  const bereit = (async () => {
    const { data: sitzung } = await db.auth.getSession();
    if (!sitzung.session) {
      zumLogin();
      throw new Error('Nicht angemeldet.');
    }
    const { data, error } = await db.rpc('dashboard_ich');
    if (error || data?.admin !== true) {
      if (error) console.error('[Dashboard] dashboard_ich fehlgeschlagen:', error);
      zumLogin();
      throw new Error('Kein Zugang.');
    }
    return sitzung.session;
  })();

  bereit.then((sitzung) => {
    const wer = document.getElementById('angemeldet-als');
    if (wer) wer.textContent = sitzung.user.email ?? '';
  }).catch(() => {});

  document.getElementById('abmelden')?.addEventListener('click', async () => {
    const { error } = await db.auth.signOut();
    if (error) console.error('[Dashboard] Abmelden fehlgeschlagen:', error);
    zumLogin();
  });

  // ── Datenbank ───────────────────────────────────────────────────────
  async function rpc(name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
      // Zugang inzwischen entzogen oder Sitzung abgelaufen.
      if (error.code === '42501' || error.status === 401) zumLogin();
      throw new Error(error.message || error.code || 'Datenbankfehler');
    }
    return data;
  }

  // Seiten zu 5000 Zeilen (dashboard_tabelle), bis eine kürzere kommt.
  async function alleZeilen(name) {
    const alle = [];
    for (let seite = 0; ; seite++) {
      const zeilen = await rpc('dashboard_tabelle', { p_name: name, p_seite: seite });
      alle.push(...zeilen);
      if (zeilen.length < 5000) return alle;
    }
  }

  // Wie TABELLEN in dashboard/server.mjs.
  const QUELLEN = [
    'screen_besuch', 'friendship', 'account', 'bank_connection', 'chat_member', 'university', 'chat',
    'message', 'saldo_event', 'expense', 'onboarding_event', 'notification_settings', 'report',
    'audit_log', 'dashboard_bearbeitet', 'app_config', 'einladung_gesendet', 'person_status',
    'schatten_mitglied', 'einladung_empfaenger', 'kontakte_bei_registrierung', 'bonus_mitglied',
    'promoter_geworben', 'bank_flow_event', 'drops', 'eingang', 'category',
  ];

  // Höchstens 4 Abfragen gleichzeitig – schont Datenbank und Handy-Netz.
  async function nacheinander(namen, je) {
    const ergebnis = {};
    let i = 0;
    async function arbeiter() {
      while (i < namen.length) {
        const name = namen[i++];
        ergebnis[name] = await je(name);
      }
    }
    await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
    return ergebnis;
  }

  async function ladeDaten() {
    const daten = await nacheinander(QUELLEN, alleZeilen);
    daten.tracking_geladen_am = new Date().toISOString();
    return daten;
  }

  async function ladeTracking() {
    const [screen_besuch, account] = await Promise.all([alleZeilen('screen_besuch'), alleZeilen('tracking_account')]);
    return { screen_besuch, account, geladen_am: new Date().toISOString() };
  }

  // Wie ladeKosten in dashboard/server.mjs – Preise aus der Datenbank.
  async function ladeKosten() {
    const { preise, monate } = await rpc('dashboard_kosten');
    const K = window.FinapiKosten;
    const mitRechnung = monate.map((m) => ({ ...m, rechnung: K.monatsRechnung(m.nutzer, preise) }));
    const aktuell = mitRechnung[mitRechnung.length - 1];
    let naechsterSprung = null;
    if (aktuell) {
      const grenzen = aktuell.rechnung.posten.map((p) => p.naechsteGrenze).filter((g) => g !== null);
      if (grenzen.length) {
        const abNutzer = Math.min(...grenzen);
        naechsterSprung = { abNutzer, summeCent: K.monatsRechnung(abNutzer, preise).summeCent };
      }
    }
    return { quelle: preise.quelle, stand: preise.stand, monate: mitRechnung, naechsterSprung };
  }

  // Probelauf des bank-waechter für den nächsten Monatsletzten (Wiener Zeit),
  // wie simuliereTrennung in dashboard/server.mjs. Die Function lässt
  // Dashboard-Admins nur den Probelauf zu – der trennt und pusht nichts.
  async function simuliereTrennung() {
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
    const [jahr, monat] = heute.split('-').map(Number);
    const monatsletzter = new Date(Date.UTC(jahr, monat, 0)).toISOString().slice(0, 10);
    const { data, error } = await db.functions.invoke('bank-waechter', { body: { probelauf: true, heute: monatsletzter } });
    if (error) {
      const inhalt = await error.context?.json?.().catch(() => null);
      throw new Error(inhalt?.fehler || error.message);
    }
    return data;
  }

  // Ganze Zahl oder null – null lässt die Datenbank mit der passenden
  // Meldung ablehnen (wie Number.isInteger im alten Server).
  const ganzzahl = (wert) => (Number.isInteger(wert) ? wert : null);

  // Endpunkte des alten Servers -> Datenbankfunktionen
  // (dashboard/sql/dashboard_lesen.sql, dashboard_schreiben.sql).
  const ENDPUNKTE = {
    'GET /data.json': () => ladeDaten(),
    'GET /tracking.json': () => ladeTracking(),
    'GET /kosten.json': () => ladeKosten(),
    'GET /trennung.json': () => rpc('dashboard_trennung'),
    'GET /bonus.json': () => rpc('dashboard_bonus'),
    'GET /promoter.json': () => rpc('dashboard_promoter'),
    'POST /trennung-vorschau': (body) => rpc('dashboard_trennung_vorschau', { p_tage: body.inaktiv_tage }),
    // Es gibt keinen Zwischenspeicher mehr: Neu laden = Seite neu laden.
    'POST /reload-data': async () => ({ ok: true }),

    'POST /markiere-bearbeitet': (body) => rpc('dashboard_markiere_bearbeitet', { p_quelle: body.quelle, p_eintrag_id: body.eintragId }),
    'POST /setze-wartungsmodus': (body) => rpc('dashboard_setze_wartungsmodus', { p_aktiv: body.aktiv }),
    'POST /speichere-trennung': (body) => rpc('dashboard_speichere_trennung', { p_tage: ganzzahl(body.inaktiv_tage) }),
    'POST /simuliere-trennung': () => simuliereTrennung(),
    'POST /bonus-einstellungen': (body) => rpc('dashboard_bonus_einstellungen', { p_werte: body }),
    'POST /bonus-ausbezahlt': (body) => rpc('dashboard_bonus_ausbezahlt', { p_chat_id: body.chat_id, p_person_id: body.person_id, p_ausbezahlt: body.ausbezahlt }),
    'POST /bonus-ablaufen': () => rpc('dashboard_bonus_ablaufen'),
    'POST /promoter-anlegen': (body) => rpc('dashboard_promoter_anlegen', {
      p_name: body.name, p_code: body.code, p_max_geworbene: ganzzahl(body.max_geworbene), p_iban: body.iban,
    }),
    'POST /promoter-aendern': ({ promoter_id, ...werte }) => rpc('dashboard_promoter_aendern', { p_promoter_id: promoter_id, p_werte: werte }),
    'POST /promoter-preise': (body) => rpc('dashboard_promoter_preise', { p_werte: body }),
    'POST /promoter-programm': (body) => rpc('dashboard_promoter_programm', { p_aktiv: body.aktiv }),
  };

  function antwort(status, inhalt) {
    return { ok: status >= 200 && status < 300, status, json: async () => inhalt };
  }

  window.dashboardFetch = async function dashboardFetch(url, optionen = {}) {
    const methode = (optionen.method || 'GET').toUpperCase();
    const pfad = String(url).split('?')[0];
    const ziel = ENDPUNKTE[`${methode} ${pfad}`];
    if (!ziel) return antwort(404, { error: `Unbekannt: ${methode} ${pfad}` });
    try {
      await bereit;
      const body = optionen.body ? JSON.parse(optionen.body) : {};
      return antwort(200, await ziel(body));
    } catch (fehler) {
      console.error(`[Dashboard] ${methode} ${pfad} fehlgeschlagen:`, fehler);
      return antwort(500, { error: fehler.message });
    }
  };
})();
