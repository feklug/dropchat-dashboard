// DropChat Dashboard (dashboard_live) – Auswertungen.
// Daten kommen über dashboardFetch (sitzung.js) aus den Datenbankfunktionen
// (dashboard/sql/dashboard_lesen.sql, dashboard_schreiben.sql).
const statusEl = document.getElementById('status-retention');
const statusWachstumEl = document.getElementById('status-wachstum');
const THEME_STORAGE_KEY = 'dropchat-dashboard-theme';
let themeState = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
if (!['system', 'light', 'dark'].includes(themeState)) themeState = 'system';
function effektivesTheme() {
  if (themeState !== 'system') return themeState;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function aktualisiereThemeAttribute() {
  if (themeState === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = themeState;
  document.documentElement.dataset.bsTheme = effektivesTheme();
  document.documentElement.style.colorScheme = effektivesTheme();
}
aktualisiereThemeAttribute();

function zeigeFehler(nachricht) {
  statusEl.textContent = nachricht;
  statusEl.classList.add('error');
}

function zeigeSupportFehler(nachricht) {
  const supportStatus = document.getElementById('support-data-status');
  if (!supportStatus) return;
  supportStatus.textContent = nachricht;
  supportStatus.classList.add('error');
}

// ---------------------------------------------------------------
// Sections ein-/ausklappbar machen (initial laut HTML; Inaktivitäts-
// Trennung und Einstellungen offen, alle anderen geschlossen). Generisch,
// damit später weitere Sektionen ohne zusätzlichen JS-Code dazukommen.
// ---------------------------------------------------------------
// Unterseiten je Instrument (03 Internes / 04 Externes Marketing).
document.querySelectorAll('[data-unterseiten]').forEach((nav) => {
  const body = nav.closest('.section-body');
  nav.querySelectorAll('[data-unterseite-ziel]').forEach((knopf) => {
    knopf.addEventListener('click', () => {
      const ziel = knopf.dataset.unterseiteZiel;
      nav.querySelectorAll('[data-unterseite-ziel]').forEach((k) => {
        const aktiv = k === knopf;
        k.classList.toggle('active', aktiv);
        k.setAttribute('aria-pressed', String(aktiv));
      });
      body.querySelectorAll(':scope > [data-unterseite]').forEach((seite) => {
        seite.hidden = seite.dataset.unterseite !== ziel;
      });
      // Diagramme, die versteckt gezeichnet wurden, an die Breite anpassen.
      aktualisiereChartGroessen();
    });
  });
});

document.querySelectorAll('[data-toggle-section]').forEach((header) => {
  function umschalten() {
    const section = header.closest('.dashboard-section');
    const eingeklappt = section.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', String(!eingeklappt));
    if (!eingeklappt) aktualisiereChartGroessen();
  }
  header.addEventListener('click', umschalten);
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); umschalten(); }
  });
});

// Rohdaten über dashboardFetch (sitzung.js) aus dashboard_tabelle – nur
// für Admins (dashboard/sql/dashboard_lesen.sql).
async function ladeRohdaten() {
  const res = await dashboardFetch('/data.json');
  if (!res.ok) {
    throw new Error(`Daten nicht geladen: ${(await res.json().catch(() => ({}))).error || res.status}`);
  }
  return res.json();
}

function formatiereSupportZeit(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

// "Als bearbeitet markieren" (siehe dashboard/sql/create_dashboard_bearbeitet_table.sql
// und dashboard_markiere_bearbeitet). Optimistisches
// UI-Update: Button -> Badge sofort, Server-Bestätigung im Hintergrund;
// schlägt der Request fehl, Button kommt zurück + Fehlermeldung.
async function markiereAlsBearbeitet(quelle, eintragId, button) {
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Speichere…';
  try {
    const res = await dashboardFetch('/markiere-bearbeitet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quelle, eintragId }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const zeile = await res.json();
    rohdaten.bearbeiteteMap.set(`${quelle}:${eintragId}`, zeile.bearbeitet_am);
    button.replaceWith(baueBearbeitetBadge(zeile.bearbeitet_am));
    zeigeSupportOffen();
  } catch (err) {
    console.error('Konnte nicht als bearbeitet markieren:', err);
    button.disabled = false;
    button.innerHTML = '<i class="ti ti-check me-1" aria-hidden="true"></i>Als bearbeitet markieren';
    zeigeSupportFehler('Markieren fehlgeschlagen.');
  }
}

function baueBearbeitetBadge(bearbeitetAm) {
  const badge = document.createElement('span');
  badge.className = 'badge bg-green-lt bearbeitet-badge';
  const icon = document.createElement('i');
  icon.className = 'ti ti-check';
  icon.setAttribute('aria-hidden', 'true');
  badge.appendChild(icon);
  badge.appendChild(document.createTextNode(`Bearbeitet am ${formatiereSupportZeit(bearbeitetAm)}`));
  return badge;
}

// textContent statt innerHTML: report.text/audit_log-Felder sind
// Freitext von Nutzer:innen (Support-Anfragen) – nie ungeprüft als HTML
// einsetzen (siehe interaction.md "Labels are untrusted data").
function baueSupportEintrag({ accountId, email, zeit, inhalt, quelle, eintragId }) {
  const div = document.createElement('div');
  div.className = 'card support-eintrag';

  const kopf = document.createElement('div');
  kopf.className = 'card-header support-eintrag-kopf';
  const links = document.createElement('span');
  links.className = 'text-muted';
  links.textContent = `account_id: ${accountId || 'unbekannt'} · ${email || 'keine E-Mail hinterlegt'}`;
  const rechts = document.createElement('span');
  rechts.className = 'badge bg-secondary-lt';
  rechts.textContent = formatiereSupportZeit(zeit);
  kopf.appendChild(links);
  kopf.appendChild(rechts);
  div.appendChild(kopf);

  const text = document.createElement('div');
  text.className = 'card-body support-eintrag-text';
  text.textContent = inhalt || '(kein Text)';
  div.appendChild(text);

  const bearbeitetAm = rohdaten.bearbeiteteMap.get(`${quelle}:${eintragId}`);
  if (bearbeitetAm) {
    div.classList.add('ist-bearbeitet');
    div.appendChild(baueBearbeitetBadge(bearbeitetAm));
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-primary btn-sm bearbeitet-btn';
    button.innerHTML = '<i class="ti ti-check me-1" aria-hidden="true"></i>Als bearbeitet markieren';
    button.addEventListener('click', () => markiereAlsBearbeitet(quelle, eintragId, button));
    div.appendChild(button);
  }

  return div;
}

function fuelleSupportListe(containerId, eintraege, baueFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (eintraege.length === 0) {
    const leer = document.createElement('p');
    leer.className = 'support-leer';
    leer.textContent = 'Keine Einträge.';
    container.appendChild(leer);
    return;
  }
  for (const eintrag of eintraege) container.appendChild(baueFn(eintrag));
}

// Zähler neben "Support" in der Seitenleiste und neben jedem Bereich: alle
// angezeigten Einträge, die noch nicht als bearbeitet markiert sind.
let supportEintraege = {}; // Bereich -> Schlüssel wie in bearbeiteteMap

function setzeSupportZaehler(id, offen) {
  const el = document.getElementById(id);
  el.textContent = String(offen);
  el.title = `${offen} noch nicht bearbeitet`;
  el.hidden = offen === 0;
}

function zeigeSupportOffen() {
  let gesamt = 0;
  for (const [bereich, schluessel] of Object.entries(supportEintraege)) {
    const offen = schluessel.filter((s) => !rohdaten.bearbeiteteMap.has(s)).length;
    setzeSupportZaehler(`support-offen-${bereich}`, offen);
    gesamt += offen;
  }
  setzeSupportZaehler('support-offen', gesamt);
}

function aktualisiereSupportDaten() {
  const supportStatus = document.getElementById('support-data-status');
  if (!supportStatus) return;

  const { reports, auditLog, accounts } = rohdaten;

  const accountById = new Map(accounts.map((a) => [a.account_id, a]));
  const accountByPersonId = new Map(accounts.map((a) => [a.person_id, a]));

  const nachTyp = { problem: [], hilfe: [], feedback: [] };
  for (const r of reports) {
    if (nachTyp[r.typ]) nachTyp[r.typ].push(r);
  }
  for (const liste of Object.values(nachTyp)) {
    liste.sort((a, b) => (b.zeit || '').localeCompare(a.zeit || ''));
  }

  const meldungen = auditLog
    .filter((a) => a.aktion === 'meldung')
    .sort((a, b) => (b.zeit || '').localeCompare(a.zeit || ''));

  const baueReportEintrag = (r) => {
    const acc = accountById.get(r.account_id);
    return baueSupportEintrag({
      accountId: r.account_id, email: acc?.email, zeit: r.zeit, inhalt: r.text,
      quelle: 'report', eintragId: r.report_id,
    });
  };

  fuelleSupportListe('support-liste-problem', nachTyp.problem, baueReportEintrag);
  fuelleSupportListe('support-liste-hilfe', nachTyp.hilfe, baueReportEintrag);
  fuelleSupportListe('support-liste-feedback', nachTyp.feedback, baueReportEintrag);
  fuelleSupportListe('support-liste-meldungen', meldungen, (m) => {
    const acc = accountByPersonId.get(m.person_id);
    const inhalt = `Aktion: ${m.aktion} · Objekt: ${m.objekt_typ || '–'} (${m.objekt_id || '–'})`;
    return baueSupportEintrag({
      accountId: acc?.account_id, email: acc?.email, zeit: m.zeit, inhalt,
      quelle: 'audit_log', eintragId: m.audit_id,
    });
  });

  const reportSchluessel = (liste) => liste.map((r) => `report:${r.report_id}`);
  supportEintraege = {
    problem: reportSchluessel(nachTyp.problem),
    hilfe: reportSchluessel(nachTyp.hilfe),
    feedback: reportSchluessel(nachTyp.feedback),
    meldungen: meldungen.map((m) => `audit_log:${m.audit_id}`),
  };
  zeigeSupportOffen();

  const gesamt = nachTyp.problem.length + nachTyp.hilfe.length + nachTyp.feedback.length + meldungen.length;
  supportStatus.classList.remove('error');
  supportStatus.textContent = `${reports.length} Reports (${nachTyp.problem.length} Problem, ${nachTyp.hilfe.length} Hilfe, ${nachTyp.feedback.length} Feedback) · ${meldungen.length} Meldungen · ${gesamt} Einträge angezeigt`;
}

// ---------------------------------------------------------------
// Blatt "Overview": Nutzeranzahl und durchsuchbare Nutzerliste. Eigener
// Endpunkt (dashboard_nutzerliste), damit Telefonnummern nicht in rohdaten
// landen. Namen sind Freitext – deshalb textContent.
// ---------------------------------------------------------------
let nutzerListe = [];

function nutzerPasstZuSuche(nutzer, suche) {
  const begriff = suche.trim().toLowerCase();
  if (!begriff) return true;
  if ((nutzer.anzeigename || '').toLowerCase().includes(begriff)) return true;
  if ((nutzer.email || '').toLowerCase().includes(begriff)) return true;
  // Nummern gehen auch mit "+", Leerzeichen oder führender 0 ("0664 123…").
  if (!/^[+\d\s()/-]+$/.test(begriff)) return false;
  const ziffern = begriff.replace(/\D/g, '').replace(/^0+/, '');
  return !!ziffern && (nutzer.telefon || '').includes(ziffern);
}

function zeichneNutzerListe() {
  const treffer = nutzerListe.filter((n) => nutzerPasstZuSuche(n, document.getElementById('nutzer-suche').value));
  document.getElementById('nutzer-liste').replaceChildren(...treffer.map((n) => {
    const zeile = document.createElement('tr');
    for (const wert of [n.anzeigename, n.email, n.telefon && `+${n.telefon}`, formatiereSupportZeit(n.registriert_am)]) {
      zeile.insertCell().textContent = wert || '–';
    }
    return zeile;
  }));
  document.getElementById('nutzer-leer').hidden = treffer.length > 0;
  document.getElementById('nutzer-status').textContent = `${treffer.length} von ${nutzerListe.length} Nutzern`;
}

async function initialisiereNutzerListe() {
  const statusEl = document.getElementById('nutzer-status');
  try {
    const res = await dashboardFetch('/nutzerliste.json', { cache: 'no-store' });
    const daten = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(daten.error || String(res.status));
    nutzerListe = daten;
    document.getElementById('stat-nutzer-anzahl').textContent = String(nutzerListe.length);
    document.getElementById('nutzer-suche').addEventListener('input', zeichneNutzerListe);
    zeichneNutzerListe();
  } catch (err) {
    console.error('Nutzerliste nicht geladen:', err);
    statusEl.textContent = `Nutzerliste nicht geladen: ${err.message}`;
    statusEl.classList.add('error');
  }
}

function tagKey(isoZeit) {
  return isoZeit.slice(0, 10);
}

function tageZwischen(tagKeyA, tagKeyB) {
  const a = new Date(tagKeyA + 'T00:00:00Z').getTime();
  const b = new Date(tagKeyB + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------
// Slider-Komponenten (Dual-Range für Zahlenbereiche, Tri-State für
// Bank Connection). Reines Vanilla-JS, keine Library nötig.
// ---------------------------------------------------------------
function erstelleDualSlider(container, { max, onChange }) {
  const min = 0;
  container.innerHTML = `
    <div class="slider-track"></div>
    <div class="slider-fill"></div>
    <input type="range" class="range-min" min="${min}" max="${max}" value="${min}" />
    <input type="range" class="range-max" min="${min}" max="${max}" value="${max}" />
  `;
  const fill = container.querySelector('.slider-fill');
  const inputMin = container.querySelector('.range-min');
  const inputMax = container.querySelector('.range-max');

  function aktualisiereOptik() {
    const lo = Number(inputMin.value);
    const hi = Number(inputMax.value);
    const spanne = max - min || 1;
    fill.style.left = `${((lo - min) / spanne) * 100}%`;
    fill.style.right = `${100 - ((hi - min) / spanne) * 100}%`;
  }

  function handleChange() {
    let lo = Number(inputMin.value);
    let hi = Number(inputMax.value);
    if (lo > hi) { [lo, hi] = [hi, lo]; inputMin.value = lo; inputMax.value = hi; }
    aktualisiereOptik();
    onChange(lo, hi);
  }

  inputMin.addEventListener('input', handleChange);
  inputMax.addEventListener('input', handleChange);
  aktualisiereOptik();
  onChange(min, max);
}

function erstelleTriStateSlider(container, tickContainer, { onChange }) {
  container.innerHTML = `
    <div class="slider-track"></div>
    <input type="range" min="0" max="2" step="1" value="0" />
  `;
  const werte = ['alle', 'an', 'aus'];
  const input = container.querySelector('input');
  const ticks = [...tickContainer.querySelectorAll('span')];

  function aktualisiere() {
    const idx = Number(input.value);
    ticks.forEach((t, i) => t.classList.toggle('active', i === idx));
    onChange(werte[idx]);
  }

  input.addEventListener('input', aktualisiere);
  aktualisiere();
}

// ---------------------------------------------------------------
// Daten laden & aufbereiten
// ---------------------------------------------------------------
let rohdaten = null;
let filterState = { screen: 'app', modus: 'kalender', nenner: 'alle', bank: 'alle', chatsMin: 0, chatsMax: Infinity, quelle: 'alle' };
let chartOeffnungen = null;
let chartMinuten = null;
let trackingRegistrierungen = null;
let trackingLaedt = false;
let trackingStand = null;

async function aktualisiereTracking() {
  if (!rohdaten || trackingLaedt || document.hidden) return;
  trackingLaedt = true;
  const status = document.getElementById('tracking-aktualisierung');
  try {
    const res = await dashboardFetch('/tracking.json', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const daten = await res.json();
    rohdaten.screenBesuche = daten.screen_besuch;
    trackingRegistrierungen = daten.account;
    trackingStand = new Date(daten.geladen_am).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
    status.textContent = `Stand: ${trackingStand} · Europe/Vienna`;
    zeichneCharts();
  } catch (error) {
    console.error('Tracking-Aktualisierung fehlgeschlagen:', error);
    status.textContent = `Aktualisierung fehlgeschlagen · ${trackingStand ? `letzter Stand: ${trackingStand}` : 'Datenstand nicht bestätigt'}`;
  } finally {
    trackingLaedt = false;
  }
}

async function ladeDaten() {
  const alles = await ladeRohdaten();
  const screenBesuche = alles.screen_besuch;
  const friendships = alles.friendship;
  const accounts = alles.account;
  const bankConnections = alles.bank_connection;
  const chatMembers = alles.chat_member;
  const universities = alles.university;
  const chats = alles.chat;
  const onboardingEvents = alles.onboarding_event;
  const notificationSettings = alles.notification_settings;
  const messages = alles.message;
  const expenses = alles.expense;
  const reports = alles.report || [];
  const auditLog = alles.audit_log || [];
  const bearbeiteteMap = new Map(
    (alles.dashboard_bearbeitet || []).map((b) => [`${b.quelle}:${b.eintrag_id}`, b.bearbeitet_am]),
  );
  const einladungen = alles.einladung_gesendet || [];
  const bankFlowEvents = alles.bank_flow_event || [];
  // Abschnitt 06: nur die Felder, die gezählt werden – so liegen keine Texte
  // im Speicher der Seite.
  const drops = (alles.drops || []).map((d) => ({
    accountId: d.account_id,
    status: d.status,
    sichtbar: d.sichtbarkeit === 'freunde',
    categoryId: d.category_id || null,
    hatHaendler: !!d.merchant_id,
  }));
  const eingaenge = alles.eingang || [];
  // 03 Schattengruppen: dieselben chat_member-Zeilen mit den neuen
  // Spalten. Sind es weniger als oben, fehlt das SQL (der Server lädt
  // den Eintrag dann leer, statt abzubrechen).
  const schattenSqlFehlt = (alles.schatten_mitglied || []).length < chatMembers.length;
  const schattenMitglieder = schattenSqlFehlt ? [] : alles.schatten_mitglied;
  const einladungenMitEmpfaenger = (alles.einladung_empfaenger || []).filter((e) => e.empfaenger_person_id);
  const personStatus = new Map((alles.person_status || []).map((p) => [p.person_id, p.status]));
  const kategorieNamen = new Map((alles.category || []).map((c) => [c.category_id, c.name]));

  // Tag 0 (Kohorten-Start) je Person: Registrierungsdatum
  // (account.created_at) – so hat jede registrierte Person sofort eine
  // echte Kohorten-Position, auch die, für die noch keine
  // screen_besuch-Zeile existiert (Chart bleibt für sie leer, bis
  // Tracking-Daten reinkommen, statt sie auszuschließen).
  const tag0ProPerson = new Map();
  for (const a of accounts) {
    if (!a.created_at) continue;
    tag0ProPerson.set(a.person_id, tagKey(a.created_at));
  }

  const accountZuPerson = new Map(accounts.map((a) => [a.account_id, a.person_id]));
  const bankConnectionAn = new Map();
  for (const bc of bankConnections) {
    const personId = accountZuPerson.get(bc.account_id);
    if (!personId) continue;
    if (bc.status === 'aktiv') bankConnectionAn.set(personId, true);
  }

  const chatAnzahl = new Map();
  for (const cm of chatMembers) {
    if (cm.status !== 'aktiv') continue;
    chatAnzahl.set(cm.person_id, (chatAnzahl.get(cm.person_id) || 0) + 1);
  }

  const maxChatAnzahl = Math.max(1, ...chatAnzahl.values(), 0);

  // Universität je Person fürs Wachstum – die
  // Spalte account.university_id existiert bereits im Schema, ist aber
  // bei den meisten Accounts noch nicht befüllt).
  const uniNameById = new Map(universities.map((u) => [u.university_id, u.name]));
  const universitaetProPerson = new Map();
  for (const a of accounts) {
    if (!a.university_id) continue;
    const name = uniNameById.get(a.university_id);
    if (name) universitaetProPerson.set(a.person_id, name);
  }
  const universitaeten = [...new Set(uniNameById.values())].sort((a, b) => a.localeCompare(b, 'de'));

  // Globaler Tag 0 fürs Wachstum: Registrierungstag der allerersten
  // Person überhaupt, UNABHÄNGIG von aktuellen Filtern (sonst würde
  // die X-Achse bei jeder Filteränderung verrutschen).
  let tag0Global = null;
  for (const a of accounts) {
    if (!a.created_at) continue;
    const tag = tagKey(a.created_at);
    if (!tag0Global || tag < tag0Global) tag0Global = tag;
  }

  const notificationSettingsProPerson = new Map(notificationSettings.map((n) => [n.person_id, n]));

  // Chat Health: chat.typ je Chat + wer überhaupt einen Account hat
  // (für Schattenchat-Erkennung unten – ein Schattenchat ist ein
  // Einzelchat, bei dem die GEGENSEITE keinen Account hat).
  const chatTypById = new Map(chats.map((c) => [c.chat_id, c.typ]));
  const personIdsMitAccount = new Set(accounts.map((a) => a.person_id));

  // Nachrichten zu EINER normalisierten Liste zusammenführen. "Bestätigte
  // Überweisungen" kommen ebenfalls aus message: In saldo_event hat die
  // Rücknahme einer Bestätigung denselben Typ (Gegen-Event) und wäre dort
  // nicht von einer Bestätigung zu unterscheiden.
  const chatHealthEvents = [];
  for (const m of messages) {
    if (!m.sent_at) continue;
    if (m.typ === 'text' || m.typ === 'forderung' || m.typ === 'zahlung') {
      if (!m.sender_person_id) continue;
      chatHealthEvents.push({ personId: m.sender_person_id, tag: tagKey(m.sent_at), kategorie: m.typ });
    } else if (m.typ === 'system' && m.system_typ === 'erinnerung' && m.ausgeloest_von_person_id) {
      chatHealthEvents.push({ personId: m.ausgeloest_von_person_id, tag: tagKey(m.sent_at), kategorie: 'erinnerung' });
    } else if (m.typ === 'system' && m.system_typ === 'saldo_korrektur' && m.ausgeloest_von_person_id) {
      chatHealthEvents.push({ personId: m.ausgeloest_von_person_id, tag: tagKey(m.sent_at), kategorie: 'manuelle_korrektur' });
    } else if (m.typ === 'system' && m.system_typ === 'saldo_korrektur_ueberweisung_bestaetigt' && m.ausgeloest_von_person_id) {
      chatHealthEvents.push({ personId: m.ausgeloest_von_person_id, tag: tagKey(m.sent_at), kategorie: 'ueberweisung_bestaetigt' });
    }
  }

  // Quelle je registrierter Person – die stärkste zählt, in dieser Reihenfolge:
  //   bonus           als Mitglied (nicht Ersteller) in einer Bonusgruppe
  //   promoter        Promoter-Code eingelöst
  //   schattengruppe  vor der Registrierung in einer Gruppe (keine Bonusgruppe)
  //   schattenchat    vor der Registrierung in einem Einzelchat
  //   sonstiges       nichts davon (App Store, Mundpropaganda, Link)
  // "Vor der Registrierung": ohne Konto hinzugefügt (chat_member.
  // ohne_app_hinzugefuegt) oder hinzugefügt, bevor das Konto entstand.
  const bonusChats = new Set((alles.bonus_mitglied || []).map((b) => b.chat_id));
  const bonusGeworben = new Set((alles.bonus_mitglied || []).filter((b) => b.rolle === 'mitglied').map((b) => b.person_id));
  const promoterGeworben = new Set((alles.promoter_geworben || []).map((p) => p.geworbene_person_id));
  const registriertAm = new Map(accounts.map((a) => [a.person_id, a.created_at]));
  const vorRegistrierung = { gruppe: new Set(), einzel: new Set() };
  for (const m of schattenMitglieder) {
    const konto = registriertAm.get(m.person_id);
    const ohneKonto = m.ohne_app_hinzugefuegt || (m.hinzugefuegt_am && konto && m.hinzugefuegt_am < konto);
    if (!ohneKonto) continue;
    const typ = chatTypById.get(m.chat_id);
    if (typ === 'gruppe' && !bonusChats.has(m.chat_id)) vorRegistrierung.gruppe.add(m.person_id);
    if (typ === 'einzel') vorRegistrierung.einzel.add(m.person_id);
  }
  const quelleProPerson = new Map(accounts.map((a) => [a.person_id,
    bonusGeworben.has(a.person_id) ? 'bonus'
      : promoterGeworben.has(a.person_id) ? 'promoter'
      : vorRegistrierung.gruppe.has(a.person_id) ? 'schattengruppe'
      : vorRegistrierung.einzel.has(a.person_id) ? 'schattenchat'
      : 'sonstiges']));

  rohdaten = {
    quelleProPerson,
    kontakteBeiRegistrierung: alles.kontakte_bei_registrierung || [],
    screenBesuche, accounts, chats, chatMembers, onboardingEvents, notificationSettingsProPerson,
    chatTypById, personIdsMitAccount, friendships, chatHealthEvents, expenses,
    tag0ProPerson, bankConnectionAn, chatAnzahl,
    maxChatAnzahl, universitaetProPerson, universitaeten, tag0Global,
    reports, auditLog, bearbeiteteMap, einladungen,
    bankFlowEvents, bankConnections,
    drops, eingaenge, kategorieNamen,
    schattenSqlFehlt, schattenMitglieder, einladungenMitEmpfaenger, personStatus,
  };

  aktualisiereSupportDaten();
  initialisiereWartungsmodusSchalter((alles.app_config && alles.app_config[0]) || { wartungsmodus: false });
}

function berechneKohorte() {
  const { screenBesuche, bankConnectionAn, chatAnzahl, accounts, quelleProPerson } = rohdaten;
  const { bank, chatsMin, chatsMax, quelle } = filterState;
  const registrierungen = (trackingRegistrierungen || accounts).filter((a) => {
    if (!a.created_at) return false;
    if (quelle !== 'alle' && (quelleProPerson.get(a.person_id) || 'sonstiges') !== quelle) return false;
    const chats = chatAnzahl.get(a.person_id) || 0;
    const verbunden = bankConnectionAn.get(a.person_id) || false;
    return chats >= chatsMin && chats <= chatsMax
      && (bank === 'alle' || (bank === 'an' ? verbunden : !verbunden));
  });
  return TrackingMetriken.berechne({ besuche: screenBesuche, registrierungen, ...filterState });
}

// ---------------------------------------------------------------
// Rendering: zwei separate Ein-Achsen-Charts (bewusst KEIN
// Dual-Axis-Kombichart – zwei Skalen auf einer Achse würden eine
// Korrelation vortäuschen, die nur an der willkürlichen
// Achsenskalierung liegt).
// ---------------------------------------------------------------
function css(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function baueTable(container, tage, werte, einheit, nachkommastellen = 2) {
  if (tage.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);font-size:12.5px;">Keine Daten.</p>'; return; }
  const zeilen = tage.map((t, i) => `<tr><td>Tag ${t}</td><td>${werte[i].toFixed(nachkommastellen)} ${einheit}</td></tr>`).join('');
  container.innerHTML = `<table><thead><tr><th>Tag</th><th>Wert</th></tr></thead><tbody>${zeilen}</tbody></table>`;
}

function gemeinsameOptionen(achsentitelY, achsentitelX = 'Tag seit Registrierung') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css('--surface-1'),
        titleColor: css('--text-muted'),
        bodyColor: css('--text-primary'),
        bodyFont: { weight: 'bold' },
        borderColor: css('--border'),
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: { title: (items) => `Tag ${items[0].label}` },
      },
    },
    scales: {
      x: {
        title: { display: true, text: achsentitelX, color: css('--text-muted'), font: { size: 11 } },
        grid: { display: false },
        ticks: { color: css('--text-muted'), font: { size: 11 } },
        border: { color: css('--baseline') },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: achsentitelY, color: css('--text-muted'), font: { size: 11 } },
        grid: { color: css('--gridline') },
        ticks: { color: css('--text-muted'), font: { size: 11 } },
        border: { display: false },
      },
    },
  };
}

function zeichneCharts() {
  if (!rohdaten) return;
  const { tage, oeffnungenProNutzer, minutenProNutzer, nutzerAnzahl } = berechneKohorte();
  const kalender = filterState.modus === 'kalender';
  const heute = TrackingMetriken.tagWien(new Date());
  const gestern = new Date(Date.parse(heute) - 86400000).toISOString().slice(0, 10);
  const labels = tage.map((tag) => !kalender ? `Tag ${tag}` : tag === heute ? 'Heute'
    : tag === gestern ? 'Gestern' : new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna' }));
  function optionen(titel) {
    const options = gemeinsameOptionen(titel, kalender ? 'Kalendertag (Europe/Vienna)' : 'Tag seit Registrierung');
    options.plugins.tooltip.callbacks.title = (items) => labels[items[0].dataIndex];
    return options;
  }

  if (tage.length === 0) {
    zeigeFehler('Keine registrierten Nutzer für diese Filterkombination.');
    if (chartOeffnungen) { chartOeffnungen.destroy(); chartOeffnungen = null; }
    if (chartMinuten) { chartMinuten.destroy(); chartMinuten = null; }
    document.getElementById('table-oeffnungen').innerHTML = '';
    document.getElementById('table-minuten').innerHTML = '';
    return;
  }
  statusEl.classList.remove('error');
  statusEl.textContent = `${kalender ? 'Kalendertage' : 'Kohortentage ab Tag 0'} · Durchschnitt über ${filterState.nenner === 'aktiv' ? 'aktive Nutzer der ausgewählten Seite' : 'alle berücksichtigten registrierten Nutzer'} · ${labels.at(-1)}: ${nutzerAnzahl.at(-1)} Nutzer`;

  const oeffnungenConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: oeffnungenProNutzer,
        backgroundColor: css('--series-1'),
        borderRadius: 4,
        barPercentage: 0.55,
      }],
    },
    options: optionen('Öffnungen / Nutzer'),
  };

  const minutenConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: minutenProNutzer,
        borderColor: css('--series-2'),
        backgroundColor: css('--series-2'),
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
      }],
    },
    options: optionen('Minuten / Nutzer'),
  };

  if (chartOeffnungen) { chartOeffnungen.data = oeffnungenConfig.data; chartOeffnungen.options = oeffnungenConfig.options; chartOeffnungen.update(); }
  else { chartOeffnungen = new Chart(document.getElementById('chart-oeffnungen'), oeffnungenConfig); }

  if (chartMinuten) { chartMinuten.data = minutenConfig.data; chartMinuten.options = minutenConfig.options; chartMinuten.update(); }
  else { chartMinuten = new Chart(document.getElementById('chart-minuten'), minutenConfig); }

  for (const [id, werte, einheit] of [['table-oeffnungen', oeffnungenProNutzer, ''], ['table-minuten', minutenProNutzer, 'Min']]) {
    document.getElementById(id).innerHTML = `<table><thead><tr><th>Tag</th><th>Wert</th><th>Nutzer</th></tr></thead><tbody>${labels.map((label, i) => `<tr><td>${label}</td><td>${werte[i].toFixed(2)} ${einheit}</td><td>${nutzerAnzahl[i]}</td></tr>`).join('')}</tbody></table>`;
  }
}

// ---------------------------------------------------------------
// Wachstum: neue Nutzer pro Tag seit der allerersten Registrierung.
// Tag 1 = Registrierungstag der allerersten Person (nicht Tag 0 wie
// bei Retention) – andere Zählweise, weil hier kein Pro-Kohorten-Alter
// gemeint ist, sondern schlicht der Kalendertag seit Projektstart.
// ---------------------------------------------------------------
let wachstumFilterState = { bank: 'alle', chatsMin: 0, chatsMax: Infinity, uni: 'alle', quelle: 'alle' };
let chartWachstum = null;

function berechneWachstum() {
  const { accounts, bankConnectionAn, chatAnzahl, universitaetProPerson, tag0Global } = rohdaten;
  const { bank: bankFilter, chatsMin, chatsMax, uni: uniFilter, quelle: quelleFilter } = wachstumFilterState;
  const { quelleProPerson } = rohdaten;

  if (!tag0Global) return { tage: [], neueNutzer: [] };

  const heute = tagKey(new Date().toISOString());
  const maxOffset = tageZwischen(tag0Global, heute);
  const zaehlerProTag = new Array(maxOffset + 1).fill(0);

  for (const a of accounts) {
    if (!a.created_at) continue;
    const personId = a.person_id;

    const bankAn = bankConnectionAn.get(personId) || false;
    if (bankFilter === 'an' && !bankAn) continue;
    if (bankFilter === 'aus' && bankAn) continue;

    const anzahlChats = chatAnzahl.get(personId) || 0;
    if (anzahlChats < chatsMin || anzahlChats > chatsMax) continue;

    if (uniFilter !== 'alle' && (universitaetProPerson.get(personId) || null) !== uniFilter) continue;
    if (quelleFilter !== 'alle' && (quelleProPerson.get(personId) || 'sonstiges') !== quelleFilter) continue;

    const offset = tageZwischen(tag0Global, tagKey(a.created_at));
    if (offset < 0 || offset > maxOffset) continue;
    zaehlerProTag[offset]++;
  }

  const tage = [];
  const neueNutzer = [];
  for (let d = 0; d <= maxOffset; d++) {
    tage.push(d + 1); // Tag 1 = Tag der allerersten Registrierung
    neueNutzer.push(zaehlerProTag[d]);
  }
  return { tage, neueNutzer };
}

function zeichneWachstumChart() {
  const { tage, neueNutzer } = berechneWachstum();

  if (tage.length === 0) {
    statusWachstumEl.textContent = 'Keine Daten für diese Filterkombination.';
    statusWachstumEl.classList.add('error');
    if (chartWachstum) { chartWachstum.destroy(); chartWachstum = null; }
    document.getElementById('table-wachstum').innerHTML = '';
    return;
  }
  statusWachstumEl.classList.remove('error');
  const gesamt = neueNutzer.reduce((a, b) => a + b, 0);
  statusWachstumEl.textContent = `${tage.length} Tage seit erster Registrierung · ${gesamt} Nutzer im gewählten Filter`;

  const config = {
    type: 'bar',
    data: {
      labels: tage,
      datasets: [{
        data: neueNutzer,
        backgroundColor: css('--series-3'),
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: gemeinsameOptionen('Neue Nutzer', 'Tag seit erster Registrierung'),
  };

  if (chartWachstum) { chartWachstum.data = config.data; chartWachstum.update(); }
  else { chartWachstum = new Chart(document.getElementById('chart-wachstum'), config); }

  baueTable(document.getElementById('table-wachstum'), tage, neueNutzer, 'Nutzer', 0);
}

// ---------------------------------------------------------------
// 03 Internes Marketing → Chats / Gruppen: gestartete Einzelchats bzw.
// Gruppen pro Nutzer pro Tag seit Registrierung – Kohorten-Logik wie
// Retention, aber ab Tag 0 = Registrierungstag (Nenner = wie viele
// Personen an diesem Tag schon "alt genug" waren), gezählt werden chat.created_at
// mit ersteller_person_id. Filter schränken nur ein, WELCHE Chats zählen,
// nie den Nenner.
//
// Schatten = beim Start hatte mindestens ein Mitglied kein Konto (ohne
// Konto hinzugefügt, oder Konto erst nach dem Chat angelegt).
// Organic Count = Schatten, in dem heute alle Mitglieder ein Konto haben.
// ---------------------------------------------------------------
let organischFilterState = { quelle: 'alle', schatten: 'alle' };
let gruppenFilterState = { schatten: 'alle' };
let chartOrganisch = null;
let chartGruppen = null;

function schattenInfo() {
  const { chats, chatMembers, schattenMitglieder, accounts } = rohdaten;
  const regAm = new Map(accounts.map((a) => [a.person_id, a.created_at]));
  const ohneApp = new Set(schattenMitglieder.filter((m) => m.ohne_app_hinzugefuegt).map((m) => `${m.chat_id}|${m.person_id}`));
  const mitglieder = new Map();
  for (const m of chatMembers) {
    if (!mitglieder.has(m.chat_id)) mitglieder.set(m.chat_id, []);
    mitglieder.get(m.chat_id).push(m);
  }
  const schatten = new Set();
  const normalGeworden = new Set();
  for (const c of chats) {
    const liste = mitglieder.get(c.chat_id) || [];
    const warSchatten = liste.some((m) => {
      const konto = regAm.get(m.person_id);
      return ohneApp.has(`${c.chat_id}|${m.person_id}`) || !konto || (c.created_at && konto > c.created_at);
    });
    if (!warSchatten) continue;
    schatten.add(c.chat_id);
    const aktuelle = liste.filter((m) => m.status !== 'geloescht');
    if (aktuelle.length > 1 && aktuelle.every((m) => regAm.has(m.person_id))) normalGeworden.add(c.chat_id);
  }
  return { schatten, normalGeworden };
}

function berechneGestartete(typ, { quelle = 'alle', nurSchatten = false }, info) {
  const { chats, tag0ProPerson } = rohdaten;
  const heute = tagKey(new Date().toISOString());

  const maxOffsetProPerson = new Map();
  let groessterOffset = 0;
  for (const [personId, tag0] of tag0ProPerson) {
    const offset = tageZwischen(tag0, heute);
    maxOffsetProPerson.set(personId, offset);
    if (offset > groessterOffset) groessterOffset = offset;
  }
  const nutzerInKohorte = new Array(groessterOffset + 1).fill(0);
  for (const offset of maxOffsetProPerson.values()) {
    for (let d = 0; d <= offset; d++) nutzerInKohorte[d]++;
  }

  const summe = new Array(groessterOffset + 1).fill(0);
  for (const c of chats) {
    if (c.typ !== typ || !c.ersteller_person_id || !c.created_at) continue;
    // Vom System angelegt (Verrechnung in Gruppen, Bonusgruppen) – nicht gestartet.
    if (c.auto_verrechnung) continue;
    if (quelle !== 'alle' && c.created_from !== quelle) continue;
    if (nurSchatten && !info.schatten.has(c.chat_id)) continue;
    if (!maxOffsetProPerson.has(c.ersteller_person_id)) continue;
    const offset = tageZwischen(tag0ProPerson.get(c.ersteller_person_id), tagKey(c.created_at));
    if (offset < 0 || offset > groessterOffset) continue;
    summe[offset]++;
  }

  // Ab Tag 0 (Registrierungstag): Im Onboarding starten viele ihre ersten
  // Chats direkt am ersten Tag.
  const tage = [];
  const proNutzer = [];
  for (let d = 0; d <= groessterOffset; d++) {
    const nenner = nutzerInKohorte[d] || 0;
    tage.push(d);
    proNutzer.push(nenner ? summe[d] / nenner : 0);
  }
  return { tage, proNutzer };
}

function zeichneGestartete({ typ, filter, statusId, canvasId, tabellenId, achse, einheit, altesChart, organischId, organischText }) {
  const statusEl = document.getElementById(statusId);
  const info = schattenInfo();
  const { tage, proNutzer } = berechneGestartete(typ, { quelle: filter.quelle, nurSchatten: filter.schatten === 'schatten' }, info);

  const schattenDieses = rohdaten.chats.filter((c) => c.typ === typ && !c.auto_verrechnung && info.schatten.has(c.chat_id));
  const normal = schattenDieses.filter((c) => info.normalGeworden.has(c.chat_id)).length;
  document.getElementById(organischId).textContent = normal;
  document.getElementById(`${organischId}-label`).textContent =
    `${organischText} (${normal} von ${schattenDieses.length}${schattenDieses.length ? ` · ${prozent(normal, schattenDieses.length)}%` : ''})`;

  if (tage.length === 0) {
    statusEl.textContent = 'Keine Daten für diese Filterkombination.';
    statusEl.classList.add('error');
    if (altesChart) altesChart.destroy();
    document.getElementById(tabellenId).innerHTML = '';
    return null;
  }
  statusEl.classList.remove('error');
  statusEl.textContent = `${tage.length} Kohorten-Tage`;
  const config = {
    type: 'bar',
    data: { labels: tage, datasets: [{ data: proNutzer, backgroundColor: css('--series-4'), borderRadius: 4, barPercentage: 0.55 }] },
    options: gemeinsameOptionen(achse),
  };
  let chart = altesChart;
  if (chart) { chart.data = config.data; chart.update(); }
  else { chart = new Chart(document.getElementById(canvasId), config); }
  baueTable(document.getElementById(tabellenId), tage, proNutzer, einheit);
  return chart;
}

function zeichneOrganischChart() {
  chartOrganisch = zeichneGestartete({
    typ: 'einzel', filter: organischFilterState, statusId: 'status-organisch', canvasId: 'chart-organisch',
    tabellenId: 'table-organisch', achse: 'Gestartete Chats / Nutzer', einheit: 'Chats', altesChart: chartOrganisch,
    organischId: 'stat-chats-organisch', organischText: 'Organic Count: Schattenchats, die zu normalen Chats wurden',
  });
}

function zeichneGruppenChart() {
  chartGruppen = zeichneGestartete({
    typ: 'gruppe', filter: gruppenFilterState, statusId: 'status-gruppen', canvasId: 'chart-gruppen',
    tabellenId: 'table-gruppen', achse: 'Gestartete Gruppen / Nutzer', einheit: 'Gruppen', altesChart: chartGruppen,
    organischId: 'stat-gruppen-organisch', organischText: 'Organic Count: Schattengruppen, die zu normalen Gruppen wurden',
  });
}

// Einladungen versendet / Nutzer – exakt dieselbe Kohorten-Logik wie
// Retention/berechneOrganischesWachstum (Tag 0 = Registrierungstag,
// Nenner = wie viele Personen an dem Tag schon alt genug waren), nur
// gezählt werden einladung_gesendet-Zeilen statt screen_besuch/chat.
// Bewusst OHNE Filter (kein Quelle-Filter wie beim Chat-Chart oben –
// "Quelle" bezieht sich auf chat.created_from, das passt inhaltlich
// nicht zu Einladungen, deshalb eigene Untersektion statt Wiederver-
// wendung des bestehenden Filters).
let chartEinladungen = null;

function berechneEinladungenKohorte() {
  const { einladungen, tag0ProPerson } = rohdaten;
  const heute = tagKey(new Date().toISOString());

  const maxOffsetProPerson = new Map();
  let groessterOffset = 0;
  for (const [personId, tag0] of tag0ProPerson) {
    const offset = tageZwischen(tag0, heute);
    maxOffsetProPerson.set(personId, offset);
    if (offset > groessterOffset) groessterOffset = offset;
  }
  const nutzerInKohorte = new Array(groessterOffset + 1).fill(0);
  for (const offset of maxOffsetProPerson.values()) {
    for (let d = 0; d <= offset; d++) nutzerInKohorte[d]++;
  }

  const summeProTag = new Array(groessterOffset + 1).fill(0);
  for (const e of einladungen) {
    if (!e.absender_person_id || !e.gesendet_am) continue;
    if (!maxOffsetProPerson.has(e.absender_person_id)) continue;
    const tag0 = tag0ProPerson.get(e.absender_person_id);
    const offset = tageZwischen(tag0, tagKey(e.gesendet_am));
    if (offset < 0 || offset > groessterOffset) continue;
    summeProTag[offset]++;
  }

  const tage = [];
  const proNutzer = [];
  for (let d = 0; d <= groessterOffset; d++) {
    const nenner = nutzerInKohorte[d] || 0;
    tage.push(d);
    proNutzer.push(nenner ? summeProTag[d] / nenner : 0);
  }
  return { tage, proNutzer };
}

function zeichneEinladungenChart() {
  const { tage, proNutzer } = berechneEinladungenKohorte();
  const tabelle = document.getElementById('table-einladungen');

  if (tage.length === 0) {
    if (chartEinladungen) { chartEinladungen.destroy(); chartEinladungen = null; }
    if (tabelle) tabelle.innerHTML = '';
    return;
  }

  const config = {
    type: 'bar',
    data: {
      labels: tage,
      datasets: [{
        data: proNutzer,
        backgroundColor: css('--series-4'),
        borderRadius: 4,
        barPercentage: 0.55,
      }],
    },
    options: gemeinsameOptionen('Einladungen / Nutzer'),
  };

  if (chartEinladungen) { chartEinladungen.data = config.data; chartEinladungen.update(); }
  else { chartEinladungen = new Chart(document.getElementById('chart-einladungen'), config); }

  baueTable(tabelle, tage, proNutzer, 'Einladungen');
}

// Kennzahlen für OS-Berechtigungen – statisch, kein Filter (siehe
// account.*_zugriff: 'all' | 'limited' | 'none').
function zeigeOsFreigabenAnteil() {
  const { accounts } = rohdaten;
  const gesamt = accounts.length;
  const setzeWert = (id, spalte) => {
    const freigegeben = accounts.filter((a) => a[spalte] && a[spalte] !== 'none').length;
    const anteil = gesamt ? Math.round((freigegeben / gesamt) * 100) : 0;
    const el = document.getElementById(id);
    el.textContent = `${anteil}%`;
    el.title = `${freigegeben} von ${gesamt} Nutzer:innen`;
  };
  setzeWert('stat-kontakte-freigegeben', 'kontakte_zugriff');
  setzeWert('stat-mitteilungen-freigegeben', 'mitteilungen_zugriff');
}

// ---------------------------------------------------------------
// Onboarding-Funnel "Registrieren Teil 1". Gezählt wird pro Schritt
// die Anzahl EINDEUTIGER onboarding_id (nicht Zeilen – ein Schritt
// kann theoretisch mehrfach geloggt sein, siehe lib/onboardingTracking.ts,
// zählt aber nur einmal pro Person/Gerät). onboarding_id existiert
// schon VOR dem Login (anonyme Geräte-ID, siehe dort) – deshalb bildet
// dieser Funnel Abbrüche ab, die screen_besuch (erst ab echtem Login)
// gar nicht sehen könnte.
// ---------------------------------------------------------------
const ONBOARDING_FUNNEL_SCHRITTE = [
  { key: 'telefonnummer_eingegeben', label: 'Telefonnummer eingegeben' },
  { key: 'telefonnummer_verifiziert', label: 'Telefonnummer verifiziert' },
  { key: 'profilbild_hinzugefuegt', label: 'Profilbild hinzugefügt' },
  { key: 'name_hinzugefuegt', label: 'Name hinzugefügt' },
  { key: 'username_veraendert', label: 'Username verändert' },
  { key: 'konto_erstellt', label: 'Konto erstellt' },
  { key: 'kontakte_freigegeben', label: 'Kontakte freigegeben' },
  { key: 'erster_chat_geoeffnet', label: 'Erster Chat geöffnet' },
  { key: 'registrieren_teil_1_beendet', label: 'Registrieren Teil 1 beendet' },
];
let chartOnboarding = null;

function berechneOnboardingFunnel() {
  const { onboardingEvents } = rohdaten;
  const mengeProSchritt = new Map();
  for (const e of onboardingEvents) {
    if (!mengeProSchritt.has(e.event_name)) mengeProSchritt.set(e.event_name, new Set());
    mengeProSchritt.get(e.event_name).add(e.onboarding_id);
  }
  const ersterWert = mengeProSchritt.get(ONBOARDING_FUNNEL_SCHRITTE[0].key)?.size || 0;
  return ONBOARDING_FUNNEL_SCHRITTE.map((schritt) => {
    const anzahl = mengeProSchritt.get(schritt.key)?.size || 0;
    return { label: schritt.label, anzahl, anteil: ersterWert ? anzahl / ersterWert : 0 };
  });
}

function zeichneOnboardingFunnel() {
  const statusOnboardingEl = document.getElementById('status-onboarding');
  const funnel = berechneOnboardingFunnel();
  const gesamtEingestiegen = funnel[0].anzahl;

  if (gesamtEingestiegen === 0) {
    statusOnboardingEl.textContent = 'Noch keine Onboarding-Events erfasst.';
    statusOnboardingEl.classList.add('error');
    if (chartOnboarding) { chartOnboarding.destroy(); chartOnboarding = null; }
    document.getElementById('table-onboarding').innerHTML = '';
    return;
  }
  statusOnboardingEl.classList.remove('error');
  const beendet = funnel[funnel.length - 1];
  statusOnboardingEl.textContent = `${gesamtEingestiegen} gestartet · ${beendet.anzahl} abgeschlossen (${Math.round(beendet.anteil * 100)}%)`;

  // Direkte Beschriftung je Balken (Anzahl + Anteil vom ersten Schritt)
  // statt eines Werts auf jedem Punkt eines Liniencharts – hier sinnvoll,
  // weil es bei einem Funnel genau DIE Kernaussage ist, nicht Chart-Deko.
  const direktLabelPlugin = {
    id: 'direktLabel',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const labels = chart.data.datasets[0].direktLabels || [];
      ctx.save();
      ctx.fillStyle = css('--text-primary');
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      meta.data.forEach((bar, i) => {
        ctx.fillText(labels[i] ?? '', bar.x + 8, bar.y);
      });
      ctx.restore();
    },
  };

  const config = {
    type: 'bar',
    data: {
      labels: funnel.map((f) => f.label),
      datasets: [{
        data: funnel.map((f) => f.anzahl),
        direktLabels: funnel.map((f) => `${f.anzahl} (${Math.round(f.anteil * 100)}%)`),
        backgroundColor: css('--series-6'),
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 70 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css('--surface-1'),
          titleColor: css('--text-muted'),
          bodyColor: css('--text-primary'),
          bodyFont: { weight: 'bold' },
          borderColor: css('--border'),
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (item) => `${item.raw} Personen (${Math.round(funnel[item.dataIndex].anteil * 100)}% vom Start)`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: 'Personen (eindeutige Geräte-IDs)', color: css('--text-muted'), font: { size: 11 } },
          grid: { color: css('--gridline') },
          ticks: { color: css('--text-muted'), font: { size: 11 } },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: css('--text-primary'), font: { size: 12 } },
          border: { color: css('--baseline') },
        },
      },
    },
    plugins: [direktLabelPlugin],
  };

  if (chartOnboarding) { chartOnboarding.destroy(); chartOnboarding = null; }
  chartOnboarding = new Chart(document.getElementById('chart-onboarding'), config);

  const tabelle = document.getElementById('table-onboarding');
  const zeilen = funnel
    .map((f) => `<tr><td>${f.label}</td><td>${f.anzahl}</td><td>${Math.round(f.anteil * 100)}%</td></tr>`)
    .join('');
  tabelle.innerHTML = `<table><thead><tr><th>Schritt</th><th>Anzahl</th><th>Anteil vom Start</th></tr></thead><tbody>${zeilen}</tbody></table>`;
}

// ---------------------------------------------------------------
// Benachrichtigungen (Untersektion von Onboarding). Die Berechtigung im
// Betriebssystem steht in zeigeOsFreigabenAnteil, hier der Push-Schalter in
// der App (notification_settings.push_aktiv). Fehlt für eine Person die Zeile
// (z. B. noch nie geöffnet), gilt der Spalten-Default aus dem Schema –
// das entspricht dem, was die App selbst als effektive Einstellung
// anzeigen würde.
// ---------------------------------------------------------------
function zeigeBenachrichtigungenAktiviertAnteil() {
  const { accounts, notificationSettingsProPerson } = rohdaten;
  const gesamt = accounts.length;
  const aktiviert = accounts.filter((a) => notificationSettingsProPerson.get(a.person_id)?.push_aktiv ?? true).length;
  const anteil = gesamt ? Math.round((aktiviert / gesamt) * 100) : 0;
  const el = document.getElementById('stat-push-aktiviert');
  el.textContent = `${anteil}%`;
  el.title = `${aktiviert} von ${gesamt} Nutzer:innen`;
}

// ---------------------------------------------------------------
// Chat Health: 7 Kennzahlen (Durchschnitt "pro Nutzer" über ALLE
// registrierten Accounts, wie überall sonst im Dashboard – jemand ohne
// z. B. Gruppenchat zählt mit 0, nicht "fehlt"), + Kohorten-Chart wie
// Retention (Tag 0 = Registrierungstag).
// ---------------------------------------------------------------
function berechneChatHealthKennzahlen() {
  const { accounts, chatMembers, chatTypById, personIdsMitAccount, friendships, expenses } = rohdaten;
  const gesamt = accounts.length;
  if (gesamt === 0) return null;

  // Alle Mitglieder je Einzelchat – status vom chat_member spielt
  // bewusst nirgends in dieser Funktion eine Rolle (auf Wunsch: ob
  // jemand z. B. eine Einladung noch nicht angenommen hat, zählt
  // trotzdem als Chat-Mitgliedschaft).
  const alleMitgliederProEinzelChat = new Map();
  for (const cm of chatMembers) {
    if (chatTypById.get(cm.chat_id) !== 'einzel') continue;
    if (!alleMitgliederProEinzelChat.has(cm.chat_id)) alleMitgliederProEinzelChat.set(cm.chat_id, []);
    alleMitgliederProEinzelChat.get(cm.chat_id).push(cm.person_id);
  }

  const einzelProPerson = new Map();
  const gruppenProPerson = new Map();
  const mitgliederProGruppenChat = new Map();

  for (const cm of chatMembers) {
    const typ = chatTypById.get(cm.chat_id);
    if (typ === 'einzel') {
      einzelProPerson.set(cm.person_id, (einzelProPerson.get(cm.person_id) || 0) + 1);
    } else if (typ === 'gruppe') {
      gruppenProPerson.set(cm.person_id, (gruppenProPerson.get(cm.person_id) || 0) + 1);
      mitgliederProGruppenChat.set(cm.chat_id, (mitgliederProGruppenChat.get(cm.chat_id) || 0) + 1);
    }
  }

  // Schattenchat: Einzelchat, bei dem die GEGENSEITE keinen Account hat
  // (direkt geprüft, nicht über person.status – das ist die genaue vom
  // Nutzer gegebene Definition).
  const schattenchatsProPerson = new Map();
  for (const cm of chatMembers) {
    if (chatTypById.get(cm.chat_id) !== 'einzel') continue;
    const mitglieder = alleMitgliederProEinzelChat.get(cm.chat_id) || [];
    const andere = mitglieder.find((p) => p !== cm.person_id);
    if (andere && !personIdsMitAccount.has(andere)) {
      schattenchatsProPerson.set(cm.person_id, (schattenchatsProPerson.get(cm.person_id) || 0) + 1);
    }
  }

  const entferntProPerson = new Map();
  const blockiertProPerson = new Map();
  for (const f of friendships) {
    if (f.status === 'entfernt') entferntProPerson.set(f.besitzer_person_id, (entferntProPerson.get(f.besitzer_person_id) || 0) + 1);
    if (f.status === 'blockiert') blockiertProPerson.set(f.besitzer_person_id, (blockiertProPerson.get(f.besitzer_person_id) || 0) + 1);
  }

  const avgProNutzer = (map) => accounts.reduce((s, a) => s + (map.get(a.person_id) || 0), 0) / gesamt;

  const gruppenAnzahl = mitgliederProGruppenChat.size;
  const mitgliederProGruppeAvg = gruppenAnzahl
    ? [...mitgliederProGruppenChat.values()].reduce((a, b) => a + b, 0) / gruppenAnzahl
    : 0;

  const forderungGesamt = expenses.length;
  const forderungMitDrop = expenses.filter((e) => e.drop_id).length;
  const forderungMitDropAnteil = forderungGesamt ? forderungMitDrop / forderungGesamt : 0;

  return {
    einzelProNutzer: avgProNutzer(einzelProPerson),
    gruppenProNutzer: avgProNutzer(gruppenProPerson),
    mitgliederProGruppe: mitgliederProGruppeAvg,
    schattenchatsProNutzer: avgProNutzer(schattenchatsProPerson),
    entferntProNutzer: avgProNutzer(entferntProPerson),
    blockiertProNutzer: avgProNutzer(blockiertProPerson),
    forderungMitDropAnteil,
    forderungMitDrop,
    forderungGesamt,
  };
}

function zeigeChatHealthKennzahlen() {
  const k = berechneChatHealthKennzahlen();
  const statusChatHealthEl = document.getElementById('status-chathealth');
  if (!k) {
    statusChatHealthEl.textContent = 'Keine Nutzer vorhanden.';
    statusChatHealthEl.classList.add('error');
    return;
  }
  statusChatHealthEl.classList.remove('error');
  statusChatHealthEl.textContent = 'Daten geladen.';

  document.getElementById('stat-einzelchats-pro-nutzer').textContent = k.einzelProNutzer.toFixed(1);
  document.getElementById('stat-gruppen-pro-nutzer').textContent = k.gruppenProNutzer.toFixed(1);
  document.getElementById('stat-mitglieder-pro-gruppe').textContent = k.mitgliederProGruppe.toFixed(1);
  document.getElementById('stat-schattenchats-pro-nutzer').textContent = k.schattenchatsProNutzer.toFixed(1);
  document.getElementById('stat-entfernte-pro-nutzer').textContent = k.entferntProNutzer.toFixed(1);
  document.getElementById('stat-blockierte-pro-nutzer').textContent = k.blockiertProNutzer.toFixed(1);

  const forderungEl = document.getElementById('stat-forderung-mit-drop');
  forderungEl.textContent = `${Math.round(k.forderungMitDropAnteil * 100)}%`;
  forderungEl.title = `${k.forderungMitDrop} von ${k.forderungGesamt} Forderungen`;
}

const CHATHEALTH_KATEGORIEN = {
  alles: 'Nachrichten', text: 'Text', forderung: 'Forderungen', zahlung: 'Zahlungen',
  erinnerung: 'Erinnerungen', ueberweisung_bestaetigt: 'Bestätigte Überweisungen',
  manuelle_korrektur: 'Manuelle Korrekturen',
};
let chatHealthFilterState = { kategorie: 'alles' };
let chartChatHealth = null;

function berechneChatHealthKohorte() {
  const { chatHealthEvents, tag0ProPerson } = rohdaten;
  const { kategorie } = chatHealthFilterState;
  const heute = tagKey(new Date().toISOString());

  const maxOffsetProPerson = new Map();
  let groessterOffset = 0;
  for (const [personId, tag0] of tag0ProPerson) {
    const offset = tageZwischen(tag0, heute);
    maxOffsetProPerson.set(personId, offset);
    if (offset > groessterOffset) groessterOffset = offset;
  }
  const nutzerInKohorte = new Array(groessterOffset + 1).fill(0);
  for (const offset of maxOffsetProPerson.values()) {
    for (let d = 0; d <= offset; d++) nutzerInKohorte[d]++;
  }

  const summeProTag = new Array(groessterOffset + 1).fill(0);
  for (const e of chatHealthEvents) {
    if (kategorie !== 'alles' && e.kategorie !== kategorie) continue;
    if (!maxOffsetProPerson.has(e.personId)) continue;
    const tag0 = tag0ProPerson.get(e.personId);
    const offset = tageZwischen(tag0, e.tag);
    if (offset < 0 || offset > groessterOffset) continue;
    summeProTag[offset]++;
  }

  const tage = [];
  const proNutzer = [];
  for (let d = 0; d <= groessterOffset; d++) {
    const nenner = nutzerInKohorte[d] || 0;
    tage.push(d);
    proNutzer.push(nenner ? summeProTag[d] / nenner : 0);
  }
  return { tage, proNutzer };
}

function zeichneChatHealthChart() {
  const { tage, proNutzer } = berechneChatHealthKohorte();
  const kategorieLabel = CHATHEALTH_KATEGORIEN[chatHealthFilterState.kategorie];

  if (tage.length === 0) {
    if (chartChatHealth) { chartChatHealth.destroy(); chartChatHealth = null; }
    document.getElementById('table-chathealth').innerHTML = '';
    return;
  }

  const config = {
    type: 'bar',
    data: {
      labels: tage,
      datasets: [{
        data: proNutzer,
        backgroundColor: css('--series-9'),
        borderRadius: 4,
        barPercentage: 0.55,
      }],
    },
    options: gemeinsameOptionen(`${kategorieLabel} / Nutzer`),
  };

  if (chartChatHealth) { chartChatHealth.data = config.data; chartChatHealth.options = config.options; chartChatHealth.update(); }
  else { chartChatHealth = new Chart(document.getElementById('chart-chathealth'), config); }

  baueTable(document.getElementById('table-chathealth'), tage, proNutzer, kategorieLabel);
}

// ---------------------------------------------------------------
// Blatt "finAPI" → Bank Health. Quelle: bank_flow_event
// (dashboard/sql/bank_flow_event.sql + ..._erweitern.sql).
//
// WARUM PRO DURCHLAUF UND NICHT PRO PERSON: Wer abbricht, versucht es
// später wieder. Zählte man pro Person, verschwände genau der erste,
// gescheiterte Anlauf hinter dem späteren Erfolg – und "bis wohin
// gekommen" beantwortete die Frage nicht mehr.
//
// Einen Durchlauf gibt es in der Tabelle nicht als Spalte; er wird aus
// dem Ereignisstrom je Person abgegrenzt: Jedes 'gestartet' öffnet einen
// neuen Durchlauf, alles danach gehört dazu, bis das nächste 'gestartet'
// kommt. Ereignisse ohne vorangehendes 'gestartet' (App-Neustart mitten
// im Ablauf, Zeile aus einer älteren Fassung) bilden einen eigenen
// Durchlauf, damit sie nicht stillschweigend verloren gehen.
//
// bank_getrennt gehört zu KEINEM Durchlauf: Getrennt wird in den
// Konto-Einstellungen, oft Wochen später. Es wird allein über seinen
// flow dem Ablauf zugeordnet, der die Verbindung hergestellt hat.
// ---------------------------------------------------------------

// Die Stufen in der Reihenfolge, in der der Nutzer sie erlebt. Der Index
// ist die Rangfolge für "am weitesten gekommen".
// Reihenfolge der Screens im Ablauf (screens/BankVerbindenScreen.tsx).
// 'fehler' ist kein Schritt nach vorne und steht deshalb nicht hier,
// sondern in der Kachel "Durchläufe mit Verbindungsfehler".
const BANK_STUFEN_GEMEINSAM = [
  { key: 'gestartet', label: 'Ablauf geöffnet' },
  { key: 'vorspann', label: '„Das brauchst du“ gesehen' },
  { key: 'bank_auswahl', label: 'Bankauswahl geöffnet' },
  { key: 'bank_gewaehlt', label: 'Bank gewählt' },
  { key: 'bank_formular', label: 'Formular der Bank geöffnet' },
  { key: 'konto_wahl', label: 'Kontowahl gesehen' },
  { key: 'bank_verbunden', label: 'Bank verbunden' },
  { key: 'erfolg', label: 'Erfolgsbildschirm gesehen' },
];
const BANK_STUFEN = {
  registrieren_teil_2: [
    ...BANK_STUFEN_GEMEINSAM,
    // Nur mit Feed (FEED_AKTIV) – ohne Ereignisse blendet berechneBankHealth sie aus.
    { key: 'drop_schritt_1', label: 'Drop 1: Was ist ein Drop?' },
    { key: 'drop_schritt_2', label: 'Drop 2: Was darf Drop werden?' },
    { key: 'drop_schritt_3', label: 'Drop 3: Wer darf sie sehen?' },
    { key: 'beendet', label: 'Ablauf abgeschlossen' },
  ],
  reauthentifizieren: [...BANK_STUFEN_GEMEINSAM, { key: 'beendet', label: 'Ablauf abgeschlossen' }],
};

let chartBankTageTeil2 = null;
let chartBankScreensTeil2 = null;
let chartBankTageReauth = null;
let chartBankScreensReauth = null;

/** Ereignisse je Person zeitlich sortiert in Durchläufe schneiden. */
function bankDurchlaeufe(events) {
  const proPerson = new Map();
  for (const e of events) {
    if (e.event_name === 'bank_getrennt') continue; // gehört zu keinem Durchlauf
    if (!proPerson.has(e.person_id)) proPerson.set(e.person_id, []);
    proPerson.get(e.person_id).push(e);
  }

  const durchlaeufe = [];
  for (const [personId, liste] of proPerson) {
    liste.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    let aktuell = null;
    for (const e of liste) {
      if (e.event_name === 'gestartet' || aktuell === null) {
        aktuell = {
          personId,
          flow: e.flow,
          ausloeser: e.ausloeser || null,
          beginn: e.created_at,
          stufen: new Set(),
        };
        durchlaeufe.push(aktuell);
      }
      // Der flow eines Durchlaufs steht mit 'gestartet' fest; spätere
      // Zeilen tragen denselben Wert, ein Abgleich ist nicht nötig.
      aktuell.stufen.add(e.event_name);
    }
  }
  return durchlaeufe;
}

function berechneBankHealth() {
  const { bankFlowEvents } = rohdaten;
  const durchlaeufe = bankDurchlaeufe(bankFlowEvents);

  // Drop-Schritte gibt es nur mit Feed: ohne ein einziges solches
  // Ereignis stünden sie immer auf 0 und verwirrten nur.
  const vorkommend = new Set(bankFlowEvents.map((e) => e.event_name));
  const proFlow = {};
  for (const flow of ['registrieren_teil_2', 'reauthentifizieren']) {
    const stufen = BANK_STUFEN[flow].filter((st) => !st.key.startsWith('drop_schritt') || vorkommend.has(st.key));
    const eigene = durchlaeufe.filter((d) => d.flow === flow);

    // "Bis wohin gekommen": je Durchlauf die weiteste erreichte Stufe.
    //
    // gezaehlt ist der Nenner für die Anteile und bewusst NICHT
    // eigene.length: Ein Durchlauf, dessen einziges Ereignis nicht in der
    // Stufenliste steht (etwa nur 'bank_abgebrochen', weil das
    // 'gestartet' davor nicht durchkam), hat keine weiteste Stufe. Mit
    // eigene.length als Nenner summierten die Anteile dann nicht auf
    // 100 %, und niemand fände den Grund.
    const weiteste = new Array(stufen.length).fill(0);
    let gezaehlt = 0;
    for (const d of eigene) {
      let index = -1;
      stufen.forEach((stufe, i) => {
        if (d.stufen.has(stufe.key)) index = Math.max(index, i);
      });
      if (index < 0) continue;
      weiteste[index]++;
      gezaehlt += 1;
    }

    // Tagesreihen: verbunden aus den Durchläufen, getrennt direkt aus den
    // Ereignissen (siehe Kommentar oben).
    const verbundenProTag = new Map();
    for (const e of bankFlowEvents) {
      if (e.flow !== flow) continue;
      if (e.event_name !== 'bank_verbunden') continue;
      const tag = tagKey(e.created_at);
      verbundenProTag.set(tag, (verbundenProTag.get(tag) || 0) + 1);
    }
    const getrenntProTag = new Map();
    for (const e of bankFlowEvents) {
      if (e.flow !== flow) continue;
      if (e.event_name !== 'bank_getrennt') continue;
      const tag = tagKey(e.created_at);
      getrenntProTag.set(tag, (getrenntProTag.get(tag) || 0) + 1);
    }

    const tage = Array.from(new Set([...verbundenProTag.keys(), ...getrenntProTag.keys()])).sort();
    proFlow[flow] = {
      durchlaeufe: gezaehlt,
      // Nur fürs Statusband: wie viele Durchläufe es überhaupt gab.
      durchlaeufeRoh: eigene.length,
      stufen,
      weiteste,
      tage,
      verbunden: tage.map((t) => verbundenProTag.get(t) || 0),
      getrennt: tage.map((t) => getrenntProTag.get(t) || 0),
      verbundenGesamt: Array.from(verbundenProTag.values()).reduce((a, b) => a + b, 0),
      getrenntGesamt: Array.from(getrenntProTag.values()).reduce((a, b) => a + b, 0),
    };
  }

  // Getrennt, ohne dass der Ursprungs-Ablauf feststellbar war (Verbindung
  // älter als dieses Tracking oder auf einem anderen Gerät entstanden).
  const getrenntUnbekannt = bankFlowEvents.filter(
    (e) => e.event_name === 'bank_getrennt' && e.flow === 'unbekannt',
  ).length;

  // Verbindungsfehler: Durchläufe mit mind. einem Fehlerbild, plus welche.
  const mitFehler = durchlaeufe.filter((d) => d.stufen.has('fehler')).length;
  const fehlerArten = new Map();
  for (const e of bankFlowEvents) {
    if (e.event_name !== 'fehler') continue;
    const art = e.detail || 'unbekannt';
    fehlerArten.set(art, (fehlerArten.get(art) || 0) + 1);
  }

  return { proFlow, getrenntUnbekannt, durchlaeufeGesamt: durchlaeufe.length, mitFehler, fehlerArten };
}

/** Zwei Balkenreihen pro Tag: verbunden und getrennt. */
function zeichneBankTage(canvasId, tabellenId, daten, altesChart) {
  const tabelle = document.getElementById(tabellenId);
  if (daten.tage.length === 0) {
    if (altesChart) altesChart.destroy();
    if (tabelle) tabelle.innerHTML = '<p style="color:var(--text-muted);font-size:12.5px;">Keine Daten.</p>';
    return null;
  }

  const optionen = gemeinsameOptionen('Bankverbindungen', 'Tag');
  // Zwei Reihen -> Legende an, und der Titel im Tooltip ist ein Datum,
  // nicht "Tag N" wie bei den Kohorten-Charts.
  optionen.plugins.legend = { display: true, labels: { color: css('--text-muted'), font: { size: 11 } } };
  optionen.plugins.tooltip.callbacks = { title: (items) => items[0].label };

  const config = {
    type: 'bar',
    data: {
      labels: daten.tage,
      datasets: [
        { label: 'Neu verbunden', data: daten.verbunden, backgroundColor: css('--series-7'), borderRadius: 4, barPercentage: 0.7 },
        { label: 'Getrennt', data: daten.getrennt, backgroundColor: css('--series-12'), borderRadius: 4, barPercentage: 0.7 },
      ],
    },
    options: optionen,
  };

  if (altesChart) altesChart.destroy();
  const neu = new Chart(document.getElementById(canvasId), config);

  if (tabelle) {
    const zeilen = daten.tage
      .map((t, i) => `<tr><td>${t}</td><td>${daten.verbunden[i]}</td><td>${daten.getrennt[i]}</td></tr>`)
      .join('');
    tabelle.innerHTML = `<table><thead><tr><th>Tag</th><th>Neu verbunden</th><th>Getrennt</th></tr></thead><tbody>${zeilen}</tbody></table>`;
  }
  return neu;
}

/** Waagerechte Balken: wie viele Durchläufe endeten auf welcher Stufe? */
function zeichneBankScreens(canvasId, tabellenId, daten, altesChart) {
  const tabelle = document.getElementById(tabellenId);
  if (daten.durchlaeufe === 0) {
    if (altesChart) altesChart.destroy();
    if (tabelle) tabelle.innerHTML = '<p style="color:var(--text-muted);font-size:12.5px;">Keine Daten.</p>';
    return null;
  }

  const anteile = daten.weiteste.map((n) => (daten.durchlaeufe ? n / daten.durchlaeufe : 0));
  const direktLabelPlugin = {
    id: 'direktLabelBank' + canvasId,
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const labels = chart.data.datasets[0].direktLabels || [];
      ctx.save();
      ctx.fillStyle = css('--text-primary');
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      meta.data.forEach((bar, i) => ctx.fillText(labels[i] ?? '', bar.x + 8, bar.y));
      ctx.restore();
    },
  };

  const config = {
    type: 'bar',
    data: {
      labels: daten.stufen.map((st) => st.label),
      datasets: [{
        data: daten.weiteste,
        direktLabels: daten.weiteste.map((n, i) => `${n} (${Math.round(anteile[i] * 100)}%)`),
        backgroundColor: css('--series-7'),
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 70 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css('--surface-1'),
          titleColor: css('--text-muted'),
          bodyColor: css('--text-primary'),
          bodyFont: { weight: 'bold' },
          borderColor: css('--border'),
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (item) =>
              `${item.raw} Durchläufe endeten hier (${Math.round(anteile[item.dataIndex] * 100)}% aller Durchläufe)`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: 'Durchläufe, die hier endeten', color: css('--text-muted'), font: { size: 11 } },
          grid: { color: css('--gridline') },
          ticks: { color: css('--text-muted'), font: { size: 11 }, precision: 0 },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: css('--text-primary'), font: { size: 12 } },
          border: { color: css('--baseline') },
        },
      },
    },
    plugins: [direktLabelPlugin],
  };

  if (altesChart) altesChart.destroy();
  const neu = new Chart(document.getElementById(canvasId), config);

  if (tabelle) {
    const zeilen = daten.stufen
      .map((st, i) => `<tr><td>${st.label}</td><td>${daten.weiteste[i]}</td><td>${Math.round(anteile[i] * 100)}%</td></tr>`)
      .join('');
    tabelle.innerHTML = `<table><thead><tr><th>Weitester Screen</th><th>Durchläufe</th><th>Anteil</th></tr></thead><tbody>${zeilen}</tbody></table>`;
  }
  return neu;
}

function zeichneBankHealth() {
  const { proFlow, getrenntUnbekannt, durchlaeufeGesamt, mitFehler, fehlerArten } = berechneBankHealth();
  const teil2 = proFlow.registrieren_teil_2;
  const reauth = proFlow.reauthentifizieren;
  const statusEl = document.getElementById('status-bankhealth');

  // Kennzahlen
  const { bankConnections } = rohdaten;
  const aktiv = bankConnections.filter((bc) => bc.status === 'aktiv').length;
  const setze = (id, wert, titel) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = wert;
    if (titel) el.title = titel;
  };
  setze('stat-bank-aktiv', String(aktiv));
  setze('stat-bank-neu-teil2', String(teil2.verbundenGesamt));
  setze('stat-bank-getrennt-teil2', String(teil2.getrenntGesamt));
  setze('stat-bank-neu-reauth', String(reauth.verbundenGesamt));
  setze('stat-bank-getrennt-reauth', String(reauth.getrenntGesamt));
  // Abschlussquote von Teil 2: Durchläufe, die eine Bank erreicht haben,
  // geteilt durch alle gezählten Durchläufe. "Erreicht" heisst: weiteste
  // Stufe ist bank_verbunden ODER eine der Stufen danach.
  const indexVerbunden = teil2.stufen.findIndex((st) => st.key === 'bank_verbunden');
  const mitBank = teil2.weiteste.reduce(
    (summe, anzahl, i) => (i >= indexVerbunden ? summe + anzahl : summe),
    0,
  );
  setze(
    'stat-bank-fehler',
    durchlaeufeGesamt ? `${Math.round((mitFehler / durchlaeufeGesamt) * 100)}%` : '–',
    fehlerArten.size
      ? [...fehlerArten].sort((a, b) => b[1] - a[1]).map(([art, n]) => `${n}× ${art}`).join('\n')
      : 'Noch keine Fehler erfasst',
  );
  setze(
    'stat-bank-abschluss-teil2',
    teil2.durchlaeufe ? `${Math.round((mitBank / teil2.durchlaeufe) * 100)}%` : '–',
    `${mitBank} von ${teil2.durchlaeufe} Durchläufen`,
  );

  if (durchlaeufeGesamt === 0) {
    statusEl.textContent = 'Noch keine Durchläufe erfasst. Die Tabelle bank_flow_event füllt sich, sobald der Bank-Ablauf in der App benutzt wird.';
    statusEl.classList.add('error');
  } else {
    statusEl.classList.remove('error');
    statusEl.textContent =
      `${durchlaeufeGesamt} Durchläufe · Registrierung Teil 2: ${teil2.durchlaeufe} ` +
      `(${teil2.verbundenGesamt} verbunden, ${teil2.getrenntGesamt} getrennt) · ` +
      `Reauthentifizieren: ${reauth.durchlaeufe} ` +
      `(${reauth.verbundenGesamt} verbunden, ${reauth.getrenntGesamt} getrennt)`;
  }

  chartBankTageTeil2 = zeichneBankTage('chart-bank-tage-teil2', 'table-bank-tage-teil2', teil2, chartBankTageTeil2);
  chartBankScreensTeil2 = zeichneBankScreens('chart-bank-screens-teil2', 'table-bank-screens-teil2', teil2, chartBankScreensTeil2);
  chartBankTageReauth = zeichneBankTage('chart-bank-tage-reauth', 'table-bank-tage-reauth', reauth, chartBankTageReauth);
  chartBankScreensReauth = zeichneBankScreens('chart-bank-screens-reauth', 'table-bank-screens-reauth', reauth, chartBankScreensReauth);

  // Nicht zuordenbare Trennungen offen ausweisen, statt sie einem der
  // beiden Abläufe zuzuschlagen.
  const hinweis = document.getElementById('bank-unbekannt-hinweis');
  if (hinweis) {
    if (getrenntUnbekannt > 0) {
      hinweis.hidden = false;
      hinweis.textContent =
        `Zusätzlich ${getrenntUnbekannt} getrennte Verbindung(en) ohne zuordenbaren Ursprungs-Ablauf – ` +
        'entstanden, bevor dieses Tracking lief, oder auf einem anderen Gerät. Bewusst keinem der beiden Abläufe zugerechnet.';
    } else {
      hinweis.hidden = true;
      hinweis.textContent = '';
    }
  }
}

// ── 06 Drops & Eingänge ────────────────────────────────────────────────
let chartDropsKategorien = null;
let chartEingangZuordnung = null;

const prozent = (teil, basis) => (basis ? Math.round((teil / basis) * 100) : 0);

function berechneDropHealth() {
  const { drops, eingaenge, kategorieNamen } = rohdaten;
  const aktiv = drops.filter((d) => d.status !== 'geloescht');
  const sichtbar = aktiv.filter((d) => d.sichtbar);
  const nutzerMitDrops = new Set(aktiv.map((d) => d.accountId));

  const proKategorie = new Map();
  for (const d of aktiv) {
    const name = d.categoryId ? kategorieNamen.get(d.categoryId) || 'Unbekannt' : 'Ohne Kategorie';
    proKategorie.set(name, (proKategorie.get(name) || 0) + 1);
  }
  const kategorien = [...proKategorie]
    .map(([label, wert]) => ({ label, wert }))
    .sort((a, b) => b.wert - a.wert)
    .slice(0, 8);

  const eingangAktiv = eingaenge.filter((e) => e.status !== 'geloescht');
  const zuordnung = [['offen', 'Offen'], ['zugeordnet', 'Zugeordnet'], ['ignoriert', 'Ignoriert']]
    .map(([key, label]) => ({ label, wert: eingangAktiv.filter((e) => e.match_status === key).length }));
  const nutzerMitEingang = new Set(eingangAktiv.map((e) => e.account_id));

  return {
    drops, aktiv, sichtbar, nutzerMitDrops, kategorien,
    eingangAktiv, zuordnung, nutzerMitEingang,
  };
}

// Waagrechte Balken mit "Anzahl (Anteil)" direkt daneben – wie Bank Health.
function zeichneAnteilBalken(canvasId, tabellenId, eintraege, basis, achsenText, altesChart) {
  const tabelle = document.getElementById(tabellenId);
  if (altesChart) altesChart.destroy();
  if (!basis) {
    if (tabelle) tabelle.innerHTML = '<p style="color:var(--text-muted);font-size:12.5px;">Keine Daten.</p>';
    return null;
  }
  const direktLabelPlugin = {
    id: 'direktLabel' + canvasId,
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.fillStyle = css('--text-primary');
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      meta.data.forEach((bar, i) => ctx.fillText(`${eintraege[i].wert} (${prozent(eintraege[i].wert, basis)}%)`, bar.x + 8, bar.y));
      ctx.restore();
    },
  };
  const config = {
    type: 'bar',
    data: {
      labels: eintraege.map((e) => e.label),
      datasets: [{
        data: eintraege.map((e) => e.wert),
        backgroundColor: css('--series-8'),
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 80 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css('--surface-1'),
          titleColor: css('--text-muted'),
          bodyColor: css('--text-primary'),
          bodyFont: { weight: 'bold' },
          borderColor: css('--border'),
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: { label: (item) => `${item.raw} von ${basis} (${prozent(item.raw, basis)}%)` },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: achsenText, color: css('--text-muted'), font: { size: 11 } },
          grid: { color: css('--gridline') },
          ticks: { color: css('--text-muted'), font: { size: 11 }, precision: 0 },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: css('--text-primary'), font: { size: 12 } },
          border: { color: css('--baseline') },
        },
      },
    },
    plugins: [direktLabelPlugin],
  };
  const neu = new Chart(document.getElementById(canvasId), config);
  if (tabelle) {
    const zeilen = eintraege
      .map((e) => `<tr><td>${e.label}</td><td>${e.wert}</td><td>${prozent(e.wert, basis)}%</td></tr>`)
      .join('');
    tabelle.innerHTML = `<table><thead><tr><th></th><th>Anzahl</th><th>Anteil (von ${basis})</th></tr></thead><tbody>${zeilen}</tbody></table>`;
  }
  return neu;
}

function zeichneDropHealth() {
  const d = berechneDropHealth();
  const statusEl = document.getElementById('status-drops');
  const setze = (id, wert, titel) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = wert;
    if (titel) el.title = titel;
  };
  const pct = (teil, basis) => (basis ? `${prozent(teil, basis)}%` : '–');

  setze('stat-drops-gesamt', String(d.aktiv.length));
  setze('stat-drops-pro-nutzer', d.nutzerMitDrops.size ? (d.aktiv.length / d.nutzerMitDrops.size).toFixed(1) : '–');
  const mitHaendler = d.aktiv.filter((x) => x.hatHaendler).length;
  setze('stat-drops-haendler', pct(mitHaendler, d.aktiv.length), `${mitHaendler} von ${d.aktiv.length}`);
  const geloescht = d.drops.length - d.aktiv.length;
  setze('stat-drops-geloescht', pct(geloescht, d.drops.length), `${geloescht} von ${d.drops.length}`);

  setze('stat-eingang-gesamt', String(d.eingangAktiv.length));
  const eingangMitAbsender = d.eingangAktiv.filter((e) => e.merchant_id).length;
  setze('stat-eingang-haendler', pct(eingangMitAbsender, d.eingangAktiv.length), `${eingangMitAbsender} von ${d.eingangAktiv.length}`);
  setze('stat-eingang-pro-nutzer', d.nutzerMitEingang.size ? (d.eingangAktiv.length / d.nutzerMitEingang.size).toFixed(1) : '–');

  if (d.drops.length === 0) {
    statusEl.textContent = 'Noch keine Drops. Sie entstehen, sobald jemand seine Bank verbindet.';
    statusEl.classList.add('error');
  } else {
    statusEl.classList.remove('error');
    statusEl.textContent =
      `${d.aktiv.length} Drops von ${d.nutzerMitDrops.size} Nutzern (${d.sichtbar.length} sichtbar) · ` +
      `${d.eingangAktiv.length} Eingänge von ${d.nutzerMitEingang.size} Nutzern`;
  }

  chartDropsKategorien = zeichneAnteilBalken('chart-drops-kategorien', 'table-drops-kategorien', d.kategorien, d.aktiv.length, 'Drops', chartDropsKategorien);
  chartEingangZuordnung = zeichneAnteilBalken('chart-eingang-zuordnung', 'table-eingang-zuordnung', d.zuordnung, d.eingangAktiv.length, 'Eingänge', chartEingangZuordnung);
}

// ---------------------------------------------------------------
// Bonusprogramm → Signale: Wann könnte der Bonus aus? Alles aus rohdaten
// (Metrik-Daten). Signale 1, 2 und 4 schauen auf die letzten 2 Tage, damit
// sich schnell entscheiden lässt; Signal 3 braucht 4 Wochen Abstand.
// ---------------------------------------------------------------
function zeichneBonusSignale() {
  if (!rohdaten) return;
  const { accounts, quelleProPerson, bankConnectionAn, screenBesuche, universitaetProPerson, kontakteBeiRegistrierung } = rohdaten;
  const jetzt = Date.now();
  const TAG = 86400000;
  const alterTage = (iso) => (jetzt - new Date(iso).getTime()) / TAG;
  const pct = (teil, ganz) => (ganz ? `${prozent(teil, ganz)}%` : '–');
  const setze = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  // 1 · Neuanmeldungen ohne Bonus
  const aktiviert = accounts.filter((a) => a.created_at && bankConnectionAn.get(a.person_id));
  const fenster = (von, bis) => aktiviert.filter((a) => alterTage(a.created_at) >= von && alterTage(a.created_at) < bis);
  const jetzt4 = fenster(0, 2);
  const vorher4 = fenster(2, 4);
  const ohneBonus = (liste) => liste.filter((a) => quelleProPerson.get(a.person_id) !== 'bonus').length;
  setze('sig-ohne-bonus', pct(ohneBonus(jetzt4), jetzt4.length));
  setze('sig-ohne-bonus-label', `kamen nicht über eine Bonusgruppe (letzte 2 Tage, ${ohneBonus(jetzt4)} von ${jetzt4.length})`);
  setze('sig-ohne-bonus-vorher', pct(ohneBonus(vorher4), vorher4.length));
  const QUELLEN = [['bonus', 'Bonusgruppe'], ['promoter', 'Promoter'], ['schattengruppe', 'Schattengruppe'], ['schattenchat', 'Schattenchat'], ['sonstiges', 'Sonstiges']];
  const anzahl = (liste, q) => liste.filter((a) => (quelleProPerson.get(a.person_id) || 'sonstiges') === q).length;
  document.getElementById('sig-quellen').innerHTML = `<thead><tr><th>Quelle</th><th>letzte 2 Tage</th><th>2 Tage davor</th></tr></thead><tbody>${
    QUELLEN.map(([q, label]) => `<tr><td>${label}</td><td>${anzahl(jetzt4, q)} (${pct(anzahl(jetzt4, q), jetzt4.length)})</td><td>${anzahl(vorher4, q)} (${pct(anzahl(vorher4, q), vorher4.length)})</td></tr>`).join('')
  }</tbody>`;

  // 2 · Neue Nutzer finden Freunde vor
  const gemessen = (kontakteBeiRegistrierung || []).filter((z) => alterTage(z.erfasst_am) < 2);
  const mind1 = gemessen.filter((z) => z.anzahl >= 1).length;
  setze('sig-vorfinden', gemessen.length ? pct(mind1, gemessen.length) : '–');
  setze('sig-vorfinden-label', gemessen.length
    ? `finden mindestens 1 Kontakt vor (letzte 2 Tage, ${mind1} von ${gemessen.length})`
    : 'finden mindestens 1 Kontakt vor – noch keine Messung');

  // 3 · Aktiv in Woche 4 (Tag 22–28 nach der Registrierung)
  const besuche = new Map();
  for (const b of screenBesuche || []) {
    if (!b.geoeffnet_am) continue;
    if (!besuche.has(b.person_id)) besuche.set(b.person_id, []);
    besuche.get(b.person_id).push(new Date(b.geoeffnet_am).getTime());
  }
  const altGenug = accounts.filter((a) => a.created_at && alterTage(a.created_at) >= 28);
  const inWoche4 = (a) => {
    const start = new Date(a.created_at).getTime();
    return (besuche.get(a.person_id) || []).some((t) => t >= start + 21 * TAG && t < start + 28 * TAG);
  };
  const bonusKohorte = altGenug.filter((a) => quelleProPerson.get(a.person_id) === 'bonus');
  const andere = altGenug.filter((a) => quelleProPerson.get(a.person_id) !== 'bonus');
  const aktivBonus = bonusKohorte.filter(inWoche4).length;
  const aktivAndere = andere.filter(inWoche4).length;
  setze('sig-aktiv-bonus', pct(aktivBonus, bonusKohorte.length));
  setze('sig-aktiv-bonus-label', `Bonusgruppe: in Woche 4 aktiv (${aktivBonus} von ${bonusKohorte.length})`);
  setze('sig-aktiv-organisch', pct(aktivAndere, andere.length));
  setze('sig-aktiv-organisch-label', `alle anderen: in Woche 4 aktiv (${aktivAndere} von ${andere.length})`);

  // 4 · WU-Durchdringung
  const wu = accounts.filter((a) => (universitaetProPerson.get(a.person_id) || '').toLowerCase().startsWith('wu'));
  setze('sig-wu', wu.length);
  setze('sig-wu-bank', pct(wu.filter((a) => bankConnectionAn.get(a.person_id)).length, wu.length));
  setze('sig-wu-neu', wu.filter((a) => a.created_at && alterTage(a.created_at) < 2).length);

  const status = document.getElementById('sig-status');
  status.classList.remove('error');
  status.textContent = `Stand ${datumWien(new Date().toISOString())} · aus den Metrik-Daten`;
}

// 03 Internes Marketing → Gesamt: Kontakte mit Konto beim Registrieren.
// Basis: Neuanmeldungen seit Messbeginn (erste Zeile). Ohne Zeile = kein
// Kontaktabgleich (Kontakte nicht freigegeben) – zählt nicht in die Anteile.
let chartVorfinden = null;
function zeichneFreundeVorfinden() {
  const statusEl = document.getElementById('status-vorfinden');
  const zeilen = rohdaten.kontakteBeiRegistrierung;
  if (zeilen.length === 0) {
    statusEl.textContent = 'Noch keine Daten: dashboard/sql/kontakte_bei_registrierung.sql ausführen und kontakt-abgleich neu deployen – gezählt wird ab dann.';
    statusEl.classList.add('error');
    return;
  }
  const start = zeilen.map((z) => z.erfasst_am).sort()[0];
  const gemessen = new Set(zeilen.map((z) => z.person_id));
  const seitStart = rohdaten.accounts.filter((a) => a.created_at && a.created_at >= start);
  const ohne = seitStart.filter((a) => !gemessen.has(a.person_id)).length;
  const stufen = [0, 1, 2, 3, 4, 5];
  const eintraege = stufen.map((n) => ({
    label: n === 5 ? '5+ Kontakte' : `${n} ${n === 1 ? 'Kontakt' : 'Kontakte'}`,
    wert: zeilen.filter((z) => (n === 5 ? z.anzahl >= 5 : z.anzahl === n)).length,
  }));
  const mind1 = zeilen.filter((z) => z.anzahl >= 1).length;
  document.getElementById('stat-vorfinden-mind1').textContent = `${prozent(mind1, zeilen.length)}%`;
  document.getElementById('stat-vorfinden-mind1-label').textContent = `finden mindestens 1 Kontakt in der App vor (${mind1} von ${zeilen.length})`;
  document.getElementById('stat-vorfinden-gemessen').textContent = zeilen.length;
  document.getElementById('stat-vorfinden-ohne').textContent = ohne;
  statusEl.classList.remove('error');
  statusEl.textContent = `Gemessen seit ${datumWien(start)} · Anteile an den gemessenen Neuanmeldungen`;
  chartVorfinden = zeichneAnteilBalken('chart-vorfinden', 'table-vorfinden', eintraege, zeilen.length, 'Neuanmeldungen', chartVorfinden);
}

function zeichneAlleChartsNeu() {
  if (!rohdaten) return;
  zeichneCharts();
  zeichneWachstumChart();
  zeichneOrganischChart();
  zeichneEinladungenChart();
  zeichneOnboardingFunnel();
  zeichneChatHealthChart();
  zeichneBankHealth();
  zeichneDropHealth();
  zeichneGruppenChart();
  zeichneFreundeVorfinden();
  zeichneBonusSignale();
  zeichneKostenChart();
  zeichneBonusCharts();
}

function aktualisiereChartGroessen() {
  [
    chartOeffnungen, chartMinuten, chartWachstum, chartOrganisch,
    chartOnboarding, chartChatHealth,
    chartEinladungen, chartVorfinden,
    chartGruppen, chartKosten, chartBonTage, chartBonGroesse,
    // Bank Health liegt im Blatt "finAPI", das beim Laden versteckt ist.
    chartBankTageTeil2, chartBankScreensTeil2, chartBankTageReauth, chartBankScreensReauth,
    chartDropsKategorien, chartEingangZuordnung,
  ].filter(Boolean).forEach((chart) => chart.resize());
}

// Reihenfolge wie in der Seitenleiste. "metriken" hat keine eigene Seite:
// Dort zeigt das Blatt immer genau eine Metrik (01–07).
const BLAETTER = ['overview', 'metriken', 'bonus', 'finapi', 'support', 'einstellungen'];
const ERSTE_METRIK = 'retention';

function zielAusHash() {
  const hash = location.hash.replace(/^#/, '');
  if (hash === 'metriken') return { blatt: 'metriken', metrik: ERSTE_METRIK };
  if (BLAETTER.includes(hash)) return { blatt: hash };
  const ziel = hash ? document.getElementById(hash) : null;
  const blatt = ziel?.closest('[data-dashboard-sheet]')?.dataset.dashboardSheet;
  if (blatt === 'metriken') return { blatt, metrik: ziel.closest('.dashboard-section')?.id ?? ERSTE_METRIK };
  return { blatt: blatt ?? 'overview' };
}

function setzeMetrikenListe(offen) {
  document.getElementById('metriken-liste').hidden = !offen;
  document.getElementById('tab-metriken').setAttribute('aria-expanded', String(offen));
}

function setzeSeitenleiste(offen) {
  document.getElementById('seitenleiste').classList.toggle('offen', offen);
  document.getElementById('seiten-schleier').hidden = !offen;
  document.getElementById('menue-oeffnen').setAttribute('aria-expanded', String(offen));
}

function setzeAktivesBlatt(name, { metrik = ERSTE_METRIK, updateUrl = true } = {}) {
  const aktivesBlatt = BLAETTER.includes(name) ? name : 'overview';
  const istMetrik = aktivesBlatt === 'metriken';
  const adresse = istMetrik ? metrik : aktivesBlatt;

  document.querySelectorAll('[data-dashboard-tab]').forEach((tab) => {
    const aktiv = tab.dataset.dashboardTab === aktivesBlatt;
    tab.classList.toggle('active', aktiv);
    if (aktiv) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  document.getElementById('tab-metriken').classList.toggle('active', istMetrik);
  document.querySelectorAll('[data-dashboard-metrik]').forEach((link) => {
    const aktiv = istMetrik && link.dataset.dashboardMetrik === metrik;
    link.classList.toggle('active', aktiv);
    if (aktiv) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (istMetrik) setzeMetrikenListe(true);

  document.querySelectorAll('[data-dashboard-sheet]').forEach((sheet) => {
    const aktiv = sheet.dataset.dashboardSheet === aktivesBlatt;
    sheet.hidden = !aktiv;
    sheet.classList.toggle('active', aktiv);
  });
  document.querySelectorAll('[data-dashboard-sheet="metriken"] > .dashboard-section').forEach((section) => {
    section.hidden = section.id !== metrik;
  });

  const aktiverLink = document.querySelector('.seiten-nav [aria-current="page"] .seiten-name');
  document.getElementById('handy-titel').textContent = aktiverLink?.textContent ?? '';
  setzeSeitenleiste(false);

  if (updateUrl && location.hash !== `#${adresse}`) {
    history.pushState(null, '', `#${adresse}`);
  }

  requestAnimationFrame(() => {
    aktualisiereChartGroessen();
    const hash = location.hash.replace(/^#/, '');
    const ziel = hash && hash !== adresse ? document.getElementById(hash) : null;
    if (ziel?.closest('[data-dashboard-sheet]')?.dataset.dashboardSheet === aktivesBlatt) {
      ziel.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  });
}

function initialisiereBlaetter() {
  document.querySelectorAll('[data-dashboard-tab]').forEach((tab) => {
    tab.addEventListener('click', () => setzeAktivesBlatt(tab.dataset.dashboardTab));
  });
  document.querySelectorAll('[data-dashboard-metrik]').forEach((link) => {
    link.addEventListener('click', () => setzeAktivesBlatt('metriken', { metrik: link.dataset.dashboardMetrik }));
  });

  // "Metriken" klappt nur die Liste auf und zu, die Seite wechselt erst die Auswahl.
  document.getElementById('tab-metriken').addEventListener('click', () => {
    setzeMetrikenListe(document.getElementById('metriken-liste').hidden);
  });

  document.getElementById('menue-oeffnen').addEventListener('click', () => setzeSeitenleiste(true));
  document.getElementById('seiten-schleier').addEventListener('click', () => setzeSeitenleiste(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setzeSeitenleiste(false);
  });

  const zuHash = () => {
    const { blatt, metrik } = zielAusHash();
    setzeAktivesBlatt(blatt, { metrik, updateUrl: false });
  };
  zuHash();
  window.addEventListener('hashchange', zuHash);
  window.addEventListener('popstate', zuHash);
}

function aktualisiereThemeButtons() {
  document.querySelectorAll('#theme-control button').forEach((button) => {
    button.classList.toggle('active', button.dataset.themeValue === themeState);
  });
}

function setzeTheme(wert) {
  themeState = ['system', 'light', 'dark'].includes(wert) ? wert : 'system';
  aktualisiereThemeAttribute();
  localStorage.setItem(THEME_STORAGE_KEY, themeState);
  aktualisiereThemeButtons();
  zeichneAlleChartsNeu();
}

function initialisiereEinstellungen() {
  aktualisiereThemeButtons();
  document.getElementById('theme-control').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    setzeTheme(button.dataset.themeValue);
  });
  document.getElementById('settings-reload').addEventListener('click', async () => {
    const button = document.getElementById('settings-reload');
    const status = document.getElementById('settings-reload-status');
    button.disabled = true;
    status.textContent = 'Lade Supabase-Daten neu…';
    try {
      const res = await dashboardFetch('/reload-data', { method: 'POST' });
      const antwort = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(antwort.error || String(res.status));
      status.textContent = 'Daten neu geladen. Aktualisiere Ansicht…';
      location.reload();
    } catch (err) {
      console.error('Daten konnten nicht neu geladen werden:', err);
      status.textContent = `Fehler beim Neuladen: ${err.message}`;
      button.disabled = false;
    }
  });
}

// Wartungsarbeiten-Schalter: schreibt über dashboard_setze_wartungsmodus
// nach app_config, die App bekommt die Änderung per Supabase Realtime
// sofort mit (siehe lib/wartungsmodus.ts) – kein Server-Neustart hier
// nötig, nur beim allerersten Laden der Seite wird der Startwert gesetzt.
function initialisiereWartungsmodusSchalter(appConfig) {
  const checkbox = document.getElementById('settings-wartungsmodus');
  const label = document.getElementById('settings-wartungsmodus-label');
  const status = document.getElementById('settings-wartungsmodus-status');
  if (!checkbox) return;

  function zeigeZustand(aktiv) {
    checkbox.checked = aktiv;
    label.textContent = aktiv ? 'An' : 'Aus';
    status.textContent = aktiv
      ? 'Wartungsmodus ist AKTIV – Nutzer:innen sehen nur den Wartungs-Screen.'
      : 'Wartungsmodus ist aus.';
  }

  zeigeZustand(Boolean(appConfig.wartungsmodus));

  checkbox.addEventListener('change', async () => {
    const aktiv = checkbox.checked;
    checkbox.disabled = true;
    status.textContent = 'Speichere…';
    try {
      const res = await dashboardFetch('/setze-wartungsmodus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv }),
      });
      if (!res.ok) throw new Error(String(res.status));
      zeigeZustand(aktiv);
    } catch (err) {
      console.error('Wartungsmodus konnte nicht gesetzt werden:', err);
      zeigeZustand(!aktiv);
      status.textContent = 'Fehler beim Speichern.';
    } finally {
      checkbox.disabled = false;
    }
  });
}


// ---------------------------------------------------------------
// Gemeinsame Helfer (Inaktivitäts-Trennung, Promoter, Bonus)
// ---------------------------------------------------------------
function htmlEscape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}
function euroAusCent(cent) {
  return `${(cent / 100).toFixed(2).replace('.', ',')} €`;
}
function datumWien(iso) {
  return iso ? new Date(iso).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
}

// ---------------------------------------------------------------
// Blatt "finAPI" → Kosten (dashboard/sql/finapi_kosten.sql,
// finapiKosten.js, Preise aus dashboard_finapi_preise).
// ---------------------------------------------------------------
let kostenStand = null; // { quelle, stand, monate, naechsterSprung }
let chartKosten = null;
// Feste Reihenfolge = feste Farbe je Kostentyp (geprüft mit dem
// Palette-Validator, hell und dunkel).
const KOSTEN_FARBEN = { access: '--kosten-1', international: '--kosten-2', batch: '--kosten-3', kid: '--kosten-4' };
const KOSTEN_MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function kostenMonatText(monat) {
  const [j, m] = String(monat).split('-').map(Number);
  return `${KOSTEN_MONATE[m - 1]} ${j}`;
}
// de-DE statt de-AT: Tausenderpunkt wie in der finAPI-Preisliste ("1.000 €").
function kostenZahl(n) {
  return Number(n).toLocaleString('de-DE');
}
// Ganze Euro ohne ",00" – Preise je Nutzer behalten die Cent (0,30 €).
function kostenEuro(cent) {
  const text = (cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text.replace(/,00$/, '')} €`;
}
function kostenBereich(z) {
  if (z.bis === null) return `ab ${kostenZahl(z.von)} Nutzern`;
  if (z.von === 1) return `bis ${kostenZahl(z.bis)} Nutzer`;
  return `${kostenZahl(z.von)} – ${kostenZahl(z.bis)} Nutzer`;
}

function kostenKarte(p, nutzer) {
  const zeilen = p.zeilen.map((z, i) => `<tr class="${i === p.aktiveZeile ? 'kosten-aktiv' : ''}">
      <td>${htmlEscape(kostenBereich(z))}</td>
      <td>${htmlEscape(kostenEuro(z.cent))}${z.jeNutzer ? ' je Nutzer' : p.art === 'stufen' ? '' : ' pauschal'}</td>
    </tr>`).join('');
  let hinweis;
  if (p.naechsterNutzerCent > 0 && p.zeilen[p.aktiveZeile].jeNutzer) {
    hinweis = `Jeder weitere Nutzer kostet ${kostenEuro(p.naechsterNutzerCent)}.`;
  } else if (p.naechsteGrenze !== null) {
    hinweis = `Ab ${kostenZahl(p.naechsteGrenze)} Nutzern: ${kostenEuro(p.centAbGrenze)} im Monat (+${kostenEuro(p.centAbGrenze - p.cent)}).`;
  } else {
    hinweis = 'Höchste Stufe erreicht – mehr Nutzer kosten hier nichts mehr.';
  }
  return `<div class="kosten-karte card">
    <div class="kosten-karte-kopf">
      <span class="kosten-punkt" style="background:var(${KOSTEN_FARBEN[p.key]})" aria-hidden="true"></span>
      <div>
        <div class="kosten-karte-name">${htmlEscape(p.name)}</div>
        <div class="kosten-karte-sub">${htmlEscape(p.beschreibung)}</div>
      </div>
      <div class="kosten-karte-betrag">${htmlEscape(kostenEuro(p.cent))}</div>
    </div>
    <div class="kosten-karte-fuer">bei ${kostenZahl(nutzer)} Nutzern diesen Monat</div>
    <table class="kosten-skala"><tbody>${zeilen}</tbody></table>
    <p class="kosten-hinweis">${htmlEscape(hinweis)}</p>
  </div>`;
}

function kostenTabelle(monate) {
  if (monate.length === 0) return '';
  const posten = monate[0].rechnung.posten;
  const kopf = `<thead><tr><th>Monat</th><th>Nutzer</th><th>ohne Bank</th>${posten.map((p) => `<th>${htmlEscape(p.name)}</th>`).join('')}<th>Summe</th></tr></thead>`;
  const letzter = monate.length - 1;
  const zeilen = monate.slice().reverse().map((m) => {
    const bisher = monate.indexOf(m) === letzter;
    return `<tr${bisher ? ' class="kosten-aktiv"' : ''}>
      <td>${htmlEscape(kostenMonatText(m.monat))}${bisher ? ' <span class="settings-note">bisher</span>' : ''}</td>
      <td>${kostenZahl(m.nutzer)}</td>
      <td>${kostenZahl(m.ohne_bank)}</td>
      ${m.rechnung.posten.map((p) => `<td>${htmlEscape(kostenEuro(p.cent))}</td>`).join('')}
      <td><strong>${htmlEscape(kostenEuro(m.rechnung.summeCent))}</strong></td>
    </tr>`;
  }).join('');
  return `${kopf}<tbody>${zeilen}</tbody>`;
}

function zeichneKostenChart() {
  if (!kostenStand || kostenStand.monate.length === 0) return;
  const monate = kostenStand.monate;
  const posten = monate[0].rechnung.posten;
  const optionen = gemeinsameOptionen('€ pro Monat', 'Kalendermonat');
  optionen.plugins.legend = { display: true, labels: { color: css('--text-secondary'), boxWidth: 12 } };
  optionen.plugins.tooltip.displayColors = true;
  optionen.plugins.tooltip.callbacks = {
    label: (item) => `${item.dataset.label}: ${kostenEuro(Math.round(item.raw * 100))}`,
    footer: (items) => `Summe: ${kostenEuro(monate[items[0].dataIndex].rechnung.summeCent)}`,
  };
  optionen.scales.x.stacked = true;
  optionen.scales.y.stacked = true;
  const config = {
    type: 'bar',
    data: {
      labels: monate.map((m) => kostenMonatText(m.monat)),
      datasets: posten.map((p, i) => ({
        label: p.name,
        data: monate.map((m) => m.rechnung.posten[i].cent / 100),
        backgroundColor: css(KOSTEN_FARBEN[p.key]),
        borderColor: css('--surface-1'),
        borderWidth: { top: 2 },
        borderRadius: 4,
        maxBarThickness: 48,
      })),
    },
    options: optionen,
  };
  if (chartKosten) chartKosten.destroy();
  chartKosten = new Chart(document.getElementById('chart-kosten'), config);
}

function zeigeKosten(stand) {
  kostenStand = stand;
  const monate = stand.monate;
  const aktuell = monate[monate.length - 1];
  document.getElementById('kosten-quelle').innerHTML =
    `<a href="${htmlEscape(stand.quelle)}" target="_blank" rel="noopener">finapi.io/preise</a>, Stand ${htmlEscape(trennungTagText(stand.stand))}`;
  if (!aktuell) {
    for (const id of ['kosten-summe', 'kosten-nutzer', 'kosten-ohne-bank', 'kosten-sprung']) document.getElementById(id).textContent = '–';
    document.getElementById('kosten-karten').innerHTML = '<p class="alg-fenster-leer">Noch keine finAPI-Nutzer erfasst.</p>';
    document.getElementById('kosten-monate').innerHTML = '';
    return;
  }
  document.getElementById('kosten-summe').textContent = kostenEuro(aktuell.rechnung.summeCent);
  document.getElementById('kosten-summe-label').textContent = `Kosten ${kostenMonatText(aktuell.monat)} (bisher)`;
  document.getElementById('kosten-nutzer').textContent = kostenZahl(aktuell.nutzer);
  document.getElementById('kosten-ohne-bank').textContent = kostenZahl(aktuell.ohne_bank);
  const sprung = stand.naechsterSprung;
  document.getElementById('kosten-sprung').textContent = sprung ? `${kostenZahl(sprung.abNutzer)} Nutzer` : '–';
  document.getElementById('kosten-sprung-label').textContent = sprung
    ? `nächste Preisstufe: dann ${kostenEuro(sprung.summeCent)} im Monat (+${kostenEuro(sprung.summeCent - aktuell.rechnung.summeCent)})`
    : 'keine weitere Preisstufe';
  document.getElementById('kosten-karten').innerHTML = aktuell.rechnung.posten.map((p) => kostenKarte(p, aktuell.nutzer)).join('');
  document.getElementById('kosten-monate-sub').textContent =
    `Gesamtkosten je Kalendermonat, erfasst seit ${kostenMonatText(monate[0].monat)} – ältere Monate gibt es nicht. Der laufende Monat kann noch steigen, wenn neue Nutzer verbinden.`;
  document.getElementById('kosten-monate').innerHTML = kostenTabelle(monate);
  zeichneKostenChart();
}

async function initialisiereKosten() {
  const status = document.getElementById('kosten-status');
  try {
    const res = await dashboardFetch('/kosten.json', { cache: 'no-store' });
    const antwort = await res.json();
    if (!res.ok) throw new Error(antwort.error || res.status);
    zeigeKosten(antwort);
    status.classList.remove('error');
    status.textContent = `Stand ${datumWien(new Date().toISOString())} · netto, ohne Mehrwertsteuer`;
  } catch (err) {
    console.error('finAPI-Kosten nicht geladen:', err);
    status.classList.add('error');
    status.textContent = `finAPI-Kosten nicht geladen: ${err.message}`;
  }
}

// ---------------------------------------------------------------
// Blatt "finAPI" → Inaktivitäts-Trennung (dashboard/sql/abo_entfernen.sql)
// ---------------------------------------------------------------
// Lesen, Vorschau und Speichern über die Dashboard-Funktionen in der
// Datenbank. Vorschau und Lauf zählen mit derselben Datenbankfunktion
// bank_inaktive_verbindungen.
let trennungStand = null; // { einstellungen, betroffen, monatsletzter }

function trennungTageAusFeld() {
  return Number(document.getElementById('trennung-tage').value);
}
function trennungTageGueltig(tage) {
  return Number.isInteger(tage) && tage >= 1 && tage <= 365;
}
// 'YYYY-MM-DD' -> '31.10.2026'
function trennungTagText(tag) {
  const [j, m, t] = String(tag).split('-').map(Number);
  return `${t}.${m}.${j}`;
}

function trennungZeige(stand) {
  trennungStand = stand;
  document.getElementById('trennung-tage').value = stand.einstellungen.inaktiv_tage;
  document.getElementById('trennung-zahl').textContent = stand.betroffen.length;
  document.getElementById('trennung-naechster').textContent = trennungTagText(stand.monatsletzter);
  document.getElementById('trennung-vorschau').textContent = '';
  trennungPruefeAenderung();
}

function trennungPruefeAenderung() {
  const knopf = document.getElementById('trennung-speichern');
  const hinweis = document.getElementById('trennung-hinweis');
  const tage = trennungTageAusFeld();
  const gueltig = trennungTageGueltig(tage);
  const geaendert = !!trennungStand && tage !== trennungStand.einstellungen.inaktiv_tage;
  knopf.disabled = !geaendert || !gueltig;
  if (!gueltig) hinweis.textContent = 'Bitte eine ganze Zahl zwischen 1 und 365 eingeben.';
  else if (geaendert) hinweis.textContent = 'Ungespeicherte Änderung.';
  else if (trennungStand) hinweis.textContent = `Gespeichert: Trennung nach ${trennungStand.einstellungen.inaktiv_tage} Tagen ohne App.`;
}

let trennungVorschauTimer = null;
function trennungVorschau() {
  clearTimeout(trennungVorschauTimer);
  const ziel = document.getElementById('trennung-vorschau');
  const tage = trennungTageAusFeld();
  if (!trennungStand || !trennungTageGueltig(tage)) { ziel.textContent = ''; return; }
  trennungVorschauTimer = setTimeout(async () => {
    try {
      const res = await dashboardFetch('/trennung-vorschau', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inaktiv_tage: tage }) });
      const v = await res.json();
      if (!res.ok) throw new Error(v.error || res.status);
      ziel.textContent = `Mit ${tage} Tagen würden heute ${v.betroffen.length} Verbindungen getrennt.`;
    } catch (err) {
      ziel.textContent = `Vorschau nicht verfügbar: ${err.message}`;
    }
  }, 300);
}

async function trennungSpeichern() {
  const knopf = document.getElementById('trennung-speichern');
  const hinweis = document.getElementById('trennung-hinweis');
  knopf.disabled = true;
  hinweis.textContent = 'Speichere…';
  try {
    const res = await dashboardFetch('/speichere-trennung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inaktiv_tage: trennungTageAusFeld() }) });
    const antwort = await res.json();
    if (!res.ok) throw new Error(antwort.error || res.status);
    trennungZeige(antwort);
    hinweis.textContent = `Gespeichert ✓ Trennung nach ${antwort.einstellungen.inaktiv_tage} Tagen ohne App.`;
  } catch (err) {
    console.error('Inaktivitäts-Trennung nicht gespeichert:', err);
    hinweis.textContent = `Fehler: ${err.message}`;
    knopf.disabled = false;
  }
}

async function trennungProbelauf() {
  const ziel = document.getElementById('trennung-probelauf-ergebnis');
  const knopf = document.getElementById('trennung-probelauf');
  knopf.disabled = true;
  ziel.textContent = 'Rechne…';
  try {
    const res = await dashboardFetch('/simuliere-trennung', { method: 'POST' });
    const a = await res.json();
    if (!res.ok) throw new Error(a.error || res.status);
    const getrennt = (a.details?.getrennt || []).filter((g) => g.grund === 'inaktiv');
    const zeilen = getrennt
      .map((g) => `<tr><td><code>${htmlEscape(g.account_id)}</code></td><td>${htmlEscape(g.bank || '–')}</td></tr>`)
      .join('');
    ziel.innerHTML = `<p>Am ${htmlEscape(trennungTagText(a.heute))} würden <strong>${getrennt.length}</strong> von ${htmlEscape(a.verbindungen)} aktiven Verbindungen wegen Inaktivität getrennt.</p>
      ${getrennt.length ? `<table><thead><tr><th>Account</th><th>Bank</th></tr></thead><tbody>${zeilen}</tbody></table>` : ''}
      <p class="settings-note">Gerechnet mit dem heutigen Stand der Besuche – bis zum Monatsletzten kann sich das noch ändern.</p>`;
  } catch (err) {
    console.error('Probelauf fehlgeschlagen:', err);
    ziel.innerHTML = `<p class="alg-fenster-leer">Probelauf fehlgeschlagen: ${htmlEscape(err.message)}. Ist die Edge Function <code>bank-waechter</code> deployt?</p>`;
  } finally {
    knopf.disabled = false;
  }
}

async function initialisiereTrennung() {
  const status = document.getElementById('trennung-status');
  try {
    const res = await dashboardFetch('/trennung.json', { cache: 'no-store' });
    const antwort = await res.json();
    if (!res.ok) throw new Error(antwort.error || res.status);
    trennungZeige(antwort);
    status.classList.remove('error');
    status.textContent = `Stand ${datumWien(new Date().toISOString())} · zuletzt geändert ${datumWien(antwort.einstellungen.geaendert_am)}`;
  } catch (err) {
    console.error('Inaktivitäts-Trennung nicht geladen:', err);
    status.classList.add('error');
    status.textContent = `Inaktivitäts-Trennung nicht geladen: ${err.message}`;
  }
}

document.getElementById('trennung-tage').addEventListener('input', () => { trennungPruefeAenderung(); trennungVorschau(); });
document.getElementById('trennung-speichern').addEventListener('click', () => { void trennungSpeichern(); });
document.getElementById('trennung-probelauf').addEventListener('click', () => { void trennungProbelauf(); });

// ---------------------------------------------------------------
// 04 Externes Marketing → Promoter Programm
// Daten vom Server (/promoter.json, promoter_uebersicht – siehe
// dashboard/sql/promoter_programm.sql). Beträge sind überall Cent.
// ---------------------------------------------------------------
let proStand = null; // { promoter, preise, werbungen }
const PRO_PREIS_FELDER = {
  preis_registriert: 'pro-preis-registriert',
  preis_uni: 'pro-preis-uni',
  preis_bank: 'pro-preis-bank',
  preis_uni_bank: 'pro-preis-uni-bank',
};

function proJaNein(wert) {
  return wert ? '<span class="badge bg-green-lt">ja</span>' : '<span class="badge bg-secondary-lt">nein</span>';
}
function proMeilenstein(erreicht, erreichtAm) {
  return `${proJaNein(erreicht)}${erreichtAm ? ` <span class="settings-note">seit ${htmlEscape(datumWien(erreichtAm).replace(/, \d\d:\d\d$/, ''))}</span>` : ''}`;
}
function proSumme(werbungen) {
  return werbungen.reduce((summe, w) => summe + (w.preis || 0), 0);
}

async function proAnfrage(url, body) {
  const res = await dashboardFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const antwort = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(antwort.error || res.status);
  return antwort;
}

function proZeigeZahlen() {
  const { promoter, werbungen } = proStand;
  // Gelöschte zählen mit: Was jemand einmal erreicht hat, bleibt (promoter_uebersicht).
  document.getElementById('pro-zahl-promoter').textContent = promoter.filter((p) => p.aktiv).length;
  document.getElementById('pro-zahl-promoter-label').textContent = `aktive Promoter (von ${promoter.length})`;
  document.getElementById('pro-zahl-geworben').textContent = werbungen.length;
  document.getElementById('pro-zahl-uni').textContent = werbungen.filter((w) => w.uni_verbunden).length;
  document.getElementById('pro-zahl-bank').textContent = werbungen.filter((w) => w.bank_verbunden).length;
  document.getElementById('pro-zahl-beides').textContent = werbungen.filter((w) => w.uni_verbunden && w.bank_verbunden).length;
  const erwirtschaftet = proSumme(werbungen);
  const ausbezahlt = promoter.reduce((summe, p) => summe + (p.ausbezahlt_cent || 0), 0);
  document.getElementById('pro-zahl-summe').textContent = euroAusCent(erwirtschaftet);
  document.getElementById('pro-zahl-ausbezahlt').textContent = euroAusCent(ausbezahlt);
  document.getElementById('pro-zahl-offen').textContent = euroAusCent(erwirtschaftet - ausbezahlt);
}

function proIbanText(iban) {
  return iban ? iban.replace(/(.{4})/g, '$1 ').trim() : '';
}

function proFuellePreise() {
  const preise = proStand.preise;
  for (const [feld, id] of Object.entries(PRO_PREIS_FELDER)) document.getElementById(id).value = (preise[feld] / 100).toFixed(2);
  document.getElementById('pro-preise-hinweis').textContent = `Zuletzt geändert: ${datumWien(preise.aktualisiert_am)}`;
}

function proPersonenTabelle(werbungen) {
  if (werbungen.length === 0) return '<p class="alg-fenster-leer">Über diesen Code hat sich noch niemand registriert.</p>';
  const zeilen = werbungen.map((w) => `<tr>
      <td>${htmlEscape(w.anzeigename || '–')}${w.username ? ` <span class="settings-note">@${htmlEscape(w.username)}</span>` : ''}${w.geloescht ? ' <span class="badge bg-red-lt">gelöscht</span>' : ''}</td>
      <td>${htmlEscape(w.telefon || '–')}</td>
      <td>${proMeilenstein(w.bank_verbunden, w.bank_erreicht_am)}</td>
      <td>${proMeilenstein(w.uni_verbunden, w.uni_erreicht_am)}${w.uni_name ? ` <span class="settings-note">${htmlEscape(w.uni_name)}</span>` : ''}</td>
      <td>${htmlEscape(datumWien(w.eingeloest_am))}</td>
      <td><strong>${euroAusCent(w.preis || 0)}</strong></td>
    </tr>`).join('');
  return `<div class="pro-tabelle-scroll"><table class="pro-tabelle">
    <thead><tr><th>Name</th><th>Telefon</th><th>Bank (jemals)</th><th>Uni (jemals)</th><th>registriert</th><th>Preis</th></tr></thead>
    <tbody>${zeilen}</tbody>
  </table></div>`;
}

function proZeigeListe() {
  const ziel = document.getElementById('pro-liste');
  const { promoter, werbungen } = proStand;
  if (promoter.length === 0) {
    ziel.innerHTML = '<p class="alg-fenster-leer">Noch kein Promoter angelegt.</p>';
    return;
  }
  // Aufgeklappte Details nach dem Neuzeichnen offen lassen.
  const offen = new Set([...ziel.querySelectorAll('tr[data-pro-details-von]:not([hidden])')].map((z) => z.dataset.proDetailsVon));
  const zeilen = promoter.map((p) => {
    const eigene = werbungen.filter((w) => w.promoter_id === p.promoter_id);
    const amLimit = eigene.length >= p.max_geworbene;
    const erwirtschaftet = proSumme(eigene);
    const ausbezahlt = p.ausbezahlt_cent || 0;
    const rest = erwirtschaftet - ausbezahlt;
    return `<tr data-promoter-id="${htmlEscape(p.promoter_id)}">
        <td><strong>${htmlEscape(p.name)}</strong></td>
        <td><code>${htmlEscape(p.code)}</code></td>
        <td>
          <label class="form-check form-switch" style="margin:0;">
            <input class="form-check-input" type="checkbox" data-pro-aktiv ${p.aktiv ? 'checked' : ''} />
            <span class="form-check-label">${p.aktiv ? 'aktiv' : 'pausiert'}</span>
          </label>
        </td>
        <td>${eigene.length} / ${htmlEscape(p.max_geworbene)}${amLimit ? ' <span class="badge bg-orange-lt">Limit erreicht</span>' : ''}</td>
        <td>${p.iban ? `<span class="pro-iban">${htmlEscape(proIbanText(p.iban))}</span>` : '<span class="badge bg-red-lt">IBAN fehlt</span>'}</td>
        <td>${euroAusCent(erwirtschaftet)}</td>
        <td>${euroAusCent(ausbezahlt)}</td>
        <td><strong class="${rest < 0 ? 'pro-negativ' : ''}">${euroAusCent(rest)}</strong></td>
        <td><button class="btn btn-outline-secondary btn-sm" type="button" data-pro-details>Details · ${eigene.length} Personen</button></td>
      </tr>
      <tr class="pro-personen-zeile" data-pro-details-von="${htmlEscape(p.promoter_id)}" ${offen.has(p.promoter_id) ? '' : 'hidden'}>
        <td colspan="9">
          <div class="pro-bearbeiten">
            <div class="alg-feld">
              <span class="alg-label">Maximales Limit</span>
              <span class="alg-hint">Höchstzahl geworbener Personen</span>
              <span class="pro-feld-zeile">
                <input type="number" class="form-control form-control-sm" data-pro-limit min="1" step="1" value="${htmlEscape(p.max_geworbene)}" />
                <span class="alg-einheit">Personen</span>
                <button class="btn btn-outline-primary btn-sm" type="button" data-pro-speichern="limit">Speichern</button>
              </span>
            </div>
            <div class="alg-feld">
              <span class="alg-label">IBAN</span>
              <span class="alg-hint">Wohin ausbezahlt wird</span>
              <span class="pro-feld-zeile">
                <input type="text" class="form-control form-control-sm pro-iban" data-pro-iban maxlength="42" autocomplete="off" spellcheck="false" value="${htmlEscape(proIbanText(p.iban))}" />
                <button class="btn btn-outline-primary btn-sm" type="button" data-pro-speichern="iban">Speichern</button>
              </span>
            </div>
            <div class="alg-feld">
              <span class="alg-label">Schon ausbezahlt</span>
              <span class="alg-hint">Gesamtsumme aller Überweisungen an diesen Promoter${p.ausbezahlt_geaendert_am ? ` · zuletzt geändert ${htmlEscape(datumWien(p.ausbezahlt_geaendert_am))}` : ''}</span>
              <span class="pro-feld-zeile">
                <input type="number" class="form-control form-control-sm" data-pro-ausbezahlt min="0" step="0.01" value="${(ausbezahlt / 100).toFixed(2)}" />
                <span class="alg-einheit">€</span>
                <button class="btn btn-outline-primary btn-sm" type="button" data-pro-speichern="ausbezahlt">Speichern</button>
              </span>
            </div>
          </div>
          ${proPersonenTabelle(eigene)}
        </td>
      </tr>`;
  }).join('');
  ziel.innerHTML = `<div class="pro-tabelle-scroll"><table class="pro-tabelle">
      <thead><tr><th>Name</th><th>Code</th><th>Status</th><th>geworben / Limit</th><th>IBAN</th><th>erwirtschaftet</th><th>ausbezahlt</th><th>offen</th><th></th></tr></thead>
      <tbody>${zeilen}</tbody>
    </table></div>`;
}

function proZeige(antwort) {
  proStand = antwort;
  const programmAn = antwort.preise.programm_aktiv !== false;
  document.getElementById('pro-programm-aktiv').checked = programmAn;
  document.getElementById('pro-programm-text').textContent = programmAn ? 'an' : 'aus';
  const status = document.getElementById('pro-status');
  status.classList.remove('error');
  status.textContent = `Stand ${datumWien(new Date().toISOString())}`;
  proZeigeZahlen();
  proFuellePreise();
  proZeigeListe();
}

async function proLaden() {
  const status = document.getElementById('pro-status');
  try {
    const res = await dashboardFetch('/promoter.json', { cache: 'no-store' });
    const antwort = await res.json();
    if (!res.ok) throw new Error(antwort.error || res.status);
    proZeige(antwort);
  } catch (err) {
    console.error('Promoter Programm nicht geladen:', err);
    status.classList.add('error');
    status.textContent = `Promoter Programm nicht geladen: ${err.message}`;
  }
}

function proLeseCent(eingabe) {
  const feld = eingabe.value.trim().replace(',', '.');
  const wert = feld === '' ? NaN : Number(feld);
  if (!Number.isFinite(wert) || wert < 0) throw new Error('Beträge müssen Zahlen ab 0 € sein');
  return Math.round(wert * 100);
}

document.getElementById('pro-neu-laden').addEventListener('click', () => { void proLaden(); });

document.getElementById('pro-programm-aktiv').addEventListener('change', async (e) => {
  const schalter = e.currentTarget;
  const hinweis = document.getElementById('pro-programm-hinweis');
  schalter.disabled = true;
  try {
    proZeige(await proAnfrage('/promoter-programm', { aktiv: schalter.checked }));
    hinweis.textContent = schalter.checked
      ? 'Eingeschaltet ✓ Das Feld „Einladungscode“ erscheint wieder bei der Registrierung.'
      : 'Ausgeschaltet ✓ Kein Feld „Einladungscode“ mehr, Codes gelten nicht.';
  } catch (err) {
    console.error('Promoter-Programm nicht umgeschaltet:', err);
    schalter.checked = !schalter.checked;
    hinweis.textContent = `Fehler: ${err.message}`;
  } finally {
    schalter.disabled = false;
  }
});

document.getElementById('pro-preise-speichern').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  const hinweis = document.getElementById('pro-preise-hinweis');
  knopf.disabled = true;
  try {
    const preise = {};
    for (const [feld, id] of Object.entries(PRO_PREIS_FELDER)) preise[feld] = proLeseCent(document.getElementById(id));
    proZeige(await proAnfrage('/promoter-preise', preise));
    hinweis.textContent = 'Gespeichert ✓ Gilt für neue Einlösungen.';
  } catch (err) {
    console.error('Promoter-Preise nicht gespeichert:', err);
    hinweis.textContent = `Fehler: ${err.message}`;
  } finally {
    knopf.disabled = false;
  }
});

document.getElementById('pro-neu-anlegen').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  const hinweis = document.getElementById('pro-neu-hinweis');
  const name = document.getElementById('pro-neu-name');
  const code = document.getElementById('pro-neu-code');
  const limit = document.getElementById('pro-neu-limit');
  const iban = document.getElementById('pro-neu-iban');
  knopf.disabled = true;
  try {
    proZeige(await proAnfrage('/promoter-anlegen', { name: name.value, code: code.value, max_geworbene: Number(limit.value), iban: iban.value }));
    hinweis.textContent = `Promoter ${code.value.trim().toUpperCase()} angelegt ✓`;
    name.value = '';
    code.value = '';
    iban.value = '';
  } catch (err) {
    console.error('Promoter nicht angelegt:', err);
    hinweis.textContent = `Fehler: ${err.message}`;
  } finally {
    knopf.disabled = false;
  }
});

// Die Liste wird bei jedem Laden neu gebaut -> Ereignisse am Container.
const proListe = document.getElementById('pro-liste');
proListe.addEventListener('click', async (e) => {
  const knopf = e.target.closest('[data-pro-details], [data-pro-speichern]');
  if (!knopf) return;
  const zeile = knopf.closest('tr');
  const id = zeile.dataset.promoterId || zeile.dataset.proDetailsVon;
  if (knopf.matches('[data-pro-details]')) {
    const details = proListe.querySelector(`tr[data-pro-details-von="${CSS.escape(id)}"]`);
    if (details) details.hidden = !details.hidden;
    return;
  }
  const details = knopf.closest('tr[data-pro-details-von]');
  const hinweis = document.getElementById('pro-liste-hinweis');
  const feld = knopf.dataset.proSpeichern;
  knopf.disabled = true;
  try {
    const aenderung = { promoter_id: id };
    if (feld === 'limit') aenderung.max_geworbene = Number(details.querySelector('[data-pro-limit]').value);
    if (feld === 'iban') aenderung.iban = details.querySelector('[data-pro-iban]').value;
    if (feld === 'ausbezahlt') aenderung.ausbezahlt_cent = proLeseCent(details.querySelector('[data-pro-ausbezahlt]'));
    proZeige(await proAnfrage('/promoter-aendern', aenderung));
    hinweis.textContent = { limit: 'Limit gespeichert ✓', iban: 'IBAN gespeichert ✓', ausbezahlt: 'Ausbezahlt gespeichert ✓' }[feld];
  } catch (err) {
    console.error('Promoter nicht geändert:', err);
    hinweis.textContent = `Fehler: ${err.message}`;
    knopf.disabled = false;
  }
});
proListe.addEventListener('change', async (e) => {
  const schalter = e.target.closest('[data-pro-aktiv]');
  if (!schalter) return;
  const promoterId = schalter.closest('tr[data-promoter-id]').dataset.promoterId;
  const hinweis = document.getElementById('pro-liste-hinweis');
  schalter.disabled = true;
  try {
    proZeige(await proAnfrage('/promoter-aendern', { promoter_id: promoterId, aktiv: schalter.checked }));
    hinweis.textContent = schalter.checked ? 'Promoter aktiviert ✓' : 'Promoter pausiert ✓ Der Code gilt in der App nicht mehr.';
  } catch (err) {
    console.error('Promoter-Status nicht geändert:', err);
    schalter.checked = !schalter.checked;
    schalter.disabled = false;
    hinweis.textContent = `Fehler: ${err.message}`;
  }
});

// ---------------------------------------------------------------
// 04 Externes Marketing → Bonus Programm
// Daten vom Server (/bonus.json, bonus_uebersicht – siehe
// dashboard/sql/bonusgruppen.sql). Beträge sind überall Cent.
// ---------------------------------------------------------------
let bonStand = null; // { einstellungen, unis, gruppen, auszahlungen }
const BON_STATUS = {
  laeuft: '<span class="badge bg-blue-lt">läuft</span>',
  erfolgreich: '<span class="badge bg-green-lt">erfolgreich</span>',
  abgelaufen: '<span class="badge bg-secondary-lt">abgelaufen</span>',
  gescheitert: '<span class="badge bg-red-lt">gescheitert</span>',
};

function bonHaekchen(an, konflikt) {
  if (an) return '<span class="badge bg-green-lt">ja</span>';
  return konflikt ? '<span class="badge bg-red-lt">Konflikt</span>' : '<span class="badge bg-secondary-lt">nein</span>';
}
function bonIban(iban) {
  return iban ? iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim() : '';
}
function bonRestzeit(iso) {
  const rest = new Date(iso).getTime() - Date.now();
  if (rest <= 0) return 'Zeit um';
  const stunden = Math.floor(rest / 3600000);
  return stunden >= 24 ? `noch ${Math.floor(stunden / 24)} T ${stunden % 24} Std` : `noch ${stunden} Std ${Math.floor((rest % 3600000) / 60000)} Min`;
}

function bonZeigeZahlen() {
  const { einstellungen, gruppen, auszahlungen } = bonStand;
  const anzahl = (status) => gruppen.filter((g) => g.status === status).length;
  const pct = (teil, ganz) => (ganz ? `${Math.round((teil / ganz) * 100)} %` : '–');
  document.getElementById('bon-zahl-gruppen').textContent = gruppen.length;
  document.getElementById('bon-zahl-gruppen-label').textContent =
    `Bonusgruppen erstellt${einstellungen.max_gruppen ? ` (von höchstens ${einstellungen.max_gruppen})` : ''}`;
  document.getElementById('bon-zahl-laufend').textContent = anzahl('laeuft');
  document.getElementById('bon-zahl-erfolgreich').textContent = anzahl('erfolgreich');
  document.getElementById('bon-zahl-verpasst').textContent = anzahl('abgelaufen') + anzahl('gescheitert');

  // Weiterempfehlung: Der Ersteller war selbst schon als Mitglied in einer
  // (anderen) Bonusgruppe – er wurde durch eine Bonusgruppe geholt.
  const warMitglied = new Set(gruppen.flatMap((g) => (g.mitglieder || []).filter((m) => m.rolle === 'mitglied').map((m) => m.person_id)));
  const weiter = gruppen.filter((g) => (g.mitglieder || []).some((m) => m.rolle === 'ersteller' && warMitglied.has(m.person_id)));
  document.getElementById('bon-zahl-weiter').textContent = weiter.length;
  document.getElementById('bon-zahl-weiter-label').textContent =
    `von Geworbenen erstellt (Ersteller war vorher Bonus-Mitglied) · ${pct(weiter.length, gruppen.length)} aller Gruppen`;

  // Personen: jede einmal; Häkchen zählen, wenn sie in irgendeiner Gruppe erreicht sind.
  const personen = new Map();
  for (const m of gruppen.flatMap((g) => g.mitglieder || [])) {
    const p = personen.get(m.person_id) || { konto: false, uni: false, bank: false };
    personen.set(m.person_id, { konto: p.konto || m.konto, uni: p.uni || m.uni, bank: p.bank || m.bank });
  }
  const alle = [...personen.values()];
  const zeige = (id, teil) => {
    document.getElementById(id).textContent = teil;
    const label = document.getElementById(`${id}-label`);
    label.textContent = `${label.textContent.replace(/ · \d+ %$| · –$/, '')} · ${pct(teil, alle.length)}`;
  };
  document.getElementById('bon-zahl-personen').textContent = alle.length;
  zeige('bon-zahl-schatten', alle.filter((p) => !p.konto).length);
  zeige('bon-zahl-konto', alle.filter((p) => p.konto).length);
  zeige('bon-zahl-uni', alle.filter((p) => p.uni).length);
  zeige('bon-zahl-bank', alle.filter((p) => p.bank).length);

  const summe = (liste) => liste.reduce((s, z) => s + (z.betrag_cent || 0), 0);
  document.getElementById('bon-zahl-ausbezahlt').textContent = euroAusCent(summe(auszahlungen.filter((z) => z.ausbezahlt_am)));
  document.getElementById('bon-zahl-offen').textContent = euroAusCent(summe(auszahlungen.filter((z) => !z.ausbezahlt_am)));
  zeichneBonusCharts();
}

// Bonusgruppen pro Kalendertag (Wiener Zeit), von der ersten Bonusgruppe
// bis heute. Beschriftung: Datum, die letzten beiden "gestern" / "heute".
let chartBonTage = null;
let chartBonGroesse = null;
function bonWienTag(zeit) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(zeit));
}
function zeichneBonusCharts() {
  if (!bonStand) return;
  const { gruppen } = bonStand;
  const heute = bonWienTag(Date.now());
  const ersterTag = gruppen.map((g) => bonWienTag(g.erstellt_am)).sort()[0] || heute;
  const proTag = new Map();
  for (const g of gruppen) {
    const tag = bonWienTag(g.erstellt_am);
    proTag.set(tag, (proTag.get(tag) || 0) + 1);
  }
  const tage = [];
  const daten = [];
  const datum = [];
  const anzahlTage = Math.max(0, tageZwischen(ersterTag, heute));
  for (let d = 0; d <= anzahlTage; d++) {
    const tag = new Date(new Date(ersterTag + 'T00:00:00Z').getTime() + d * 86400000).toISOString().slice(0, 10);
    const [, monat, t] = tag.split('-').map(Number);
    const abstand = anzahlTage - d;
    tage.push(abstand === 0 ? 'heute' : abstand === 1 ? 'gestern' : `${t}.${monat}.`);
    datum.push(`${t}.${monat}.${tag.slice(0, 4)}`);
    daten.push(proTag.get(tag) || 0);
  }
  const optTage = gemeinsameOptionen('Bonusgruppen', 'Kalendertag');
  optTage.plugins.tooltip.callbacks = { title: (items) => datum[items[0].dataIndex] };
  const cfgTage = {
    type: 'bar',
    data: { labels: tage, datasets: [{ data: daten, backgroundColor: css('--series-5'), borderRadius: 4, barPercentage: 0.6 }] },
    options: optTage,
  };
  if (chartBonTage) { chartBonTage.data = cfgTage.data; chartBonTage.options = cfgTage.options; chartBonTage.update(); }
  else { chartBonTage = new Chart(document.getElementById('chart-bon-tage'), cfgTage); }
  document.getElementById('table-bon-tage').innerHTML = `<table><thead><tr><th>Tag</th><th>Bonusgruppen</th></tr></thead><tbody>${
    tage.map((t, n) => `<tr><td>${t === datum[n].slice(0, t.length) ? datum[n] : `${t} (${datum[n]})`}</td><td>${daten[n]}</td></tr>`).join('')
  }</tbody></table>`;

  // Größe inkl. Ersteller: 3, 4, 5.
  const groessen = [3, 4, 5];
  const proGroesse = groessen.map((n) => gruppen.filter((g) => (g.mitglieder || []).length === n).length);
  const optGroesse = gemeinsameOptionen('Bonusgruppen', 'Mitglieder inkl. Ersteller');
  const cfgGroesse = {
    type: 'bar',
    data: { labels: groessen.map((n) => `${n} Personen`), datasets: [{ data: proGroesse, backgroundColor: css('--series-5'), borderRadius: 4, barPercentage: 0.5 }] },
    options: optGroesse,
  };
  if (chartBonGroesse) { chartBonGroesse.data = cfgGroesse.data; chartBonGroesse.options = cfgGroesse.options; chartBonGroesse.update(); }
  else { chartBonGroesse = new Chart(document.getElementById('chart-bon-groesse'), cfgGroesse); }
  document.getElementById('table-bon-groesse').innerHTML = `<table><thead><tr><th>Größe</th><th>Bonusgruppen</th></tr></thead><tbody>${
    groessen.map((n, k) => `<tr><td>${n} Personen</td><td>${proGroesse[k]}</td></tr>`).join('')
  }</tbody></table>`;
}

function bonFuelleEinstellungen() {
  const e = bonStand.einstellungen;
  document.getElementById('bon-aktiv').checked = e.aktiv;
  document.getElementById('bon-aktiv-text').textContent = e.aktiv ? 'an' : 'aus';
  document.getElementById('bon-betrag-3').value = (e.betrag_3_cent / 100).toFixed(2);
  document.getElementById('bon-betrag-4').value = (e.betrag_4_cent / 100).toFixed(2);
  document.getElementById('bon-betrag-5').value = (e.betrag_5_cent / 100).toFixed(2);
  document.getElementById('bon-max').value = e.max_gruppen ?? '';
  document.getElementById('bon-budget').value = e.max_budget_cent == null ? '' : e.max_budget_cent / 100;
  // Stand: reserviert und wie viele Gruppen je Größe noch hineinpassen.
  const reserviert = bonStand.budget_reserviert_cent || 0;
  document.getElementById('bon-budget-stand').textContent = e.max_budget_cent == null
    ? `Reserviert: ${euroAusCent(reserviert)}`
    : `Reserviert: ${euroAusCent(reserviert)} von ${euroAusCent(e.max_budget_cent)} · reicht noch für ${
        [3, 4, 5].map((n) => {
          const cap = e[`betrag_${n}_cent`];
          return `${cap > 0 ? Math.max(0, Math.floor((e.max_budget_cent - reserviert) / cap)) : '∞'} × ${n} Pers.`;
        }).join(' oder ')}`;
  const gewaehlt = new Set(e.uni_ids || []);
  document.getElementById('bon-unis').innerHTML = bonStand.unis.length === 0
    ? '<span class="alg-hint">Keine Unis in der Datenbank</span>'
    : bonStand.unis.map((u) => `<label class="form-check"><input class="form-check-input" type="checkbox" data-bon-uni="${htmlEscape(u.university_id)}" ${gewaehlt.has(u.university_id) ? 'checked' : ''} /><span class="form-check-label">${htmlEscape(u.name)}</span></label>`).join('');
  document.getElementById('bon-hinweis').textContent = `Zuletzt geändert: ${datumWien(e.geaendert_am)}`;
}

function bonZeigeAuszahlungen() {
  const ziel = document.getElementById('bon-auszahlungen');
  const liste = bonStand.auszahlungen;
  if (liste.length === 0) {
    ziel.innerHTML = '<p class="alg-fenster-leer">Noch keine übernommene Bonusforderung.</p>';
    return;
  }
  ziel.innerHTML = `<div class="pro-tabelle-scroll"><table class="pro-tabelle">
    <thead><tr><th>Person</th><th>Telefon</th><th>Gruppe</th><th>Betrag</th><th>IBAN</th><th>Status</th><th></th></tr></thead>
    <tbody>${liste.map((z) => `<tr data-bon-chat="${htmlEscape(z.chat_id)}" data-bon-person="${htmlEscape(z.person_id)}">
      <td>${htmlEscape(z.name)}</td>
      <td>${htmlEscape(z.telefon || '–')}</td>
      <td>${htmlEscape(z.gruppe || '–')}</td>
      <td><strong>${euroAusCent(z.betrag_cent)}</strong></td>
      <td>${z.iban ? `<span class="pro-iban">${htmlEscape(bonIban(z.iban))}</span>` : '<span class="badge bg-red-lt">IBAN fehlt</span>'}</td>
      <td>${z.ausbezahlt_am ? `<span class="badge bg-green-lt">ausbezahlt</span> <span class="settings-note">${htmlEscape(datumWien(z.ausbezahlt_am))}</span>` : '<span class="badge bg-orange-lt">offen</span>'}</td>
      <td><button type="button" class="btn btn-sm ${z.ausbezahlt_am ? 'btn-outline-secondary' : 'btn-primary'}" data-bon-ausbezahlt="${z.ausbezahlt_am ? 'nein' : 'ja'}">${z.ausbezahlt_am ? 'Zurücknehmen' : 'Als ausbezahlt markieren'}</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function bonZeigeGruppen() {
  const ziel = document.getElementById('bon-gruppen');
  const gruppen = bonStand.gruppen;
  if (gruppen.length === 0) {
    ziel.innerHTML = '<p class="alg-fenster-leer">Noch keine Bonusgruppe erstellt.</p>';
    return;
  }
  const offen = new Set([...ziel.querySelectorAll('tr[data-bon-details-von]:not([hidden])')].map((z) => z.dataset.bonDetailsVon));
  ziel.innerHTML = `<div class="pro-tabelle-scroll"><table class="pro-tabelle">
    <thead><tr><th>Name</th><th>Status</th><th>Ersteller</th><th>erstellt</th><th>Zeit</th><th>bis zu</th><th>Bonusforderung</th><th>fertig</th><th></th></tr></thead>
    <tbody>${gruppen.map((g) => {
      const mitglieder = g.mitglieder || [];
      const ersteller = mitglieder.find((m) => m.rolle === 'ersteller');
      const fertig = mitglieder.filter((m) => m.konto && m.uni && m.bank).length;
      const zeit = g.status === 'laeuft' ? bonRestzeit(g.laeuft_bis) : (g.beendet_am ? `beendet ${datumWien(g.beendet_am)}` : '–');
      return `<tr data-bon-gruppe="${htmlEscape(g.chat_id)}">
        <td><strong>${htmlEscape(g.name || '–')}</strong>${g.grund ? `<div class="settings-note">${htmlEscape(g.grund)}</div>` : ''}</td>
        <td>${BON_STATUS[g.status] || htmlEscape(g.status)}</td>
        <td>${htmlEscape(ersteller ? ersteller.name : '–')}</td>
        <td>${htmlEscape(datumWien(g.erstellt_am))}</td>
        <td>${htmlEscape(zeit)}</td>
        <td>${euroAusCent(g.uebernahme_max_cent)}</td>
        <td>${!g.forderung ? '–'
          : g.forderung.uebernommen_am ? `bezahlt ${euroAusCent(g.forderung.uebernommen_cent || 0)}`
          : g.forderung.aufgeteilt_am ? `aufgeteilt ${euroAusCent(g.forderung.dropchat_cent || 0)}`
          : `DropChat-Anteil ${euroAusCent(g.forderung.dropchat_cent || 0)}, wartet`}</td>
        <td>${fertig} / ${mitglieder.length}</td>
        <td><button class="btn btn-outline-secondary btn-sm" type="button" data-bon-details>Mitglieder</button></td>
      </tr>
      <tr class="pro-personen-zeile" data-bon-details-von="${htmlEscape(g.chat_id)}" ${offen.has(g.chat_id) ? '' : 'hidden'}>
        <td colspan="9"><div class="pro-tabelle-scroll"><table class="pro-tabelle">
          <thead><tr><th>Name</th><th>Telefon</th><th>Konto</th><th>Uni</th><th>Bank</th></tr></thead>
          <tbody>${mitglieder.map((m) => `<tr>
            <td>${htmlEscape(m.name)}${m.rolle === 'ersteller' ? ' <span class="badge bg-purple-lt">Ersteller</span>' : ''}${m.geloescht ? ' <span class="badge bg-red-lt">gelöscht</span>' : ''}</td>
            <td>${htmlEscape(m.telefon || '–')}</td>
            <td>${bonHaekchen(m.konto, false)}</td>
            <td>${bonHaekchen(m.uni, m.uni_konflikt)}</td>
            <td>${bonHaekchen(m.bank, m.bank_konflikt)}</td>
          </tr>`).join('')}</tbody>
        </table></div></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function bonZeige(antwort) {
  bonStand = antwort;
  const status = document.getElementById('bon-status');
  status.classList.remove('error');
  status.textContent = `Stand ${datumWien(new Date().toISOString())} · Programm ${antwort.einstellungen.aktiv ? 'an' : 'aus'}`;
  bonZeigeZahlen();
  bonFuelleEinstellungen();
  bonZeigeAuszahlungen();
  bonZeigeGruppen();
}

async function bonLaden() {
  const status = document.getElementById('bon-status');
  try {
    const res = await dashboardFetch('/bonus.json', { cache: 'no-store' });
    const antwort = await res.json();
    if (!res.ok) throw new Error(antwort.error || res.status);
    bonZeige(antwort);
  } catch (err) {
    console.error('Bonus Programm nicht geladen:', err);
    status.classList.add('error');
    status.textContent = `Bonus Programm nicht geladen: ${err.message}`;
  }
}

function bonLeseEinstellungen() {
  const cent = (id) => {
    const feld = document.getElementById(id).value.trim().replace(',', '.');
    const wert = feld === '' ? NaN : Number(feld);
    if (!Number.isFinite(wert) || wert < 0) throw new Error('Beträge müssen Zahlen ab 0 € sein');
    return Math.round(wert * 100);
  };
  const maxFeld = document.getElementById('bon-max').value.trim();
  const budgetFeld = document.getElementById('bon-budget').value.trim().replace(',', '.');
  return {
    aktiv: document.getElementById('bon-aktiv').checked,
    betrag_3_cent: cent('bon-betrag-3'),
    betrag_4_cent: cent('bon-betrag-4'),
    betrag_5_cent: cent('bon-betrag-5'),
    max_gruppen: maxFeld === '' ? null : Number(maxFeld),
    max_budget_cent: budgetFeld === '' ? null : Math.round(Number(budgetFeld) * 100),
    uni_ids: [...document.querySelectorAll('[data-bon-uni]:checked')].map((el) => el.dataset.bonUni),
  };
}

document.getElementById('bon-aktiv').addEventListener('change', (e) => {
  document.getElementById('bon-aktiv-text').textContent = e.target.checked ? 'an (noch nicht gespeichert)' : 'aus (noch nicht gespeichert)';
});
document.getElementById('bon-speichern').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  const hinweis = document.getElementById('bon-hinweis');
  knopf.disabled = true;
  try {
    bonZeige(await proAnfrage('/bonus-einstellungen', bonLeseEinstellungen()));
    hinweis.textContent = 'Gespeichert ✓';
  } catch (err) {
    console.error('Bonus-Einstellungen nicht gespeichert:', err);
    hinweis.textContent = `Fehler: ${err.message}`;
  } finally {
    knopf.disabled = false;
  }
});
document.getElementById('bon-ablaufen').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  knopf.disabled = true;
  try {
    bonZeige(await proAnfrage('/bonus-ablaufen', {}));
    document.getElementById('bon-hinweis').textContent = 'Abgelaufene Bonusgruppen beendet ✓';
  } catch (err) {
    console.error('Bonus-Ablauf fehlgeschlagen:', err);
    document.getElementById('bon-hinweis').textContent = `Fehler: ${err.message}`;
  } finally {
    knopf.disabled = false;
  }
});
document.getElementById('bon-gruppen').addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-bon-details]');
  if (!knopf) return;
  const id = knopf.closest('tr').dataset.bonGruppe;
  const details = document.querySelector(`#bon-gruppen tr[data-bon-details-von="${CSS.escape(id)}"]`);
  if (details) details.hidden = !details.hidden;
});
document.getElementById('bon-auszahlungen').addEventListener('click', async (e) => {
  const knopf = e.target.closest('[data-bon-ausbezahlt]');
  if (!knopf) return;
  const zeile = knopf.closest('tr');
  knopf.disabled = true;
  try {
    bonZeige(await proAnfrage('/bonus-ausbezahlt', {
      chat_id: zeile.dataset.bonChat,
      person_id: zeile.dataset.bonPerson,
      ausbezahlt: knopf.dataset.bonAusbezahlt === 'ja',
    }));
  } catch (err) {
    console.error('Auszahlung nicht geändert:', err);
    document.getElementById('bon-liste-hinweis').textContent = `Fehler: ${err.message}`;
    knopf.disabled = false;
  }
});

// ---------------------------------------------------------------
// Filter verdrahten
// ---------------------------------------------------------------
for (const [id, feld] of [['f-tracking-modus', 'modus'], ['f-tracking-nenner', 'nenner']]) {
  document.getElementById(id).addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    filterState[feld] = button.dataset.value;
    document.querySelectorAll(`#${id} button`).forEach((b) => {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });
    zeichneCharts();
  });
}
document.getElementById('f-screen').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#f-screen button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.screen = btn.dataset.value;
  zeichneCharts();
});

document.getElementById('f3-schatten').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#f3-schatten button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  organischFilterState.schatten = btn.dataset.value;
  zeichneOrganischChart();
});

document.getElementById('f3-gruppen-schatten').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#f3-gruppen-schatten button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  gruppenFilterState.schatten = btn.dataset.value;
  zeichneGruppenChart();
});

document.getElementById('f3-quelle').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#f3-quelle button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  organischFilterState.quelle = btn.dataset.value;
  zeichneOrganischChart();
});

document.getElementById('f4-kategorie').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#f4-kategorie button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  chatHealthFilterState.kategorie = btn.dataset.value;
  zeichneChatHealthChart();
});

document.querySelectorAll('.table-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const ziel = document.getElementById(btn.dataset.target);
    ziel.hidden = !ziel.hidden;
  });
});

async function main() {
  // Die Inaktivitäts-Trennung lädt unabhängig von den Metrik-Daten
  // (eigener Endpunkt /trennung.json) – ein Fehler dort blockiert es nicht.
  void initialisiereNutzerListe();
  void initialisiereTrennung();
  void initialisiereKosten();
  void proLaden();
  void bonLaden();
  try {
    await ladeDaten();
  } catch (err) {
    console.error(err);
    zeigeFehler('Fehler beim Laden: ' + err.message);
    zeigeSupportFehler('Fehler beim Laden: ' + err.message);
    return;
  }

  erstelleDualSlider(document.getElementById('f-chats'), {
    max: rohdaten.maxChatAnzahl,
    onChange: (lo, hi) => {
      filterState.chatsMin = lo;
      filterState.chatsMax = hi;
      document.getElementById('f-chats-readout').textContent = `${lo} – ${hi}`;
      zeichneCharts();
    },
  });

  erstelleTriStateSlider(document.getElementById('f-bank'), document.getElementById('f-bank-ticks'), {
    onChange: (wert) => {
      filterState.bank = wert;
      zeichneCharts();
    },
  });

  statusEl.textContent = 'Daten geladen.';
  zeichneCharts();

  // ---- Wachstum: gleiche Slider-Bausteine, eigener Filter-State ----
  erstelleDualSlider(document.getElementById('f2-chats'), {
    max: rohdaten.maxChatAnzahl,
    onChange: (lo, hi) => {
      wachstumFilterState.chatsMin = lo;
      wachstumFilterState.chatsMax = hi;
      document.getElementById('f2-chats-readout').textContent = `${lo} – ${hi}`;
      zeichneWachstumChart();
    },
  });

  erstelleTriStateSlider(document.getElementById('f2-bank'), document.getElementById('f2-bank-ticks'), {
    onChange: (wert) => {
      wachstumFilterState.bank = wert;
      zeichneWachstumChart();
    },
  });

  const uniSelect = document.getElementById('f2-uni');
  for (const name of rohdaten.universitaeten) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    uniSelect.appendChild(option);
  }
  uniSelect.addEventListener('change', () => {
    wachstumFilterState.uni = uniSelect.value;
    zeichneWachstumChart();
  });
  // Quelle der Nutzer (siehe quelleProPerson in ladeDaten).
  document.getElementById('f2-quelle').addEventListener('change', (e) => {
    wachstumFilterState.quelle = e.target.value;
    zeichneWachstumChart();
  });
  document.getElementById('f-quelle').addEventListener('change', (e) => {
    filterState.quelle = e.target.value;
    zeichneCharts();
  });

  statusWachstumEl.textContent = 'Daten geladen.';
  zeichneWachstumChart();

  zeigeOsFreigabenAnteil();
  zeichneOrganischChart();
  zeichneEinladungenChart();

  zeichneOnboardingFunnel();

  zeigeBenachrichtigungenAktiviertAnteil();

  zeigeChatHealthKennzahlen();
  zeichneChatHealthChart();

  zeichneBankHealth();

  zeichneDropHealth();
  zeichneGruppenChart();
  zeichneFreundeVorfinden();
  zeichneBonusSignale();
}

// Bei OS-Theme-Wechsel Charts neu zeichnen, damit Achsen-/Textfarben
// (aus CSS-Variablen gelesen) zum neuen Modus passen.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themeState === 'system') zeichneAlleChartsNeu();
});

initialisiereBlaetter();
initialisiereEinstellungen();
main().then(aktualisiereTracking);
setInterval(aktualisiereTracking, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void aktualisiereTracking();
});
