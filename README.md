# DropChat Dashboard Dev

Kopie des alten Dashboards (`/Users/hsg/drop-app/dashboard_live`), verbunden mit der neuen App
(Projekt **dropchat-dev**, `zkfvswurdsjqtsvqnjge`). Promoter-Programm entfernt.

Statische Seite ohne Server und ohne Service-Key. Anmeldung per E-Mail-Code (Supabase Auth).
Ob jemand etwas sieht, entscheidet allein die Datenbank: nur wer in `dashboard_admin` steht
(`dashboard_ich`, `_dashboard_pruefen`). `config.js` enthält nur öffentliche Werte
(Projekt-URL und Publishable-Key, dieselben wie in der App). **Nie** einen Service-Key eintragen.

## Lokal starten

```bash
python3 -m http.server 8800 --bind 127.0.0.1 --directory "/Users/hsg/Desktop/DropChat Dashboard Dev"
```

Dann <http://127.0.0.1:8800> öffnen.

## Einrichten (einmal, in dropchat-dev)

1. Supabase → Authentication → Email Templates → **Magic Link**: den Code einsetzen, z. B.
   `<p>Dein Anmeldecode: <strong>{{ .Token }}</strong></p>`
2. Supabase → Authentication → Users → **Invite user** mit deiner E-Mail.
3. Als Admin eintragen (Migration oder SQL):

   ```sql
   insert into public.dashboard_admin (auth_user_id, notiz)
   select id, 'Felix' from auth.users where email = 'deine@adresse.at'
   on conflict (auth_user_id) do nothing;
   ```

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `app.js` | Login (E-Mail-Code), danach weiter zu `dashboard.html` |
| `dashboard.html`, `dashboard.js` | die Auswertungen |
| `sitzung.js` | prüft den Zugang, holt die Daten über Datenbankfunktionen (`dashboard_tabelle`, `dashboard_kosten` …) |
| `finapiKosten.js` | Kostenrechnung; Preise aus `dashboard_finapi_preise` |
| `tracking-metriken.js` | Öffnungen und Verweildauer (Retention) |
| `config.js` | öffentliche Projekt-URL und Publishable-Key |

## Zugang entziehen

```sql
delete from public.dashboard_admin
 where auth_user_id = (select id from auth.users where email = 'name@adresse.at');
```

## Stand (14.11.2026)

Geprüft auf dropchat-dev: alle 27 Datenquellen (inkl. `bonus_mitglied`) von `dashboard_tabelle` sowie `dashboard_ich`,
`dashboard_kosten`, `dashboard_trennung`, `dashboard_nutzerliste` und die Bonus-Funktionen (`dashboard_bonus`, `dashboard_bonus_einstellungen`, `dashboard_bonus_ablaufen`) laufen ohne Fehler. Die Login-Seite
lädt ohne Konsolenfehler.

## Offen

- Kein Admin in `dashboard_admin` auf dev → noch niemand kann sich anmelden (siehe „Einrichten“).
- Bonus: Auszahlungen sind nur eine Liste (was DropChat aus übernommenen Bonusforderungen überweisen muss);
  „als ausbezahlt markieren“ gibt es nicht, weil es keine Auszahlungs-Tabelle gibt (`mds/Ziel-Bonus.md`).
- Retention und Bank-Funnel füllen sich erst mit dem neuen iOS-Build (die App schreibt `screen_besuch` und
  `bank_flow_event` ab jetzt). Ältere Zeiträume bleiben leer. Den Screen „drop“ gibt es nicht mehr.
- Probelauf der Inaktivitäts-Trennung: Weg geprüft (CORS, Nicht-Admins werden abgelehnt), mit Admin-Login noch
  nicht durchgespielt.
- Veröffentlichen (GitHub Pages) ist nicht eingerichtet; die alte Action lag im Repo `drop-app`.
