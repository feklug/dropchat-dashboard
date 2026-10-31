// DropChat Dashboard (dashboard_live) – Login.
//
// Anmeldung per E-Mail-Code (Supabase Auth, ohne Passwort). Neue Konten
// entstehen hier nie (shouldCreateUser: false) – Admins werden in Supabase
// eingeladen und in dashboard_admin eingetragen
// (dashboard/sql/dashboard_zugang.sql).
//
// Ob jemand rein darf, entscheidet allein die Datenbank (dashboard_ich).
// Was die Seite ein- oder ausblendet, ist nur Darstellung.
(function () {
  'use strict';

  const konfig = window.DASHBOARD_KONFIG;
  const db = window.supabase.createClient(konfig.supabaseUrl, konfig.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const $ = (id) => document.getElementById(id);
  const schritte = ['schritt-email', 'schritt-code', 'schritt-kein-zugang'];
  let email = '';

  function zeige(schritt) {
    for (const s of schritte) $(s).hidden = s !== schritt;
    melde('');
  }

  function melde(text, fehler = false) {
    $('meldung').textContent = text;
    $('meldung').classList.toggle('fehler', fehler);
  }

  function beschaeftigt(knopf, an) {
    knopf.disabled = an;
  }

  // Nach dem Login (oder beim Öffnen mit gespeicherter Sitzung): Datenbank
  // fragen, ob diese Person Admin ist.
  async function pruefeZugang() {
    const { data: sitzung } = await db.auth.getSession();
    if (!sitzung.session) {
      zeige('schritt-email');
      return;
    }
    const { data, error } = await db.rpc('dashboard_ich');
    if (error) {
      console.error('[Dashboard] dashboard_ich fehlgeschlagen:', error);
      zeige('schritt-email');
      melde('Zugang konnte nicht geprüft werden. Bitte erneut anmelden.', true);
      return;
    }
    if (data?.admin === true) {
      location.replace('dashboard.html');
    } else {
      zeige('schritt-kein-zugang');
    }
  }

  async function codeSenden() {
    email = $('email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      melde('Bitte eine gültige E-Mail-Adresse eingeben.', true);
      return;
    }
    beschaeftigt($('code-senden'), true);
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    beschaeftigt($('code-senden'), false);
    // Unbekannte Adressen bekommen dieselbe Antwort wie bekannte – so
    // verrät die Seite nicht, wer einen Zugang hat. Nur echte Störungen
    // (Netz, zu viele Versuche) werden gemeldet.
    if (error && error.status !== 422 && error.code !== 'otp_disabled' && error.code !== 'signup_disabled') {
      console.error('[Dashboard] Code senden fehlgeschlagen:', error);
      melde(error.status === 429 ? 'Zu viele Versuche. Bitte kurz warten.' : 'Code konnte nicht gesendet werden. Bitte erneut versuchen.', true);
      return;
    }
    $('code-hinweis').textContent = `Wenn ${email} freigeschaltet ist, kommt gleich ein Code per E-Mail.`;
    $('code').value = '';
    zeige('schritt-code');
    $('code').focus();
  }

  async function codePruefen() {
    const code = $('code').value.replace(/\D/g, '');
    // Die Länge stellt Supabase ein (Authentication → Email OTP Length, 6–10).
    if (code.length < 6 || code.length > 10) {
      melde('Bitte den ganzen Code aus der E-Mail eingeben.', true);
      return;
    }
    beschaeftigt($('code-pruefen'), true);
    const { error } = await db.auth.verifyOtp({ email, token: code, type: 'email' });
    beschaeftigt($('code-pruefen'), false);
    if (error) {
      console.warn('[Dashboard] Code ungültig:', error.code ?? error.message);
      melde('Code falsch oder abgelaufen.', true);
      return;
    }
    await pruefeZugang();
  }

  async function abmelden() {
    const { error } = await db.auth.signOut();
    if (error) console.error('[Dashboard] Abmelden fehlgeschlagen:', error);
    $('email').value = '';
    zeige('schritt-email');
  }

  $('code-senden').addEventListener('click', codeSenden);
  $('email').addEventListener('keydown', (e) => { if (e.key === 'Enter') codeSenden(); });
  $('code-pruefen').addEventListener('click', codePruefen);
  $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') codePruefen(); });
  $('zurueck').addEventListener('click', () => zeige('schritt-email'));
  $('abmelden-2').addEventListener('click', abmelden);

  pruefeZugang().catch((fehler) => {
    console.error('[Dashboard] Start fehlgeschlagen:', fehler);
    zeige('schritt-email');
    melde('Verbindung fehlgeschlagen. Bitte Seite neu laden.', true);
  });
})();
