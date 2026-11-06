# dashboard_live – das neue Dashboard

Statische Seite ohne Server und ohne Service-Key. Anmeldung per E-Mail-Code
(Supabase Auth). Ob jemand etwas sieht, entscheidet allein die Datenbank:
nur wer in `dashboard_admin` steht (`dashboard/sql/dashboard_zugang.sql`).

Die Seite enthält nur öffentliche Werte (`config.js`: Projekt-URL und
Publishable-/Anon-Key – dieselben wie in der App). **Nie** einen Service-Key
(`sb_secret_…`) hier eintragen.

## Einrichten (einmal)

1. Im SQL-Editor ausführen, in dieser Reihenfolge:
   `dashboard/sql/dashboard_zugang.sql`, `dashboard/sql/dashboard_lesen.sql`,
   dann `dashboard/sql/dashboard_schreiben.sql`.
   Und die Edge Function `bank-waechter` neu deployen (Probelauf aus dem
   Dashboard; ohne System-Schlüssel nur noch Probelauf).
2. Supabase → Authentication → Email Templates → **Magic Link**: den Text so
   ändern, dass der Code drinsteht, z. B.

   ```
   <h2>DropChat Dashboard</h2>
   <p>Dein Anmeldecode: <strong>{{ .Token }}</strong></p>
   <p>Gültig für kurze Zeit. Nicht weitergeben.</p>
   ```

   Die App nutzt diese Vorlage nicht (sie meldet sich per SMS bzw. Passwort an).
3. Supabase → Authentication → Users → **Invite user** mit deiner E-Mail
   (oder eine bestehende Adresse verwenden).
4. Als Admin eintragen (SQL-Editor):

   ```sql
   insert into public.dashboard_admin (auth_user_id, notiz)
   select id, 'Felix' from auth.users where email = 'deine@adresse.at'
   on conflict (auth_user_id) do nothing;
   ```

## Lokal starten

```bash
python3 -m http.server 8800 --bind 127.0.0.1 --directory dashboard_live
```

Dann <http://localhost:8800> öffnen. Die Seite spricht direkt mit der
Live-Datenbank.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `app.js` | Login (E-Mail-Code), danach weiter zu `dashboard.html` |
| `dashboard.html`, `dashboard.js` | die Auswertungen |
| `sitzung.js` | prüft den Zugang, holt die Daten (`dashboardFetch` statt des alten Servers) |
| `finapiKosten.js` | Kostenrechnung; die Preise kommen aus `dashboard_finapi_preise` |
| `tracking-metriken.js` | Rechnung für Öffnungen und Verweildauer (01 Retention) |
| `config.js` | öffentliche Projekt-URL und Anon-Key |

finAPI-Preise ändern (z. B. neuer Vertrag): nur die Zeile in
`dashboard_finapi_preise` anpassen – nicht im Code, der wird öffentlich.

## Veröffentlichen (GitHub Pages)

`drop-app` bleibt privat. Die GitHub Action
`.github/workflows/dashboard-veroeffentlichen.yml` kopiert bei jedem Push auf
`main`, der `dashboard_live/` ändert, **nur** die `.html`-, `.js`- und
`.png`-Dateien und das Manifest
ins öffentliche Repo `feklug/dropchat-dashboard`. Vorher prüft
`.github/scripts/dashboard-pruefen.mjs`, dass kein Service-Key, Secret-Key,
privater Schlüssel oder eine fremde Dateiart dabei ist – sonst wird nichts
veröffentlicht. Lokal prüfen:

```bash
node .github/scripts/dashboard-pruefen.mjs dashboard_live
```

(Lokal meldet es `README.md` als nicht erlaubt – die Action kopiert sie
nicht mit.)

Einmal einrichten:

1. GitHub → **New repository** `dropchat-dashboard`, **Public**, mit
   „Add a README file“ (die Action ersetzt sie).
2. Im neuen Repo: Settings → **Pages** → Source „Deploy from a branch“,
   Branch `main`, Ordner `/ (root)`.
3. Im neuen Repo: Settings → **Advanced Security** → **Push protection**
   einschalten (blockt erkannte Schlüssel schon beim Hochladen).
4. Token: GitHub → Settings → Developer settings → **Fine-grained tokens** →
   Generate. Repository access „Only select repositories“ →
   `dropchat-dashboard`. Permissions → Repository → **Contents: Read and
   write**. Ablauf z. B. 1 Jahr.
5. In `drop-app`: Settings → Secrets and variables → **Actions** → New
   repository secret `DASHBOARD_DEPLOY_TOKEN` = der Token.
6. `dashboard_live/` und `.github/` committen und pushen – oder in `drop-app`
   unter Actions → „Dashboard veröffentlichen“ → **Run workflow**.

Danach erreichbar unter <https://feklug.github.io/dropchat-dashboard/>
(1–2 Minuten nach dem Lauf). Als Lesezeichen speichern und den Code nur dort
eingeben.

## Nutzerliste (Overview)

Name, E-Mail und Telefonnummer aller registrierten Nutzer kommen aus
`dashboard_nutzerliste()` in `dashboard/sql/dashboard_lesen.sql`. Die
Klartext-Nummer steht nur in `auth.users`; deshalb eine eigene Funktion, die nur
Admins etwas liefert. Nach Änderungen an der Datei: im SQL-Editor neu ausführen.

## Zugang entziehen

```sql
delete from public.dashboard_admin
 where auth_user_id = (select id from auth.users where email = 'name@adresse.at');
```

Wirkt sofort: Die nächste Abfrage der Seite bekommt nichts mehr.

## Stand

- Etappe 1 (Login, Zugangsprüfung): fertig.
- Etappe 2 (Lesen): fertig. Alle Zahlen wie im alten Dashboard.
- Etappe 3 (Schreiben): fertig. Jede Änderung steht in `dashboard_protokoll`
  (wer, was, wann – nur im SQL-Editor lesbar):

  ```sql
  select p.zeit, u.email, p.aktion, p.details
    from public.dashboard_protokoll p left join auth.users u on u.id = p.auth_user_id
   order by p.zeit desc limit 50;
  ```
- Etappe 4 (Veröffentlichen): fertig – Einrichtung siehe oben.
- Etappe 5 (Handy): fertig. Flacher Kopf, Seitenleiste über den Menüknopf, kein
  Hineinzoomen beim Antippen von Feldern. Zum Home-Bildschirm hinzufügen:
  Safari → Teilen → „Zum Home-Bildschirm“ (Icon und Name „Dashboard“).

## Nach dem Umstieg (31.10.2026)

Das alte lokale Dashboard (`dashboard/server.mjs`, `retention.html`,
`retention.config.js`) ist entfernt; es steht in der Git-Historie.
`dashboard/sql/` bleibt – dort liegen die SQL-Dateien dieses Dashboards.

Noch zu tun: den Service-Key in Supabase neu erzeugen (Project Settings →
API Keys) – der alte lag lokal im Klartext. Danach den neuen Key überall
eintragen, wo der alte stand: Vault `cron_schluessel` und Function-Secret
`CRON_SCHLUESSEL` (beide gleich), sonst schlagen die Cron-Jobs fehl.
