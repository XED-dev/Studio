# inFactory@ /Studio — Dokumentation

> Deine Website. Dein AI Agent. Dein Ghost CMS.
> Kein Drag-and-Drop. Kein Page-Builder. Sag deinem AI Agent was du willst.

**Website:** [studio.xed.dev](https://studio.xed.dev) | **GitHub:** [XED-dev/Studio](https://github.com/XED-dev/Studio) | **Lizenz:** MIT

---

## Was ist inFactory?

inFactory ist eine **Theme-Fabrik fuer Ghost CMS** die von AI Agenten gesteuert wird.
Du arbeitest nicht in einem Browser-Editor — du sprichst mit einem AI Coding Agent
(Claude Code, Gemini CLI, oder jedem CLI-faehigen AI Agent) und der Agent steuert
den inFactory Server auf deinem Ghost-Host.

```
Du (Terminal)          AI Agent              inFactory Server          Ghost CMS
                                             (auf deinem Server)
"Mach die Ueber-     Claude Code            POST /api/theme/build    Theme aktiv
 schrift groesser"   aendert Preset YAML    POST /api/theme/deploy   Seite live
                     → API Call →           → baut Theme →           → deployed →
```

**Der AI Agent ist der Architekt. Der Server ist die Fabrik.**

Du gibst die Richtung vor. Der Agent setzt um. Der Server baut und deployed.

---

## Fuer wen ist das?

### DevOps / SysAdmins

Du installierst inFactory einmalig auf dem Ghost-Server. Danach laeuft alles
ueber API-Calls — kein SSH noetig, kein manuelles Theme-Upload.

**Dein Workflow:**
```bash
# 1x als root: inFactory global installieren
curl -fsSL https://studio.xed.dev/install.sh | bash

# 1x als Ghost-User: Pro Ghost-Instanz einrichten
cd /var/ghost/mein-blog
infactory install

# Fertig. Ab jetzt steuern AI Agents den Server via API.
infactory status
```

**Was du bekommst:**
- Automatischer systemd-Service (startet mit dem Server)
- Auto-Sleep nach 6 Stunden Inaktivitaet (spart Ressourcen)
- API-Key-Authentifizierung (kein Passwort, kein OAuth)
- Health-Endpoint fuer Monitoring: `GET /api/health`
- Python venv mit QA-Tools (shot-scraper, crawl4ai) automatisch installiert
- Referenz-Bibliothek (20+ MIT-lizenzierte Ghost-Themes) automatisch geklont

**Updates:**
```bash
cd /var/ghost/mein-blog
infactory update    # Holt neueste Version von GitHub
infactory restart   # Neustart mit neuen Features
```

---

### Web-Designer

Du definierst das Design in einer YAML-Datei (dem "Preset") — Farben, Schriften,
Abstande, und welche Sections auf welcher Seite erscheinen. Der AI Agent hilft dir
dabei oder du editierst die Datei direkt.

**Dein Workflow mit Claude Code:**
```
Du:     "Ich will ein dunkles Design mit Crimson Text als Headline-Font,
         Josefin Sans fuer Body, und die Primaerfarbe soll #8B4513 sein."

Claude: [aendert das Preset YAML]
        [ruft POST /api/theme/build auf]
        [ruft POST /api/theme/deploy auf]
        "Fertig. Die Aenderungen sind live auf dev.mein-blog.at."

Du:     "Die H1 ist zu gross. Mach sie 48px statt 63px."

Claude: [aendert tokens.font.h1_size im Preset]
        [baut + deployed]
        "Angepasst. H1 ist jetzt 48px."
```

**Was ein Preset definiert:**
```yaml
id: mein-restaurant
name: "Mein Restaurant"
description: "Elegantes Restaurant-Theme"

tokens:
  color:
    primary: "#8B4513"
    background: "#faf5ef"
    text: "#2c2930"
  font:
    display: "Crimson Text"
    body: "Josefin Sans"
    h1_size: "48px"
    h2_size: "36px"
    body_size: "18px"
  spacing:
    section_padding: "80px"

layout:
  home:
    - hero_slider
    - feature_cards_3col
    - cta_bar
    - news_grid
```

**Section Library (28 Sections in 7 Kategorien):**

| Kategorie | Sections | Beschreibung |
|-----------|----------|--------------|
| Hero | hero_centered, hero_split, hero_fullscreen, hero_slider | Einstiegs-Bereiche mit Bild/Video |
| Posts/Blog | posts_grid_3col, posts_grid_2col, posts_featured, news_grid | Blog-Beitraege anzeigen |
| Features | features_3col, features_split, feature_cards_3col | Leistungen/USPs darstellen |
| CTA | cta_newsletter, cta_bold, cta_bar | Handlungsaufforderungen |
| Social Proof | social_proof_bar, testimonials_grid, logo_wall | Referenzen und Partner |
| Misc | about_split, services_list, pricing_table, faq_accordion | Flexible Inhalts-Sections |

**QA — Visuelle Qualitaetskontrolle:**
```
Du:     "Vergleich mal unsere Ghost-Seite mit dem Original."

Claude: [ruft POST /api/qa/compare auf]
        "Ergebnis:
         Gesamt:   44%  (Ziel: 99%)
         Struktur: 57%  (Sections fehlen)
         Pixel:    40%  (Farben + Layout)
         CSS:      30%  (30/43 Properties weichen ab)

         Hauptproblem: Ghost hat flachen Content,
         das Original hat 12 Sections mit Grid-Layouts."
```

---

### Werbetexter / Content-Ersteller

Du schreibst Texte und der AI Agent bringt sie in die richtige Struktur.
Ghost speichert Content im Lexical-Format — du musst das nicht kennen,
der Agent uebernimmt die Konvertierung.

**Dein Workflow:**
```
Du:     "Hier ist der neue Text fuer die Seite 'Feiern & Geniessen':

         # Feiern im Brauhaus
         Ob Firmenevent oder Familienfeier — bei uns wird jedes Fest
         zum unvergesslichen Erlebnis.

         ## Unsere Raeumlichkeiten
         - Grosser Saal (bis 120 Personen)
         - Stueberl (bis 30 Personen)
         - Biergarten (bis 80 Personen)"

Claude: [konvertiert zu Lexical-JSON]
        [ruft POST /api/ghost/pages auf — Slug: feiern-geniessen]
        "Text ist auf dev.mein-blog.at/feiern-geniessen/ live."

Du:     "Perfekt. Jetzt noch das Bild vom grossen Saal als Hero."

Claude: [ruft POST /api/ghost/images/upload auf]
        [aktualisiert die Seite mit feature_image]
        "Bild hochgeladen und als Hero-Bild gesetzt."
```

**Lexical Upgrade — alte Seiten modernisieren:**
```
Du:     "Die alten Seiten haben noch den HTML-Monoblock. Kannst du die alle
         auf echtes Lexical umstellen?"

Claude: [ruft POST /api/ghost/pages/upgrade-lexical auf — slug: "all", dry_run: true]
        "Trockenlauf: 12 Seiten wuerden konvertiert.
         hotel: 8 Nodes (3 headings, 4 paragraphs, 1 image)
         brauerei: 15 Nodes (5 headings, 8 paragraphs, 2 images)
         ...
         Soll ich es ausfuehren?"

Du:     "Ja, mach."

Claude: [ruft nochmal auf — dry_run: false]
        "12 Seiten auf echtes Lexical umgestellt."
```

---

### Freelancer / Agenturen

Du betreust mehrere Kunden mit Ghost-Websites. Jeder Kunde hat ein eigenes
Preset, einen eigenen inFactory-Server, und du steuerst alle ueber den
gleichen AI Agent in deinem Terminal.

**Multi-Site Workflow:**
```
Du:     "Deploy das Restaurant-Theme auf dev.restaurant.at
         und das Agency-Theme auf dev.agentur.at."

Claude: [API-Call an restaurant.at:3368 — POST /api/theme/deploy]
        [API-Call an agentur.at:3369 — POST /api/theme/deploy]
        "Beide deployed. Restaurant: 42KB, Agency: 38KB."
```

**Referenz-Bibliothek nutzen:**
```
Du:     "Welche Referenz-Themes hat der Server?"

Claude: [GET /api/theme/references]
        "20 MIT-Themes (Casper, Edition, Solo, Taste, ...)
         3 Themex-Themes (Flavor, Flavor-Pro, Flavor-Dark)

         Die Referenzen dienen als Inspiration fuer eigene Sections.
         Ich kann Patterns daraus analysieren (Clean-Room)."
```

**Lizenzierte Themes importieren:**
```bash
# Themex-Bundle von Nextcloud-Share importieren
infactory import-references --url=https://cloud.example.com/s/abc123/download
```

---

## Installation

### Voraussetzungen

| Tool | Version | Pruefung |
|------|---------|----------|
| Node.js | >= 18 | `node --version` |
| Git | beliebig | `git --version` |
| Ghost CMS | 6.x | `ghost version` |
| Python | >= 3.9 (optional, fuer QA) | `python3 --version` |

### Schritt 1: Globale Installation (als root)

```bash
curl -fsSL https://studio.xed.dev/install.sh | bash
```

Das installiert:
- **inFactory CLI + Server** nach `/opt/infactory/`
- **Python venv** mit shot-scraper + crawl4ai (QA-Tools)
- **Playwright Chromium** (fuer Screenshots)
- **20 MIT-lizenzierte Referenz-Themes** nach `/opt/infactory/references/mit/`
- **Symlink** `/usr/local/bin/infactory`

### Schritt 2: Pro Ghost-Instanz einrichten (als Ghost-User)

```bash
su - g-host
cd /var/ghost/mein-blog.at
infactory install
```

Das erstellt:
- `.infactory/` Verzeichnis im Ghost-Root
- `infactory.json` mit Port, API-Key, Ghost-Verbindung
- systemd-Service: `infactory-mein-blog-at`
- Automatischer Server-Start

### Schritt 3: Ghost Admin API Key eintragen

1. Ghost Admin oeffnen → Settings → Integrations → Add custom integration
2. Name: "inFactory Studio"
3. Den **Admin API Key** kopieren (Format: `id:secret`)
4. In `infactory.json` eintragen:
   ```bash
   nano /var/ghost/mein-blog.at/.infactory/infactory.json
   # "ghost_admin_key": "<id>:<secret>"
   ```
5. `infactory restart`

---

## API-Referenz

Alle Endpunkte erfordern den Header `X-API-Key: <dein-api-key>` (ausser `/api/health`).

### Theme (Build + Deploy)

| Method | Endpoint | Body | Beschreibung |
|--------|----------|------|--------------|
| POST | `/api/theme/build` | `{ preset }` | Theme aus Preset bauen (ZIP) |
| POST | `/api/theme/deploy` | `{ preset, site, activate }` | Bauen + auf Ghost deployen |
| GET | `/api/theme/presets` | — | Alle verfuegbaren Presets listen |
| GET | `/api/theme/presets/:id` | — | Ein Preset lesen (YAML + parsed) |
| PUT | `/api/theme/presets/:id` | `{ raw }` oder `{ preset }` | Preset aktualisieren |
| GET | `/api/theme/sections` | — | Section Library (registry.json) |
| GET | `/api/theme/references` | — | Referenz-Themes auf dem Server |

### Ghost Content

| Method | Endpoint | Body / Query | Beschreibung |
|--------|----------|--------------|--------------|
| GET | `/api/ghost/pages` | `?limit=50&filter=...&site=dev` | Alle Pages listen |
| GET | `/api/ghost/pages/:slug` | `?site=dev` | Eine Page lesen |
| POST | `/api/ghost/pages` | Page-Objekt | Page erstellen/aktualisieren |
| POST | `/api/ghost/pages/upgrade-lexical` | `{ slug, dry_run }` | HTML zu echtem Lexical konvertieren |
| GET | `/api/ghost/posts` | `?limit=50&site=dev` | Alle Posts listen |
| POST | `/api/ghost/posts` | Post-Objekt | Post erstellen/aktualisieren |

### Images

| Method | Endpoint | Body / Query | Beschreibung |
|--------|----------|--------------|--------------|
| POST | `/api/ghost/images/upload` | `{ url }` oder `{ path }` oder `{ base64, filename }` | Bild hochladen |
| POST | `/api/ghost/images/migrate` | `{ slug, source, dry_run }` | Externe Bilder einer Page migrieren |
| GET | `/api/ghost/images/audit` | `?hostname=...&site=dev` | Externe Bilder finden |
| GET | `/api/ghost/images/list` | `?site=dev` | Bild-Inventar (lokal vs extern) |

### Visual QA

| Method | Endpoint | Body | Beschreibung |
|--------|----------|------|--------------|
| POST | `/api/qa/compare` | `{ source, target, width }` | 3-Sensor QA Report |
| POST | `/api/qa/batch` | `{ source_base, target_base, slugs }` | Batch QA ueber mehrere Seiten |
| POST | `/api/qa/structure` | `{ url }` | Struktur-Analyse einer Seite |

**QA-Sensoren:**
- **Pixel** (35%): odiff CIE76 Lab Delta-E — misst Farb- und Layout-Abweichungen
- **Struktur** (40%): crawl4ai + shot-scraper — vergleicht Sections, Spalten, Elemente
- **CSS** (25%): getComputedStyle — vergleicht 43 CSS-Properties ueber 12 UI-Elemente

### System

| Method | Endpoint | Body | Beschreibung |
|--------|----------|------|--------------|
| GET | `/api/health` | — | Server + Ghost Status (kein API-Key noetig) |
| POST | `/api/system/restart` | `{ site }` | Ghost CMS neustarten |
| GET | `/api/system/status` | — | Ghost Service-Status |

---

## CLI-Befehle

### Server-Management

```bash
infactory install                  # Pro Ghost-Instanz einrichten
infactory start                    # Server starten
infactory stop                     # Server stoppen
infactory restart                  # Server neustarten
infactory status                   # Status anzeigen
infactory update                   # Auf neueste Version aktualisieren
infactory ghost restart            # Ghost CMS neustarten
```

### Theme-Entwicklung

```bash
infactory new --name=mein-blog --preset=blog    # Neues Projekt scaffolden
infactory build --preset=blog --zip              # Theme bauen
infactory preview --preset=blog                  # Lokal im Browser ansehen
infactory deploy --preset=blog                   # Auf Ghost deployen
infactory list                                   # Verfuegbare Presets
```

### Presets + Sections

```bash
infactory preset clone blog --name=mein-preset --color="#8B4513"
infactory preset list
infactory section add hero_slider --preset=mein-preset
infactory section remove cta_bar --preset=mein-preset
infactory section layout --preset=mein-preset
```

### Visual QA

```bash
infactory qa compare \
  --source=https://original.example.com/seite/ \
  --target=https://ghost.example.com/seite/

infactory qa batch \
  --source-base=https://original.example.com \
  --target-base=https://ghost.example.com \
  --slugs=hotel,brauerei,restaurant
```

### Images

```bash
infactory images audit --hostname=original.example.com
infactory images migrate --hostname=original.example.com --from=./archiv/
infactory images list
infactory images upload bild1.jpg bild2.png
```

### Referenzen

```bash
infactory import-references --url=https://cloud.example.com/s/abc/download
```

---

## Architektur

```
Dein Terminal / IDE                       Dein Ghost-Server
 ____________________________             ____________________________________
|                            |           |                                    |
|  AI Agent                  |  HTTPS    |  inFactory Server (:3368)          |
|  (Claude Code, Gemini CLI) | --------> |                                    |
|                            |  API-Key  |  /api/theme/*    Theme Factory     |
|  Du gibst Anweisungen.     |           |  /api/ghost/*    Content CRUD      |
|  Der Agent fuehrt aus.     |           |  /api/qa/*       Visual QA         |
|  Der Server baut.          |           |  /api/system/*   Ghost Control     |
|____________________________|           |                                    |
                                         |  Python venv     QA-Tools          |
                                         |  /opt/infactory/ Referenz-Themes   |
                                         |                                    |
                                         |  Ghost CMS (localhost:2368)        |
                                         |____________________________________|
```

**Prinzip: Der Server ist autonom.**
Alles was er braucht liegt bei ihm — Tools, Referenzen, Sections, Presets.
Der AI Agent ist der Steuermann, aber die Fabrik hat alle Werkzeuge selbst.

---

## Beispiel: Kompletter Workflow

```
1. SysOps installiert inFactory auf dem Server (einmalig)

2. Designer oeffnet Terminal mit Claude Code:
   "Erstelle ein Theme fuer ein Restaurant. Rustikal, warm,
    Crimson Text als Heading-Font, braune Primaerfarbe."

3. Claude Code:
   - Klont das blog-Preset → restaurant
   - Setzt Design-Tokens (Farben, Fonts, Spacing)
   - Waehlt Sections: hero_slider + feature_cards + cta_bar
   - POST /api/theme/build → baut ZIP
   - POST /api/theme/deploy → deployed auf Ghost
   - "Theme ist live. Schau dir dev.restaurant.at an."

4. Texter schickt Content:
   "Hier sind die Texte fuer die 5 Hauptseiten."

5. Claude Code:
   - Konvertiert Texte zu Lexical
   - POST /api/ghost/pages (5x) → Seiten erstellt
   - POST /api/ghost/images/upload → Bilder hochgeladen
   - "Alle 5 Seiten sind live mit Bildern."

6. Designer:
   "Vergleich mal mit dem Original-Design."

7. Claude Code:
   - POST /api/qa/batch → misst alle 5 Seiten
   - "Durchschnitt: 72%. Struktur ist der Hauptblocker.
      Empfehlung: venue_grid Section fuer die Raeumlichkeiten."

8. Iterieren bis Score > 95%.
```

---

## FAQ

**Brauche ich Programmierkenntnisse?**
Nein. Du sprichst mit dem AI Agent in natuerlicher Sprache. Der Agent uebersetzt
deine Wuensche in API-Calls und Code-Aenderungen.

**Welche AI Agents funktionieren?**
Jeder CLI-faehige AI Coding Agent: Claude Code (Anthropic), Gemini CLI (Google),
GitHub Copilot CLI, oder eigene Agents die HTTP-Requests machen koennen.

**Ist mein Content sicher?**
Ja. Der inFactory Server laeuft auf DEINEM Ghost-Host. Kein Cloud-Service,
keine Drittanbieter. Dein Content verlasst nie deinen Server.

**Was kostet das?**
inFactory ist MIT-lizenziert — kostenlos, auch fuer kommerzielle Nutzung.
Du brauchst nur einen Ghost-Server (ab ca. 5 EUR/Monat bei Hetzner/Netcup).

**Kann ich mehrere Ghost-Instanzen verwalten?**
Ja. Jede Ghost-Instanz bekommt ihren eigenen inFactory-Server (eigener Port,
eigener API-Key). Ein AI Agent kann beliebig viele Server steuern.

**Was ist der Unterschied zu Elementor/Squarespace/Wix?**
Diese Tools sind fuer Menschen die im Browser klicken.
inFactory ist fuer AI Agents die im Terminal arbeiten.
Das Ergebnis ist das gleiche: eine fertige Website.
Der Weg dorthin ist fundamental anders.

---

## Links

- **Website:** [studio.xed.dev](https://studio.xed.dev)
- **GitHub:** [github.com/XED-dev/Studio](https://github.com/XED-dev/Studio)
- **Ghost CMS:** [ghost.org](https://ghost.org)
- **XED.dev:** [xed.dev](https://xed.dev)
- **Lizenz:** [MIT](https://github.com/XED-dev/Studio/blob/main/LICENSE)

---

*inFactory@ /Studio by [XED.dev](https://xed.dev) — AI-native development tools.*
