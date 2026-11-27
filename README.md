# Daily Ranking Roulette

Lost die Reihenfolge im Daily aus: Die Anwesenden werden auf die Plätze 1..N einer versteckten
„Top N“-Rangliste verteilt (z. B. „F1-Fahrerwertung 1991“). Im Daily geht man die Liste von oben nach
unten durch, am Ende wird aufgelöst, welche Rangliste es war.

- **`/moderator`** (nicht teilen): Team und Anwesenheit, 4 Vorschläge aus gemischten Quellen, Auswahl,
  Losen, Sprecher weiterschalten, Auflösen, Historie der Woche.
- **`/show`** (diesen Tab teilen): nur „#1 Ayrton Senna – Ben“ usw., große Schrift, aktualisiert sich alle 2 s.
  Titel, Quelle und Werte liefert die API erst nach dem Auflösen aus. Tab-Titel ist nur „Daily“.
  Tastatur im Show-Tab: Leertaste / → nächster Sprecher, ← zurück.

## Regeln

- Es werden immer die Plätze 1..N verwendet (N = Anwesende). Eine Rangliste braucht mindestens
  `max(10, N)` Einträge. Gleichstände: Reihenfolge der Quelle, bei World Bank alphabetisch.
- **Gruppen**: Wer dieselbe Gruppe hat (z. B. `FE`, `BE`), spricht immer direkt nacheinander. Ohne Gruppe
  (z. B. Tech-Lead) kann man überall landen. Fehlt ein Gruppenpartner, ist der andere ein Einzelblock.
- **Fairness für #1** (weich): Platz 1 wird gewichtet aus allen Anwesenden gezogen. Gewicht = Dailies seit
  dem letzten eigenen Start, das heutige zählt als 1, maximal 5. Wer diese Woche noch nicht angefangen hat,
  bekommt 5. Danach kommt der eigene Block nach vorn, Rest zufällig. Die Gewichte stehen in der
  Moderator-Ansicht.
- **Historie**: Ein Durchlauf wird beim **Auflösen** gespeichert. Behalten wird nur die aktuelle Woche
  (Mo–So, Europe/Berlin). Verwendete Ranglisten (`used_rankings`) bleiben dauerhaft gespeichert und werden
  nie wieder vorgeschlagen. Ein Testlauf lässt sich in „This week“ löschen, dann wird auch seine Rangliste
  wieder frei.
- **Team**: „Remove“ verschiebt Personen zu „Former members“ (wiederherstellbar), dort kann man sie endgültig
  löschen. Namen in alten Durchläufen bleiben erhalten.

## Quellen

Jede Quelle ist ein Modul in `src/server/sources/` mit dem Interface `Source` (`types.ts`) und wird in
`registry.ts` eingetragen. IDs sind stabil, z. B. `f1:drivers:2021`, `worldbank:SP.DYN.TFRT.IN:1985:desc`,
`wikidata:cities:Q183`, `curated:mohs-hardness-scale`.

| Quelle | Details |
|---|---|
| Kuratierte Listen | `data/curated-lists.json`, 21 Listen. **Von einem LLM entworfen, noch ungeprüft** (`"reviewed": false`). Sie werden trotzdem vorgeschlagen, aber im Moderator-View als UNREVIEWED markiert. Bitte prüfen und auf `true` setzen. |
| Formula 1 (Jolpica) | Fahrer- (ab 1950) und Konstrukteurswertung (ab 1958) bis zur letzten abgeschlossenen Saison. Antworten werden dauerhaft gecacht. |
| World Bank | Kuratierte Indikatoren in `worldbank-indicators.ts` (Indikator × Jahr × Richtung). Aggregate wie „Euro area“ werden über `region.id = "NA"` gefiltert, leere Werte ignoriert. |
| Wikidata | SPARQL-Vorlagen in `wikidata.ts`: Berge, Städte, Flüsse, Seen, Wolkenkratzer, Stadien, Filme nach Einspielergebnis. Die Datenqualität schwankt, deshalb gibt es Filter: keine abgerissenen Objekte, Obergrenzen, Duplikate raus. Rangliste in der Vorschau ansehen und bei Bedarf neu würfeln. Abfragen dauern teils 30–50 s. |

Alle Quellen filtern Ranglisten heraus, bei denen die Top 10 größtenteils denselben Wert haben (z. B. zehn
Länder mit 0 % Wald). Inhalte sind englisch, ebenso die UI. Wikidata-Labels lassen sich per
`WIKIDATA_LANGUAGE=de,en` auf Deutsch umstellen.

## Lokal entwickeln

Voraussetzung: Node 22.12+ (getestet mit Node 26). Docker und ein lokales Postgres sind nicht nötig:
Ohne DB-Konfiguration läuft ein eingebettetes Postgres (PGlite) in `.data/pglite`.

```powershell
npm install
npm run dev        # http://localhost:3000/moderator  und  http://localhost:3000/show
npm test           # Losen/Fairness, Parsen/Filtern der Quellen, kompletter Ablauf (PGlite in-memory)
npm run typecheck
npm run build; npm start   # Produktions-Build lokal (Port 3000, PORT überschreibbar)
```

Lokale Daten zurücksetzen: Server stoppen, `.data` löschen.

| Variable | Standard | Zweck |
|---|---|---|
| `DATABASE_URL` oder `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | – (PGlite) | Postgres. `DB_HOST` darf ein Cloud-SQL-Socket-Verzeichnis sein. |
| `TEAM_TIME_ZONE` | `Europe/Berlin` | Tag/Woche für die Historie |
| `FAIRNESS_MAX_WEIGHT` | `5` | Obergrenze des Gewichts für #1 |
| `MIN_ENTRIES` | `10` | Mindestlänge einer Rangliste |
| `SUGGESTION_SLOTS` | `4` | Anzahl Vorschläge |
| `WIKIDATA_SPARQL_URL` | `https://query.wikidata.org/sparql` | Endpoint, falls Wikidata umzieht |
| `WIKIDATA_LANGUAGE` | `en` | Label-Sprache(n) |
| `HTTP_USER_AGENT` | generisch | User-Agent für externe APIs (Wikimedia wünscht Kontaktangabe) |
| `HTTP_TIMEOUT_MS`, `WIKIDATA_TIMEOUT_MS` | 25000, 55000 | Timeouts |

## Aufbau

```text
src/server/   Express-API (TypeScript)
  draw.ts         Losen: Blöcke, gewichteter Platz 1, Zufall
  fairness.ts     Gewichte aus den Durchläufen der Woche
  service.ts      Ablauf: Session, Vorschläge, Losen, Auflösen, Historie
  repo.ts         SQL;  db/  Verbindung (pg oder PGlite) und Migrationen
  sources/        Quellen-Plugins
src/client/   React-Oberfläche (Vite): pages/Moderator.tsx, pages/Show.tsx
src/shared/   gemeinsame Typen
data/         kuratierte Listen
tests/        Vitest
deploy/       deploy.ps1
```

Datenbank: `members`, `runs` (nur aktuelle Woche), `used_rankings` (dauerhaft), `app_state` (laufende Session),
`api_cache`. Migrationen liegen in `src/server/db/migrations.ts`, laufen beim Start automatisch und jeweils
nur einmal.

## Deployment (GCP)

| Ressource | Name |
|---|---|
| Projekt / Region | `daily-rotation-21311` / `europe-west1` |
| Cloud Run | `daily-rotation`, scale to zero, max. 1 Instanz, nur über IAP erreichbar |
| Datenbank | `daily_rotation` (User `daily_app`) auf der bestehenden Cloud-SQL-Instanz `dynasty-gm-db` (Projekt `dynasty-gm-515120`). Keine Zusatzkosten. |
| Secret | `daily-db-password` |
| Images | Artifact Registry `daily` |

```powershell
.\deploy\deploy.ps1 -Setup     # einmalig: Projekt, APIs, Service-Account, DB + User, Secret
.\deploy\deploy.ps1            # Image bauen (Cloud Build, Tag = Git-Commit) und deployen
.\deploy\deploy.ps1 -SkipBuild # nur Konfiguration mit letztem Image
```

**IAP einmalig einrichten.** Das Projekt hat keine Google-Organisation, deshalb braucht IAP einen eigenen
OAuth-Client (gleiches Vorgehen wie bei Dynasty GM / swgoh-mitth):

1. Cloud Console im Projekt `daily-rotation-21311` → *Google Auth Platform*. Falls nötig zuerst
   *Branding* anlegen: App-Name z. B. „Daily Rotation“, Support-E-Mail = dein Konto, Zielgruppe *Extern*.
   Unter *Zielgruppe* dein Konto als Testnutzer eintragen.
2. *Clients* → *Client erstellen*, Typ *Webanwendung*, Name z. B. `daily-rotation IAP`.
   Nach dem Anlegen als autorisierte Weiterleitungs-URI eintragen:
   `https://iap.googleapis.com/v1/oauth/clientIds/<CLIENT_ID>:handleRedirect`
3. Client-Secret in eine Datei außerhalb des Repos speichern, dann
   `.\deploy\deploy.ps1 -SkipBuild -IapClientId <CLIENT_ID> -IapClientSecretFile <pfad>` ausführen
   und die Datei danach löschen.

Zugriff hat nur das Google-Konto, mit dem `gcloud` beim Deploy angemeldet ist (`roles/iap.httpsResourceAccessor`).
