# COLLECTIVE-CONTEXT.md — inFactory@ /Studio

> Projekt-spezifisches Wissen für alle AI-Sessions am Studio-Projekt.
> Meta-Themen (Server-Workflow, Memory, Generations-Transfer): **Root-CC**
> (`fb-data/COLLECTIVE-CONTEXT.md`, on-demand via AGENTS.md-Trigger-Tabelle).
>
> **Zuletzt aktualisiert:** 2026-04-15, AI25 (Schlankheitskur 471 → ~290 Zeilen)

---

## Aktive Sessions

| Session | Rolle | Stand |
|---|---|---|
| **AI24** | Hauptsession | DONE — CLI-MIGRATION-BRIEFING.md erstellt, AI25 gestartet |
| **AI025** | Parallele Dev + Peer-Review + CC-Maintainer | **Session-Abschluss 2026-04-22.** CLI-M1 + M3.6 geliefert, dann Rollen-Shift zu Peer-Reviewer für AI026/AI028: Prompts, CC-Schlankheitskur (471→266), Server-Workflow-Regeln, Live-Debug-Sparring. Drei Meta-Memory-Einträge hinterlassen: `feedback_briefing_fehler_korrigierbar`, `feedback_peer_review_rolle`, `feedback_prompt_engineering_fuer_sessions`. |
| **AI026** | Parallele Dev | CLI-M2+M3+M4+M5(a)+M5.1 DONE — 26 Commands + ghost-api.ts TS-Port (355 LOC, 19 Tests, 0 Lint-Errors). **Nächste Phase: M5.2 (build)**. |
| **AI028** | Session-Abschluss | CLI-M5.2..M5.X + M5.4.1 + install.sh-Preflight DONE. 450 Tests grün, 0 Lint-Errors. M5.4 Live-validated 2026-04-22. **M5.5 + M5.3 Live-Validierung warten auf DevOps**. **M6 (ARCHIVIERUNG, nicht Löschung) geplant**. |

---

## Offene DevOps-Validierungen (prominent — zuerst lesen!)

> **Regel für AI-Sessions:** Bevor eine Phase als „vollständig validiert" gemeldet wird,
> gegen diese Liste abgleichen. Offene Punkte nicht eigenmächtig als erledigt markieren —
> nur der Human DevOps kann Live-Tests mit echten Credentials freigeben und bestätigen.

### M5.3 `deploy` — Live-Test mit echter Ghost-Instance (verschoben)

**Status:** Code produktiv auf `025-CBU-5025` (Commit `b66f95c`). Flag-Validation,
Credentials-Fehlerpfad und Help-Render sind am Server verifiziert. **Live-Upload +
Aktivierung gegen eine echte Ghost-Instance ist offen.**

**DevOps-Entscheidung (2026-04-21):** Live-Smoke mit echter URL und Admin-Key wird
auf einen späteren Zeitpunkt verschoben. M5.3 ist mit *Flag-Validation + Dry-Run-
Logik bestätigt* abgeschlossen, nicht mit End-to-End-Upload.

**Was am Server verifiziert ist** (ohne echte Credentials):
- `infactory deploy --help` — alle Flags inkl. `--ghost-url` + `--admin-key` sichtbar,
  ENV-Marker `[env: INFACTORY_GHOST_URL]` korrekt.
- `infactory deploy --preset=steirischursprung` ohne Credentials → Exit 1 mit
  „`--ghost-url fehlt`". Kein Admin-Key-Leak in der Fehlermeldung (Credential-Policy
  hält).

**Was noch zu tun ist wenn aufgegriffen:**

1. **Ziel-Instance klären:** Existiert die geplante Ghost-Instance noch? Gesundheits-Check:
   ```
   curl -sI https://<ghost-url>/ghost/api/admin/themes/ | head -3
   ```
   `HTTP/2 401` → Ghost läuft (Auth erwartet, OK). `000`/Timeout → Instance nicht
   erreichbar, Deploy entfällt.

2. **Credentials beschaffen:** Ghost Admin → Settings → Integrations → Custom
   Integration. Admin-API-Key hat Format `<id>:<secret>`.

3. **Credentials via ENV, nicht als Flag** (landet nicht in `~/.bash_history`):
   ```
   export INFACTORY_GHOST_URL='https://<ghost-url>'
   export INFACTORY_GHOST_KEY='<id>:<secret>'
   ```

4. **Reihenfolge:**
   ```
   # a) Dry-Run — Build + ZIP lokal, kein HTTP-Call
   cd /tmp && infactory deploy --preset=steirischursprung --dry-run --verbose

   # b) Upload only (SAFETY — Theme in Ghost aber inaktiv)
   cd /tmp && infactory deploy --preset=steirischursprung --skip-activate --verbose

   # c) NUR nach explizitem DevOps-Go: Upload + Activate (Production-Blog wechselt Theme)
   cd /tmp && infactory deploy --preset=steirischursprung --verbose

   # Am Ende:
   unset INFACTORY_GHOST_KEY INFACTORY_GHOST_URL
   history -c
   ```

5. **Rollback falls Activate-Problem:** Ghost Admin → Einstellungen → Design → altes
   Theme wieder aktivieren. ZIP kann via Ghost Admin manuell gelöscht werden.

6. **Nach Live-Bestätigung:** diesen Abschnitt aus der Liste entfernen, M5.3-Zeile in
   der Phasentabelle um "Live-validated YYYY-MM-DD" erweitern.

**Safety-Hinweise:**
- Admin-Key niemals in Commits, Logs, Screenshots, CC-Texte oder Slack-Messages.
- `--skip-activate` ist der Default-Safety-Net für den ersten Live-Test.
- Bei fehlgeschlagener Aktivierung (HTTP-Fehler) throws `DeployError` — Exit 1 mit
  Hinweis auf manuelle Aktivierung in Ghost Admin. Blog bleibt auf altem Theme.

### M5.5 `images` — Live-Audit + ggf. Migration (verschoben)

**Status:** Code produktiv nach Install + Push. 4 Subcommands (audit/migrate/list/upload) + ghost-config.ts (extracted) + 9 Pure-Function-Tests + 3 dedizierte Path-Traversal-Security-Tests + 4 Command-Smoke-Tests. **Live-Tests gegen echte Ghost-Instance + Archiv stehen aus.**

**Was am Server verifiziert ist** (ohne echte Credentials):
- `infactory images audit --help`, `images migrate --help`, `images list --help`, `images upload --help` — alle Flags sichtbar.
- Required-Flag-Fehlerpfad ohne Credential-Leak.
- 343 Tests grün, inkl. Path-Traversal-Härtung (`../`-Fragmente werfen `ImagesError`).

**Was zu tun ist wenn aufgegriffen:**

1. **Read-Only zuerst — `images list`** (zeigt Ghost-lokal vs. extern):
   ```
   export INFACTORY_GHOST_URL='https://<ghost-url>'
   export INFACTORY_GHOST_KEY='<id>:<secret>'
   infactory images list --verbose
   ```

2. **`images audit`** (scannt nach externen URLs eines spezifischen Hosts):
   ```
   infactory images audit --hostname=<alt-host>.at --archive=<lokales-archiv-verz>
   ```

3. **`images upload <file>`** als Einzeldatei-Test:
   ```
   infactory images upload <test.png>
   ```

4. **`images migrate --dry-run` zuerst** (kein Upload, kein Page-Update):
   ```
   infactory images migrate --hostname=<alt>.at --archive=<dir> --dry-run --verbose
   ```

5. **Echter migrate-Run nur mit DevOps-Go** (schreibt produktive Pages). Empfehlung: `--slug=<einzelne-page>` als Filter für ersten realen Lauf.

**Safety-Hinweise:**
- `images migrate` schreibt produktive Pages (Lexical + feature_image). Bei Upload-Fehler wird Page-Update übersprungen (kein partieller State).
- ghost-deduplizierung via `?ref=<original-url>` Query-Param verhindert Doppel-Uploads bei Re-Run.
- Path-Traversal-Härtung in `urlToLocalPath` (siehe Memory + CC).
- Admin-Key-Policy strikt (CLI/ENV/.infactory.json — NIE preset.yaml, NIE in Logs).

---

## Server-Interaktions-Workflow

> Grundregeln (HTTPS/curl only, kein SSH/scp, Distribution-Pipeline,
> Staging-Optionen): **Root-CC §Server-Interaktion**.
>
> Studio-spezifische Kurzform: Jede CLI-M-Phase braucht vor dem Server-Test
> einen Sync-Commit in `git/xed/Studio/`. Produktiver Test-Modus via
> `INFACTORY_KEEP_SYMLINK=1` auf main, Rollback via `git revert`.

---

## Projekt-Snapshot: `infactory-cli-v2/`

Eine komplette Neuentwicklung der inFactory CLI auf **oclif** (TypeScript, ESM),
parallel zur bestehenden `infactory-cli/` (CommonJS). Architektur-Begründung
und Ziel-Bild: `docs/CLI-MIGRATION-BRIEFING.md` (insb. §1+§2 zu „warum oclif
statt Bash").

**Fertige Command-Namespaces** (Details: `infactory --help` + Git log):

| Namespace | Commands | Phase | Owner |
|---|---|---|---|
| `infactory health` | `health [--fix]` | CLI-M1 | AI25 |
| `infactory admin` | `create`, `list`, `set-role`, `reset-password`, `delete` | CLI-M1 + M4(c) | AI25 + AI26 |
| `infactory site` | `init`, `create`, `update`, `status` | CLI-M2 + M3.6 | AI025 + AI026 |
| `infactory server` | `start`, `stop`, `restart` | CLI-M3 | AI26 |

**Shared Libs** unter `src/lib/`:

- `config.ts` — TLD-Discovery (`/var/xed/` via `INFACTORY_SITE_BASE` Override)
- `systemd.ts` — Service-Lifecycle + Unit-File-Rendering
- `site.ts` — Secrets, Env-File Read/Write, DB-Permissions
- `payload.ts` — pnpm/git-Wrapper
- `nginx.ts` — Location-Snippet-Renderer
- `services.ts` — Multi-Site-Orchestrierung für `server start/stop/restart`
- `http.ts`, `output.ts` — curl-Wrapper, TTY-aware Farben

**Design-Entscheidungen** (aktionsrelevant für Folge-Sessions):

- **Kein `sudo`** — CLI läuft als root auf dem Server
- **Multi-Site-fähig** — optionales `[tld]`-Arg (ohne Arg → alle konfigurierten)
- **Exit-Code 1 bei Failure** → cron-tauglich
- **Lib-Naming `services.ts` (nicht `server.ts`)** — CLI-Topic `server` bleibt für zukünftige infactory-express-Commands frei (`server logs`, `server reload-config`)
- **Flag-vs-Arg-Konvention** (AI028, M5.2) — durchgängige Linie für M5.3/M5.4:
  - **TLD-Operationen: positional `<tld>`** (z.B. `site create steirischursprung.at`, `admin create <tld> <email>`). Grund: TLD ist das Subjekt des Commands, mehrere TLDs sind möglich.
  - **Preset-Operationen: `--preset=<id>` Flag** (z.B. `build --preset=agency`, später `deploy --preset=agency`, `qa --preset=agency`). Grund: Preset ist ein Attribut der Build-Operation, User-Continuity zur Legacy-CLI (`infactory build --preset=...`).
  - **Error-Semantik in Lib-Code:** Build/Deploy ist all-or-nothing → **`throw` mit typisierter Error-Klasse** (z.B. `BuildError`). HTTP-Calls in `ghost-api.ts` sind retry-fähig → **Result-Type `GhostHttpResponse<T>`**. Keine Vermischung.
- **Ressourcen-Lookup** (AI028, M5.2.1) — `presets/`, `base-theme/`, `sections/registry.json`: **Explicit-Flag → CWD → `/opt/infactory/infactory-cli` → fail**. Workstation-Dev setzt entweder CWD oder `--presets=<pfad>`. Die Legacy-CLI bleibt Single-Source für Ressourcen bis M6. Helper: `resolveResourcePath` + `resolveRegistryPath` in `src/lib/resolve-resources.ts` — für M5.3 (deploy) und M5.4 (qa) wiederverwendbar.
- **Credential-Policy für Deploy** (AI028, M5.3) — Admin-Keys (Ghost `id:secret`) sind die sensibelste Daten-Kategorie im Projekt:
  - **NIE in Preset-YAMLs** — Presets sind potenziell teilbar/commitbar; Keys bleiben in ENV oder `.infactory.json` (lokal, nicht committed).
  - **NIE in Logs/Errors** — `DeployError`-Messages enthalten niemals den vollen Key oder JWT. Verbose-Logs zeigen nur `keyId` (public-Teil vor `:`). Upload-Response-Body wird nicht in Error-Messages durchgereicht (könnte Echo enthalten).
  - **Config-Priority für ghost-url + admin-key:** CLI-Flag > `INFACTORY_GHOST_URL`/`INFACTORY_GHOST_KEY` ENV > `.infactory.json` Feld `deploy.{url,key}`. Nicht aus `preset.yaml`.
  - **Test-Fixtures:** nur Dummies (`deadbeef:cafebabe12345678`), echte Keys nie committen.
- **Activate-Failure ist FATAL** (AI028, M5.3) — `deploy` ohne `--skip-activate` impliziert: Theme läuft nach dem Command. Ein silent-Exit-0 bei fehlgeschlagener Aktivierung versteckt Fehler (Blog zeigt altes Theme). Daher: Upload OK + Activate Fehler → `DeployError` mit Hinweis auf `Ghost Admin → Design`. Bewusste UX-Verbesserung gegenüber Legacy-CLI (die warnte nur).
- **Interaktive Prompts werden zu Flags** (AI028, M5.3) — Legacy-CLI hatte `confirm("Activate now?")`-Style Prompts. In v2 sind alle Ja/Nein-Fragen Flags (`--skip-activate`, `--dry-run`, `--skip-build`) — CI-/Cron-tauglich, skriptbar.
- **Flag-Aliases bei Rename** (AI028, M5.3) — oclif `Flags.string({aliases: ['url']})` erlaubt sanfte Umbenennung ohne Breaking-Change. `--url`/`--key` bleiben bis M6 gültig, Help zeigt die neuen Namen `--ghost-url`/`--admin-key`. Bei zukünftigen Renames gleiches Pattern.
- **Venv-Resolver als UX-Fix** (AI028, M5.4) — Die Legacy-CLI hatte `crawler/bin/.venv` hartcodiert (Workstation-only, Server-kaputt). `lib/resolve-venv.ts` etabliert Priority-Kette **ENV `INFACTORY_VENV` → `<cwd>/venv` → `/opt/infactory/venv` → fail**, werks-tauglich für beide Umgebungen. Zusätzlicher Export `resolvePythonScript(name)` findet Legacy-Python-Helper wie `extract-structure.py` via `<cwd>/src/<name>` → `/opt/infactory/infactory-cli/src/<name>` → fail. Python-Code bleibt bis M6 in der Legacy-CLI (nicht nach v2 syncen) — M6 macht die komplette Verlagerung auf einmal, nicht stückweise.
- **QA non-fatale Sensoren** (AI028, M5.4) — `qa compare` nutzt drei Sensoren (Pixel via odiff-bin, CSS-Tokens via shot-scraper+getComputedStyle, Struktur via shot-scraper+crawl4ai). **Sensor-Ausfälle sind non-fatal:** wenn ein Sensor fehlschlägt, bleiben die anderen aktiv und das `null`-Feld im Report zeigt den Ausfall. **Infrastruktur-Fehler (kein venv, outputDir nicht beschreibbar) sind fatal** und werfen `QaError`. Gewichtung: Struktur 40% + Pixel 35% + CSS 25% (aus Legacy übernommen). **Sensor 1 nutzt `odiff-bin`** (nicht pixelmatch — pixelmatch wurde nie verwendet, war nur Annahme im Briefing).
- **Geteilte Ghost-Credentials** (AI028, M5.5) — `lib/ghost-config.ts` exportiert `resolveGhostConfig` (CLI > ENV > `.infactory.json`) + `requireValidCredentials(resolved, errorFactory?)`. Genutzt von deploy + images. Caller injiziert die konkrete Error-Klasse via `errorFactory: (msg) => new MyError(msg)` — kein wrap-try/catch-Boilerplate. `resolveDeployConfig` bleibt als deprecated-Re-Export für Tests.
- **Images Path-Traversal-Härtung** (AI028, M5.5) — Legacy `urlToLocalPath` hatte keinen Schutz vor `../`-Escape aus dem Archiv. M5.5 ergänzt `path.resolve()` + `startsWith(archiveRoot + sep)`-Check. Defense-in-depth: WHATWG-URL-Parser normalisiert `..` zwar bereits in URL-Strings, aber Caller können auch nackte Pfad-Fragmente übergeben. Drei dedizierte Security-Tests (URL-Normalisierung, Pfad-Fragment-Escape, reines `..`-Fragment) — explizit, nicht als Nebenprodukt anderer Tests.
- **Images Migration ist Archiv-basiert** (AI028, M5.5) — `migrate` lädt KEINE externen URLs runter (kein SSRF-Vektor). Bilder müssen vorher lokal verfügbar sein (z.B. wget/rsync), Resolver mappt URL → `<archive>/<pfad>`. Bei Upload-Fehlern wird Phase 3 (Page-Updates) ÜBERSPRUNGEN — partielle Migrationen würden Pages inkonsistent lassen. `--dry-run` als Default-Empfehlung für ersten Lauf.
- **Dead-Code-Vermeidung bei Library-Ports** (AI028, M5.X) — Beim Port von `html-to-lexical.js` wurde via grep festgestellt, dass `createPage`/`createPost` aus `ghost-api.js` in der gesamten Legacy-CLI **keinen Caller** haben (nur Library-Exports für ad-hoc-Scripts). Bewusst NICHT portiert — sie kommen mit dem ersten realen Caller-Command (hypothetisches `infactory pages import`) mit echten Requirements. Pattern: vor Library-Port immer `grep -rn "$func" outside-the-defining-file/` für externe Caller. Keine spekulative Portierung.
- **htmlToLexical: pure regex** (AI028, M5.X) — Briefing erwartete cheerio. Realität: pure regex-basierter Tokenizer + State-Stack, **keine externe HTML-Parsing-Dep**. Die Lib generiert Lexical-Subset (paragraph/heading/image/list/horizontalrule/html-Card). Unbekannte/komplexe HTML-Tags fallen zu html-Card (kein Throw, kein Strict-Mode — YAGNI). Returnt `{}` für leeren Input (Convention: `spread {...htmlToLexical(html)}` ergibt dann kein Override-Override).
- **Fix-by-Principle statt Ad-hoc-Debug** (AI028, M5.4.1) — Als am Server ein shot-scraper-Bug aufgeschlagen ist (PLAYWRIGHT_BROWSERS_PATH fehlt in User-Shell), war der erste Instinkt: "kurz am Server diagnostizieren". Human-DevOps-Pushback: **Nein — Self-Healing via Projekt-Prinzipien** (Server-Autonomie, curl-install idempotent, AI-lesbare Error-Messages). Lösung: (a) `resolvePlaywrightBrowsersPath()` setzt die env-var automatisch beim spawnSync-Call, unabhängig von Shell-Config; (b) `health` validiert QA-Deps vor dem Ausfall mit Fix-Action-Hinweis; (c) QA-Sensor-Fehler enthalten jetzt Actionable-Messages + werden im Report-JSON persistiert; (d) Sensor 3 gibt null statt False-Positive-Score bei leeren DOM-Daten. **Pattern:** jeder Live-Bug wird zu einem Preventiv-Fix, nicht zu tribalem Knowledge. Retrospektive im Memory `feedback_fix_by_principle.md`.
- **M6 Legacy-CLI: ARCHIVIEREN, nicht löschen** (Human DevOps, 2026-04-21) — Die alte `infactory-cli/` wird in M6 **in ein Archiv verschoben**, nicht entfernt. Gilt auch für Legacy-Code-Verzeichnisse, nicht nur für Dateien. Die No-Deletion-Regel aus `~/.claude/CLAUDE.md` erstreckt sich auf alle AI-Agent-Operationen — Verschieben/Umbenennen ist erlaubt, `rm`/`rmdir` nicht. Konkret für M6: `git mv infactory-cli/ archive/infactory-cli-v1/` (oder ähnliches Ziel). Das erhält die Git-History und die Möglichkeit für forensische Rückblicke.

---

## CLI-Migration — Phasenplan

| CLI-M | Scope | Status | Projekt-Roadmap (WHITEPAPER §15) |
|---|---|---|---|
| **M1** | `health` + `admin create` + Shared Libs | ✅ DONE | Schritt A.1 — Compile-Engine |
| **M2** | `site create/update/status` | ✅ DONE | Schritt 1 — dd-starter Fork |
| **M3** | `server start/stop/restart` | ✅ DONE | Schritt 2 — Payload Collections |
| **M3.6** | `site init <tld>` (Track-A-Setup-Port) | ✅ DONE (AI025) | — |
| **M4** | Bash-Scripts zu Bootstrap-Wrappern + Cut-Over | ✅ DONE | Schritt 3 — URL-Importer |
| **M5(a)** | Legacy-Delegation (Hook + 15 Wrapper-Stubs) | ✅ DONE (AI026) | Schritt B — Ghost-Target |
| **M5.1** | `ghost-api.ts` TS-Port (JWT + HTTP + Multipart-Uploads) | ✅ DONE (AI026) | — |
| **M5.2** | `build.ts` + `sections.ts` + `tokens.ts` + nativer `build`-Command | ✅ DONE (AI028) | — |
| **M5.2.1** | `resolve-resources.ts` — Default-Resolver CWD → /opt/infactory/infactory-cli → fail | ✅ DONE (AI028) | — |
| **M5.3** | `deploy.ts` — Build → Upload → Activate via ghost-api.ts (kein JWT-Duplikat) | ✅ DONE (AI028) — Code + Flag/Error-Validation. **Live-Upload-Test offen**, siehe §Offene DevOps-Validierungen | — |
| **M5.4** | `qa compare` — 3-Sensoren (odiff + shot-scraper/CSS + crawl4ai/Struktur), nativ | ✅ DONE (AI028) — Code + Pure-Function-Tests + **Live-validated 2026-04-22** (self-compare 97%, arv-vs-de 37% mit actionable CSS + Struktur-Diffs) | — |
| **M5.4.1** | `qa batch` — Schleife über compare für mehrere Slugs | ✅ DONE (AI028) | — |
| **M5.5** | `images.ts` (audit/migrate/list/upload) + ghost-config.ts (extracted) + Path-Traversal-Härtung | ✅ DONE (AI028) — Code + Pure-Tests + Path-Traversal-Security-Tests. **Live-Audit/Migrate-Test offen**, siehe §Offene DevOps-Validierungen | — |
| **M5.6** | `preset.ts` clone/list/remove + 3 native Subcommands | ✅ DONE (AI028) — Code + Pure-Tests + I/O via tmp-dirs. `--force`-Safety bei remove. | — |
| **M5.X** | `html-to-lexical.ts` + `lexical-types.ts` (Library-Port, ohne createPage/Post — Dead Code) | ✅ DONE (AI028) — Code + 50 Pure-Function-Tests inkl. Inline-Fixtures. createPage/Post kommen mit erstem Caller-Command. | — |
| **M5.4.1** | QA Self-Healing: PLAYWRIGHT_BROWSERS_PATH-Resolver + `health` QA-Deps-Preflight + Actionable Sensor-Errors + Sensor-3-Null-Fix | ✅ DONE (AI028) — Live-Bug (Server-Install) via Fix-by-Principle gelöst statt Ad-hoc-Debug. | — |
| **M5.X** | `html-to-lexical.ts` + `createPage/createPost` in ghost-api.ts | geplant | — |
| **M6** | alte `infactory-cli/` **ins Archiv verschieben** (NICHT löschen), v2 umbenennen | geplant | Schritt C — Brand/Pilot-Pages |

**JWT-Migration-Notiz für CLI-M5.3 (deploy.ts Portierung):** `ghost-api.ts` exportiert jetzt `generateJwt()` als Single-Source-of-Truth. Der alte `deploy.js` hatte seine EIGENE `generateJWT`, die sogar von `ghost-api.js` importiert wurde (circular). Bei der deploy-Portierung MUSS der native Command `generateJwt` aus `lib/ghost-api.ts` importieren und die alte JWT-Logik NICHT mit-migrieren. Solange deploy via Legacy-Stub läuft, nutzt es weiter die alte JWT-Implementierung — kein Konflikt.

**Wichtig:** CLI-M ist eine **orthogonale Achse** zur Projekt-Roadmap. Eine
Session kann gleichzeitig an „Schritt 2 — Payload Collections" UND
„CLI-M2 — site create" arbeiten — das sind verschiedene Baustellen.

---

## CLI-M4 — Audit & Strukturelle Entscheidungen

**Bash-Wrapper-Touchpoints** (in `git/xed/Studio/docs/`):

| Datei | Zu tun |
|---|---|
| `install.sh` | Symlink → v2, `npm install` in beiden CLIs, bleibt Hybrid (Bootstrap + Track-A-Setup) |
| `payload.sh` | Voll-Delegation an `infactory site/admin` |
| `health.sh` | Voll-Delegation an `infactory health [--fix]` |

**Server-Code-Touchpoints (nicht M4, Bewusstsein für M5):**
`infactory-server/src/config.js:58,59,105,110,111`, `.env.example:19 INFACTORY_CLI_PATH=../infactory-cli`.
Bleibt funktional bis `/opt/infactory/infactory-cli/` in das Archiv verschoben wird (CLI-M6). **Wichtig: NICHT löschen, sondern archivieren** — gilt auch für Legacy-Code-Verzeichnisse nach der No-Deletion-Regel.

**Strukturelle Entscheidungen:**

1. **Symlink-Switch:** `/usr/local/bin/infactory` → `infactory-cli-v2/bin/run.js`. Alte CLI direkt via `node /opt/infactory/infactory-cli/bin/infactory.js` weiter aufrufbar für Track-B (CLI-M5).
2. **Doppel-Install:** `install.sh` macht `npm install` in beiden CLIs bis CLI-M6.
3. **Bootstrap-Pattern** für reine Delegationen:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   exec node /opt/infactory/infactory-cli-v2/bin/run.js <command> "$@"
   ```

---

## CLI-M3.6 — `site init <tld>` (geparkt bis nach CLI-M4)

Die Track-A-Setup-Logik (190 Zeilen Bash in `install.sh setup <tld>`:
`/var/xed/<tld>/infactory.json` mit `nginx_sites`-Allowlist,
`infactory-<tld>.service` Port 4368, WordOps-ACLs) wird in CLI-M3.6 nach v2 portiert.

**Naming (AI25, 2026-04-15): `infactory site init <tld>`**

Verworfene Alternativen:
- `service create` — kollidiert mit `server`-Namespace
- `site create --track=a|b` — Flag-Forking, Test-Komplexität, Breaking-Change beim Default

**Resultierender Workflow:**

```bash
infactory site init <tld>      # Track-A Foundation (nginx_sites, ACLs, infactory-service)
infactory site create <tld>    # Payload/Next.js Content-Layer
infactory admin create <tld> <email>
infactory server start
```

**Scope:** Neuer Command `src/commands/site/init.ts` (~250 LOC TS),
neue Lib `src/lib/nginx-allowlist.ts`. Nach M3.6 wird `install.sh setup <tld>`
zu dünner Delegation an `infactory site init <tld>`.

---

## CLI-M4(f) — Server-Test-Playbook

> Grundregeln: **Root-CC §Server-Interaktion**.
> Dieses Playbook ist die projekt-spezifische Konkretisierung für CLI-M4.

**Voraussetzung:** `infactory-cli-v2/` und die neuen Bash-Wrapper sind nach
`git/xed/Studio/` synchronisiert und nach `XED-dev/Studio` gepusht (Schritt 1).

**Staging-Variante:** Root-CC Weg B — Yolo auf main mit `INFACTORY_KEEP_SYMLINK=1`.
`install.sh` hat KEEP_SYMLINK bereits eingebaut.

**Reihenfolge:**

1. **Workstation — Sync + Commit + Push:**
   ```bash
   rsync -av --exclude=node_modules --exclude=dist --exclude=.next \
     /mnt/8100-data/prog/ai/git/edikte/fb-data/dev/bin/XED-Studio/infactory-cli-v2/ \
     /mnt/8100-data/prog/ai/git/xed/Studio/infactory-cli-v2/
   cp /mnt/8100-data/prog/ai/git/edikte/fb-data/dev/bin/XED-Studio/cli-m4/*.sh \
     /mnt/8100-data/prog/ai/git/xed/Studio/docs/

   /usr/bin/git -C /mnt/8100-data/prog/ai/git/xed/Studio/ add infactory-cli-v2/ docs/*.sh
   /usr/bin/git -C /mnt/8100-data/prog/ai/git/xed/Studio/ commit -m "feat(cli): CLI-M4 — infactory-cli-v2 + Bash-Wrapper"
   /usr/bin/git -C /mnt/8100-data/prog/ai/git/xed/Studio/ push origin main
   ```

2. **Server — Install via curl:**
   ```bash
   curl -fsSL https://studio.xed.dev/install.sh | INFACTORY_KEEP_SYMLINK=1 bash
   ```
   Installiert v2 in `/opt/infactory/infactory-cli-v2/`, Symlink bleibt auf alter CLI.

3. **Readonly-Tests** (DevOps per SSH — nur lesend):
   - `ls -la /usr/local/bin/infactory` → muss weiter auf alte CLI zeigen
   - `node /opt/infactory/infactory-cli-v2/bin/run.js health`
   - `node .../bin/run.js site status`
   - `node .../bin/run.js admin list steirischursprung.at`
   - `node .../bin/run.js server restart --help`

4. **Bash-Wrapper-Delegation prüfen** (readonly):
   ```bash
   bash /opt/infactory/docs/health.sh         # delegiert an v2
   bash /opt/infactory/docs/payload.sh status # ruft `infactory site status`
   ```

5. **STOPP** — Rücksprache AI26 ↔ DevOps. Readonly-Validation grün?

6. **Cut-Over** (Breaking-Change — explizite Freigabe):
   ```bash
   ln -sf /opt/infactory/infactory-cli-v2/bin/run.js /usr/local/bin/infactory
   infactory health
   infactory site status
   ```

7. **Produktiv geschaltet:** Durch Schritt 1 bereits aktiv auf studio.xed.dev.

**Rollback:**

```bash
# Server:
ln -sf /opt/infactory/infactory-cli/bin/infactory.js /usr/local/bin/infactory
# Workstation:
/usr/bin/git -C /mnt/8100-data/prog/ai/git/xed/Studio/ revert HEAD
/usr/bin/git -C /mnt/8100-data/prog/ai/git/xed/Studio/ push origin main
```

---

## Koexistenz-Regeln

- `infactory-cli/` (alt, CommonJS) bleibt unverändert, produktiv für Track-B bis CLI-M5
- `infactory-cli-v2/` (neu, oclif/TS) wächst parallel
- Bash-Scripts bleiben Einstiegspunkt bis CLI-M4 komplett durch
- Kein Breaking-Change auf Server bis CLI-M4 abgeschlossen
- Alle neuen Features nur in v2 — nicht in `infactory-cli/` oder Bash-Scripts

## Distribution

**Option A (entschieden 2026-04-15):** `infactory-cli-v2/` bleibt Teil von
`git/xed/Studio/`, Install via `studio.xed.dev/install.sh`. Single-Repo,
eine Release-Pipeline.

## Offene Strukturverbesserung — Distribution-Scope-Policy (für spätere Session)

**Problem (aufgefallen in AI030, 2026-04-23):** Der Sync-Scope von
`fb-data/dev/bin/XED-Studio/` nach `git/xed/Studio/` ist nirgends explizit
dokumentiert. Eine naive `rsync -av --exclude=.git` würde **56 neue Files**
erstmalig von privat nach öffentlich übertragen — darunter interne
Strategie-Drafts (`WHITEPAPER-inFactory-Headless.md`, `STRATEGY-Odoo-vs-*`,
`hardening-whitepaper-*`), Session-Handovers (`docs/session/*-handover.md`)
und archivierte Whitepapers (`docs/archiv/*`).

Das ist ein **Daten-Leak-Risiko** für einen AI-Agenten, der „alle Baustellen
sauber machen" interpretiert als „alles syncen".

**Offene Fragen für spätere Session:**
- Wo ist die Policy dokumentiert, welche Pfade in `fb-data/dev/bin/XED-Studio/`
  für die öffentliche Distribution `git/xed/Studio/` bestimmt sind?
- Sollte es einen **Include-Pattern (rsync --include-from)** oder ein
  **`.distignore`** geben, der den Scope maschinenlesbar festhält?
- Alternativ: Ein dediziertes Sync-Script mit expliziter Pfadliste
  (z.B. `scripts/sync-to-distribution.sh`), das die aktuell manuelle
  rsync-Logik kapselt und explizit macht?

**Aktuelle Zwischenlösung:** Chirurgisch — nur gezielt die Files, die
wirklich gesynct werden müssen. Niemals blind `rsync -av fb-data/ xed/`.

---

## Upstream-Tracking-Workspaces — Erkennungsmuster für AI-Agenten

Wenn du in `fb-data/dev/bin/XED-Studio-Payload/` oder `fb-data/dev/upstream/*`
einen Ordner siehst mit:

- eigenem `.git/`, das NUR `upstream`-Remote kennt (kein `origin`)
- allen Files als `??` untracked
- `git log` zeigt „no commits"

**Das ist KEIN Bug — sondern das inFactory-Upstream-Tracking-Pattern.**

Der Dev-Repo bleibt absichtlich uncommittet. Zweck:
1. `git diff upstream/main` zeigt Abweichungen gegen den Upstream-Fork
2. `rsync -av --exclude='.git' <dev>/ <distribution>/` ist die Sync-Quelle

**Änderungen** werden in die Distribution (`git/xed/<name>/`) geschrieben und
dort committet + gepusht. NICHT den Dev-Repo initialisieren oder `origin`
hinzufügen — das bricht den Upstream-Fork-Workflow.

Aktiv in fb-data: `dev/bin/XED-Studio-Payload/` (→ `git/xed/Studio-Payload/`).

Details: Memory `feedback_upstream_tracking_workspace.md` + `feedback_upstream_forks_unveraendert.md`.

---

## Upstream-Learning-Forks

**WordOps** in `dev/upstream/wordops/` — read-only Plugin-Pattern-Referenz. oclif selbst ist npm-Dep.

---

## Gefundene Bugs im CLI-M4/M5 Server-Test (AI026, 2026-04-15/17)

Vier produktive Bugs wurden beim ersten echten Server-Test entdeckt — alle unsichtbar im lokalen Dev-Test. Dokumentiert als Referenz für zukünftige Migrations-Phasen:

1. **`curl | bash` stdin-Inheritance** — install.sh rief `node .../run.js server restart` auf → Node erbte Bash-Pipe-stdin → oclif interpretierte restlichen Script-Code als `args.tld`. Fix: `</dev/null`. Memory: `feedback_curl_bash_stdin.md`.

2. **`perfectionist/sort-objects` Args-Reorder** — AI025's Lint-Cleanup (`beef48a`) sortierte `admin create {email, tld}` alphabetisch → Command parste Args falsch. Fix: Block-disable + USAGE-Regex im Smoke-Test. Memory: `feedback_cli_args_semantic.md`.

3. **`curl -sf ... || echo "000"` Double-Output** — bei 4xx+5xx lieferte curl den Code (z.B. `404`) UND exit≠0 → `echo` hängte `000` dran → parseInt → `404000`. Fix: `-sf` zu `-s` ändern, redundanter Fallback entfernt. Commit `a75dede`.

4. **health.ts URL-Mismatches** — (a) `/xed/api/health` statt `/api/health` bei direktem localhost-Check (NGINX strippt `/xed/`, localhost kennt es nicht). (b) `/` statt `/studio/` bei Payload (Next.js basePath=/studio liefert auf `/` 404). Commit `fc3351b`.

**Pattern:** execSync-Wrapper + Bash-Integrations-Punkte sind der häufigste Fehlerquellen-Bereich. Live-Test vor Produktiv-Schalten ist nicht verhandelbar.

**install.sh-Symlink-Anzeige-Bug (kosmetisch, aber lehrreich):** Die Zusammenfassung zeigte `$CLI_TARGET` (Soll) statt `readlink $BIN_LINK` (Ist). Im KEEP_SYMLINK-Test-Modus divergierten Anzeige und Realität. Commit `839f39d`. **Lehre:** State-Displays immer Ist-Zustand zeigen, nie Variable-Hoffnungen.

---

## Test-Status

**450 Tests grün** (Stand CLI-M5.X: +57 neu über decodeHtmlEntities, getAttr, hasComplexContent, splitTopLevelBlocks, parseInlineContent, htmlToLexical-Integration mit Inline-Fixtures). `npm test` — Mocha + chai + @oclif/test.

**Strategie** (abgestuft nach Nutzen):

| Schicht | Testen? | Warum |
|---|---|---|
| Pure Functions (Rendering, Mapping) | JA, Snapshot/Unit | Trivial testbar, hoher Wert |
| Filesystem-Logik (via `INFACTORY_SITE_BASE` tmp-dir) | JA | Regressions-Schutz bei TLD-Discovery |
| Config-Parsing (JSON, Env) | JA | Fehler-Szenarien wichtig |
| execSync-Wrapper (systemctl, curl, pnpm, sqlite3) | NEIN | Mocking = Wartungshölle → Live-Test auf Server |
| Interaktive Passwort-Eingabe | NEIN | TTY-Simulation schlecht möglich |
| Command-Bodies | Smoke via `@oclif/test` | Help + Early-Exit-Pfade |

**Test-Infrastruktur-Unlock:** `INFACTORY_SITE_BASE` ENV-Override in `lib/config.ts`,
`siteBase()` liest ENV bei jedem Aufruf. Testet gegen `mkdtempSync` + `mockSite()` Helper.

**Lint-Status:** 0 Errors, 10 akzeptierte Warnings:

- `admin/create.ts:113 run()` complexity 23 — Helper-Extraktion wäre Scope-Creep
- `health.ts:33,68 checkX` max-params 5 — Options-Object-Refactor möglich, nicht akut
- `admin/create.ts:50` Ctrl+C-Handler — `process.exit(1)` mit eslint-disable (raw-mode außerhalb Command-Klasse, `this.exit()` nicht verfügbar)
- `qa/compare.ts:54 run()` complexity 26 — 3-Sensoren-Render mit null-Varianten (M5.4)
- `images/list.ts:69` max-depth 5 — verschachteltes verbose-Output (M5.5)
- `lib/images.ts:274 migrateImages` complexity 26 + Zeile 409 max-depth 5 — 3-Phasen-Pipeline (M5.5)
- `test/lib/ghost-config.test.ts:80` max-nested-callbacks 5 — try/catch im it-Block (Test-Code) (M5.5)
- `lib/html-to-lexical.ts:234 splitTopLevelBlocks` complexity 24 — Regex-Tokenizer mit Depth-Tracking (inhärent) (M5.X)
- `lib/html-to-lexical.ts:360 makeImage` max-params 6 — image-Builder hat 6 Lexical-Felder; Options-Object wäre Indirection ohne Wert (M5.X)
- `lib/html-to-lexical.ts:447 convertBlock` complexity 43 — Switch über alle Block-Tag-Types; Aufteilung würde Dispatcher-Pattern brechen (M5.X)
- `commands/qa/compare.ts:54 run()` complexity 31 (war 26) — Sensor-Error-Rendering mit 3 Sensor-Fällen × {success, error, verbose} (M5.4.1)

---

## Pflichtlektüre für Studio-Sessions

1. `docs/AGENTS.md` — Session-Onboarding, Repo-Struktur, die vier Kern-Fragen
2. `docs/WHITEPAPER.md` — §1 (Summary), §13 (Target-Driver), §15 (Zeitlinie)
3. `docs/CLI-MIGRATION-BRIEFING.md` — Architektur-Begründung, oclif-Evaluierung, Ziel-Architektur

---

## Hinweise für andere Sessions

- **Nicht in `infactory-cli-v2/` editieren** ohne diese Datei gelesen zu haben
- **Nicht die alte `infactory-cli/` für neue Features nutzen** — alle neuen Commands gehören in v2
- **Bash-Scripts nicht ausbauen** — nur Bugfixes wenn produktiv nötig, keine neuen Features
- **`hello/` Commands** in `src/commands/hello/` sind oclif-Beispiele und können gelöscht werden (CLI-M6)
