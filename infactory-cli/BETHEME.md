# BETHEME.md — BeTheme Original-Referenz für Steirisch Ursprung

> Pflichtlektüre für alle Sessions die am SteirischUrsprung-Projekt arbeiten.
> Quellseite (Archiv): https://arv.steirischursprung.at/
> Ghost DEV: https://dev.steirischursprung.at/
> Ghost WEB: https://web.steirischursprung.at/

---

## Das Original: BeTheme (Muffin Framework)

Die Originalseite `steirischursprung.at` war ein WordPress mit BeTheme (ThemeForest #1).
Wir migrieren Design + Content nach Ghost CMS mit inFactory CLI.

### Framework-Klassen

```
body.theme-betheme
  #Wrapper
    header#Header
      #Action_bar        → Topbar (CTA-Buttons, Kontakt)
      #Top_bar           → Split-Navbar (Logo zentriert, Menü links/rechts)
    #Content
      .sections_group
        .mcb-section     → Sektion (mehrere pro Seite)
          .section_wrapper.mcb-section-inner
            .mcb-wrap     → Zeile
              .mcb-column → Spalte (one, one-second, one-third, one-fourth)
                .column_attr → HIER ist der echte Content
    footer#Footer
```

### Content-Bereich identifizieren

**Content:** Alles in `<div class="column_attr">` innerhalb `sections_group`
**Header-Bild:** `background-image: url(...)` im ersten `mcb-section`
**Template-Müll (NICHT importieren):**
- Alles nach `<footer` / `id="Footer"`
- `<form class="wpcf7">` (Kontaktformular)
- Essential Grid (`class="esg-"`) — nur Struktur, kein Content
- Revolution Slider (`class="rev_slider"`) — durch Ghost Slider ersetzen
- "Weitere Angebote & Pakete" Sections (wiederholen sich auf jeder Seite)

---

## Farb- und Font-Palette (gemessen mit dembrandt + getComputedStyle)

### Farben

| Token | Hex | Verwendung |
|---|---|---|
| `--color-primary` | `#006633` | Headings, Icons, Nav-Accents, Links |
| `--color-navbar` | `#206f40` | Topbar-Hintergrund |
| `--color-accent` | `#ba8d1a` | Gold — Preis-Badges, Akzente |
| `--color-warm-bg` | `#d5c8b9` | Beige — Title-Bars, Reservation-Bars |
| `--color-dark-bg` | `#16192a` | Navy — Dunkle Sektionen |
| `--color-text` | `#554030` | Body-Text (braun, NICHT #444) |
| `--color-text-heading` | `#2c2930` | H1 (fast-schwarz) |
| `--color-bg` | `#ffffff` | Weißer Hintergrund |

### Fonts

| Token | Font | Verwendung |
|---|---|---|
| `--font-heading` | `'Crimson Text', Georgia, serif` | H1, H2, Section-Titel, Slider-Titel |
| `--font-body` | `'Josefin Sans', system-ui, sans-serif` | Navigation, Buttons, Body, Subtitles |
| `--font-display` | `'Playfair Display', Georgia, serif` | Preise (italic), Akzente |

**ACHTUNG:** Heading/Body waren in Sessions 1-4 VERTAUSCHT! Dembrandt hat den Fehler aufgedeckt:
- Crimson Text = Headings (weight 400, nicht 600/700!)
- Josefin Sans = Body/Nav/UI

### Texturen und Dekorationen

| Datei | Verwendung |
|---|---|
| `header-bg.jpg` | Beige Textur für Title-Bars, CTA-Bars |
| `bg-holz.jpg` | Holztextur für Feature-Card-Sektionen |
| `sep-green-top.png` | Grüner Wellentrenner (oben, 6px) |
| `sep-green-bottom.png` | Grüner Wellentrenner (unten, 6px) |
| `home_pizza2_decoration2.png` | Holzrand-Trenner (oben) |
| `home_decoration9.png` | Holzrand-Trenner (unten) |

---

## Die 10 wiederverwendbaren Design-Blöcke

| # | Block | Beschreibung | CSS-Klasse |
|---|---|---|---|
| 1 | **Hero Slider** | Fullscreen, Fade, verdunkelt, weißer Text | `.c-hero-slider` |
| 2 | **Hero Image** | Vollbild-Hintergrundbild + grüner Separator | `.c-hero-image` |
| 3 | **Title Bar** | Beige texturierter Balken mit H1 | `.c-title-bar` |
| 4 | **Feature Cards 3-Col** | 3 Karten auf Holztextur mit Illustrationen | `.c-feature-cards` |
| 5 | **CTA Bar** | Beige Balken + Text + Button | `.c-cta-bar` |
| 6 | **Venue Grid** | Cards mit Bild + goldenem Badge + Preis | `.venue-grid` |
| 7 | **Icon Cards** | Weiße Karten mit überlappenden Tier-Icons | `.icon-cards` |
| 8 | **News Grid** | 3-Spalten Post-Cards mit Datum | `.c-news-grid` |
| 9 | **Capacity Badge** | Goldener Kreis (105px) mit Zahl | `.capacity-badge` |
| 10 | **Video Section** | YouTube Embed + Click-to-Play | `.video-section` |

---

## Seitenstruktur der 5 Pilot-Seiten

### Homepage (/)

```
Hero Slider (4 Slides: Hotel, Bienenstock, Gasthaus, Hochzeit)
→ Feature Cards 3-Col (Hotel, Gasthaus, Feiern)
→ CTA Bar ("Urlaub in Österreichs schrägstem Hotel")
→ News Grid (letzte 3 Posts)
```

### Hotel (/hotel/)

```
Hero Image (hotel-header_01.jpg)
→ Title Bar ("Hotel")
→ Content (6 Sections: Erlebnishotel, Angebote, Wellness, Zimmer, Erkundungstour, Dorf)
→ Feature Cards für jeden Bereich mit Bildern
```

### Feiern & Genießen (/feiern-geniessen/)

```
Hero Image (shutterstock_91766336-web.jpg)
→ Title Bar ("Feiern & Genießen")
→ Intro Text + 3 Feature Cards (Bier, Säle, Hochzeiten) mit Tier-Illustrationen
→ Veranstaltungssäle Venue-Grid (6 Säle mit Bildern + Preisen)
```

### Bienenstock (/bienenstock/)

```
Hero Image (bienenstock_header.jpg)
→ Title Bar ("Bienenstock") + Capacity "bis 36 Personen"
→ 2-Spalten: Text links + 2 Bilder rechts
→ Technische Ausstattung (Tonanlage, Beamer, WLAN)
→ Anfrage-Formular / Kontakt
```

### Brauerei (/brauerei/)

```
Hero Image (Hotel_7-2400px.jpg)
→ Title Bar ("Brauerei")
→ Intro Text ("So kam ich zum Bierbrauen...")
→ 3 Feature Cards (Honigbier, Kürbisbier, Weizenbier) mit Bienen-Illustrationen
→ Solarbrauerei: 3 Feature Cards (Sonne, Erster Schritt, Wetterunabhängig)
→ Video Section (YouTube)
→ CTA Bar
```

---

## Menüstruktur (Original)

```
Topbar: Jetzt anfragen | Zimmer & Preise | Kontakt | Gutschein bestellen

Links:  Hotel (6 Subs) | Gasthaus | Feiern (4 Subs)
        [LOGO zentriert]
Rechts: Seminar (3 Subs) | Brauerei (3 Subs) | Aktuelles

Hotel-Subs: Hotel, Erlebnishotel, Angebote, Wellness, Zimmer & Preise, Erkundungstour
Feiern-Subs: Feiern, Braustube, Veranstaltungssäle, Hochzeiten
Seminar-Subs: Seminar, Seminar im Bienenstock, Veranstaltungssäle
Brauerei-Subs: Brauerei, Sonnenbierführungen, Bierempfehlung
```

---

## URL-Mapping: BeTheme → Ghost

Ghost hat **keine verschachtelten URLs**. WordPress-Unterverzeichnisse werden zu flachen Slugs mit Bindestrich konvertiert.

**Regel:** Jeder `/` im WordPress-Pfad wird zu `-` im Ghost-Slug.

| Original (BeTheme) | Ghost Slug | Ghost URL |
|---|---|---|
| `/` | — | Homepage (home.hbs) |
| `/hotel/` | `hotel` | `/hotel/` |
| `/feiern-geniessen/` | `feiern-geniessen` | `/feiern-geniessen/` |
| `/brauerei/` | `brauerei` | `/brauerei/` |
| `/zimmer-und-angebote/bienenstock/` | `zimmer-und-angebote-bienenstock` | `/zimmer-und-angebote-bienenstock/` |
| `/zimmer-und-angebote/erlebnishotel/` | `zimmer-und-angebote-erlebnishotel` | `/zimmer-und-angebote-erlebnishotel/` |
| `/zimmer-und-angebote/braustube/` | `zimmer-und-angebote-braustube` | `/zimmer-und-angebote-braustube/` |
| `/zimmer-und-angebote/sonnenbierfuehrung/` | `zimmer-und-angebote-sonnenbierfuehrung` | `/zimmer-und-angebote-sonnenbierfuehrung/` |
| `/zimmer-und-angebote/ursprung-tour/` | `zimmer-und-angebote-ursprung-tour` | `/zimmer-und-angebote-ursprung-tour/` |
| `/feiern-geniessen/saele/` | `feiern-geniessen-saele` | `/feiern-geniessen-saele/` |

**Beispiel:** `/zimmer-und-angebote/kristallzimmer/` → `zimmer-und-angebote-kristallzimmer`

Die Hierarchie bleibt im Slug lesbar erhalten. Nginx-Redirects von den alten WordPress-Pfaden
auf die neuen Ghost-Slugs sind SysOps-Aufgabe.

---

## Kontaktdaten

- Adresse: Brodersdorfstraße 85, A-8200 Eggersdorf bei Graz
- Telefon: +43 3117 51 71
- Mobiltelefon: +43 664 2077070
- Copyright: Steirisch Ursprung
- Social: Instagram, Facebook

---

## Measurement-Driven CSS (PFLICHT)

> **Keine CSS-Werte raten. MESSEN.**

### Werkzeuge (alle in `dev/upstream/`)

| Tool | Zweck |
|---|---|
| **shot-scraper** | Screenshots + `getComputedStyle()` auf Live-Seiten |
| **dembrandt** | Design-Token-Extraktion aus URL → JSON |
| **reg-cli** | Pixel-Diff Screenshot-Vergleich → HTML-Report |

### Workflow

1. **MESSEN** — `shot-scraper javascript <URL> "getComputedStyle(...)"`
2. **VERGLEICHEN** — Tabelle erstellen mit Original vs Ghost Werten
3. **FIXEN** — Werte aus der Messung übernehmen
4. **VERIFIZIEREN** — erneut messen

### Bekannte Fallen (aus Sessions 1-11)

- **Font-Zuordnung:** NIE raten, IMMER mit `getComputedStyle()` messen
- **Goldener Kreis:** Kein Gradient, kein Shadow — flaches `#ba8d1a` + `::after` 2px Ring
- **Capacity-Bar:** Holztextur `#d5c8b9 url(header-bg.jpg)`, nicht einfarbig
- **Schriftgrößen:** Original hat durchgehend weight 400, nicht 600/700
- **`<a>` in `<a>`:** Invalides HTML, Browser bricht DOM → Grid zerstört. Buttons als `<span>`
- **Ghost `> * + *`:** Spacing-Regel erzeugt 18px Lücken an Sektionsgrenzen → `margin-top: 0`
- **Cloudflare:** Proxy (orange Wolke) cached aggressiv — Entwicklung auf DNS-only (grau)
- **Nginx:** WordOps `open_file_cache` → nach Deploy `systemctl reload nginx`

---

## Bilder-Quellen

Alle Original-Bilder sind unter zwei Pfaden verfügbar:

1. **Live:** `https://arv.steirischursprung.at/wp-content/uploads/2016/{09,10}/`
2. **Lokal:** `dev/bin/XED-Restore/archive/www.steirischursprung.at/` (539 Bilder + 85 HTML)
3. **Design-Tokens:** `dev/bin/XED-Restore/templates/design-tokens-original.json`

---

## Session 13 — Erledigt (2026-04-06)

### ✔ Navigation: Topbar + Split-Nav + Dropdowns

- **Topbar:** Grüner Balken (`--color-navbar: #206f40`) mit CTA-Buttons
- **Split-Nav:** 3+3 mit Logo zentriert (absolute Position, ragt nach oben)
- **Dropdowns:** Desktop: CSS-Hover | Mobile (<1100px): JS Klick-Toggle
- **`@site.navigation` wird NICHT mehr verwendet** — alles hardcoded in `default.hbs`
- Bei Menü-Änderungen: `default.hbs` editieren + Theme neu deployen

### ✔ Footer: 3-Spalten-Layout

- Spalte 1: Logo + Adresse + Social SVG-Icons (Instagram, Facebook, YouTube)
- Spalte 2: Footer-Navigation (hardcoded)
- Spalte 3: Über-uns-Text
- Copyright-Zeile mit Impressum + Datenschutz Links
- Hintergrund: `--color-primary` (grün, wie im Original)

### ✔ Content-Extraktion + 15 neue Pages

Content aus `arv.steirischursprung.at` (statisches Wayback-Archiv) extrahiert:
- **Methode:** shot-scraper javascript → BeTheme `.column_attr` Elemente → HTML
- **Filter:** Template-Content (CTA-Bars, News-Carousels, Angebote-Grids) automatisch entfernt
- **Script:** `seed-session13.js` (wiederverwendbar mit `--dry-run` und `--slug=`)
- **Extraktionsdaten:** `/tmp/arv-extract/*.json` (15 Dateien, JSON mit title/headerImage/content/images)

### ✔ GScan-Fix

`@custom.accent_color` aus `package.json` entfernt (war definiert aber nirgends referenziert).

### Erfahrungen aus Session 13

1. **arv.steirischursprung.at ist KEIN WordPress** — es ist ein statisches Wayback-Archiv (HTML-Dateien via pywaybackup). Kein PHP, kein MySQL, kein wp-cli.
2. **BeTheme Content-Extraktion:** Der echte Text steckt in `.sections_group .column_attr` — NICHT in `.mcb-section` direkt. Filter auf Column-Ebene, nicht Section-Ebene.
3. **shot-scraper `--full-page`** existiert nicht — für hohe Screenshots `-h 3000` verwenden.
4. **jsonwebtoken** ist NICHT im infactory-cli installiert — `ghost-api.js` nutzt eigene JWT-Implementierung aus `deploy.js`.
5. **Lokales Archiv vs. Live:** Pfade unterscheiden sich — WordPress hatte `/zimmer-und-angebote/braustube/`, Ghost-Slug ist `zimmer-und-angebote-braustube`.
6. **Ghost package.json trailing comma:** JSON ist strict — nach Entfernen des letzten Properties muss das Komma beim vorherigen weg.

---

## Session 14 — Erledigt (2026-04-08/09)

### ✔ WHITEPAPER.md — Tiefenanalyse + Roadmap

- IST-Analyse: 4 von 28 Sections haben echte .hbs Templates
- Wettbewerbsanalyse: kein Wettbewerber bedient AI Agents als primäre Nutzer
- 7-Phasen-Roadmap für die Weiterentwicklung
- AI Agent Briefing (technische Referenz)

### ✔ inFactory Server v1.0 — Factory Floor Controller

- Express REST API (17 Endpunkte) auf dem Ghost-Host (025-CBU-5025)
- Ghost Content CRUD, Image Upload/Migration, Theme Build+Deploy, Ghost Restart
- Architektur: Pro Ghost-Instanz, Port = Ghost-Port + 1000
- Auto-Sleep nach 6h Inaktivität, systemd Restart weckt bei Anfrage
- Minimale Dependencies: express, cors, js-yaml (JWT + Multipart = Node Built-ins)

### ✔ infactory CLI — Server Management Befehle

- `infactory install` — erkennt Ghost (config.production.json), erstellt .infactory/, systemd
- `infactory start/stop/restart/status/update` — Server Lifecycle
- `infactory ghost restart` — Ghost CMS neustarten
- Zwei-User-Modell: root (curl install.sh) vs Ghost-User (infactory install)

### ✔ Distribution + Landing Page

- GitHub: https://github.com/XED-dev/Studio (Public, MIT)
- Landing Page: https://studio.xed.dev (GitHub Pages, HTTPS)
- One-Liner: `curl -fsSL https://studio.xed.dev/install.sh | bash`
- inFactory.at → studio.xed.dev, Wiki + Discussions auf GitHub

---

## Session 15 — Erledigt (2026-04-09)

### ✔ Section Library v1.0 — 21 echte Templates

Section Library von 4 auf 21 implementierte .hbs Templates erweitert.
Alle 5 Presets (blog, studio, agency, saas, steirischursprung) bauen ohne Placeholder.

**Neue Sections (17 hinzugefügt):**
- Hero: centered, split, fullscreen
- Features: 3col, split
- Posts: grid-3col, grid-2col, featured
- CTA: newsletter (Ghost Members), bold
- Social: testimonials-grid, logo-wall, social-proof-bar
- Misc: pricing-table, faq-accordion, about-split, services-list

**Architektur-Pattern (gelernt aus Themex-Bundle + Ghost Source Theme):**
- Ghost `{{#get}}` API + Internal Tags (`#feature`, `#testimonial`, `#pricing`, etc.)
- Content kommt aus Ghost Pages/Posts, nicht aus Templates
- BEM-artiges CSS: `.c-{section}__{element}--{modifier}`
- Alle Werte aus CSS Custom Properties (Tokens)

### ✔ Theme-Referenzbibliothek — 25 MIT + 10 Themex

**25 MIT-lizenzierte Themes** als Referenz in `dev/upstream/` geklont:
- TryGhost Official: Source, Casper, Starter, Editorial, Massively, Roon + Monorepo (16 Themes)
- Community: Liebling, Attila, Fizzy

**Themex-Bundle** (10 Premium-Themes, $349 Lifetime) in `dev/upstream/themes/braun-licence/`:
- 730 .hbs Dateien, 21 Section-Types
- Commercial License: Nur als Clean-Room-Architektur-Referenz, Code nicht kopieren

### Erfahrungen aus Session 15

1. **Kein MIT-Theme hat modulare Section-Partials** — das ist ein Premium-Feature.
2. **Themex-Pattern:** `{{#get "pages" filter="tag:hash-section-hero"}}` + `{{#has tag="..."}}` Dispatch.
3. **Scope (Priority Vision) nicht nötig** — Themex-Bundle hat 21 Section-Types, ausreichend.
4. **registry.json Version-Bump** 0.5 → 1.0, `"implemented": true` Flag für echte Templates.

---

## Session 16 — Erledigt (2026-04-09)

### ✔ Lexical Content-Converter — Monoblock → Native Nodes

`ghost-api.js:htmlToLexical()` komplett neu gebaut als `src/html-to-lexical.js`:
- `<p>` → `paragraph` Node (mit inline formatting: bold, italic, underline, links)
- `<h1>`-`<h6>` → `heading` Node
- `<img>` / `<figure>` → `image` Node (Ghost-natives srcset/responsive)
- `<hr>` → `horizontalrule` Node
- `<ul>`/`<ol>` → `list` Node
- Komplexe BeTheme-Blöcke → `html` Card (Fallback)
- Truncated HTML graceful handling (unclosed blocks)

**Alle 19 Content-Pages auf dev aktualisiert** (1 test-content übersprungen):
- Hotel: 1 → 19 Nodes (6 heading, 7 paragraph, 6 image)
- Feiern & Genießen: 1 → 25 Nodes (10 heading, 7 paragraph, 8 image)
- Brauerei: 1 → 20 Nodes (8 heading, 8 paragraph, 4 image)
- Datenschutz: 1 → 23 Nodes (7 heading, 10 paragraph, 6 hr)
- Ghost Editor kann Content jetzt nativ bearbeiten

### ✔ Bilder-Migration — 31 Bilder arv → Ghost

**31 einzigartige Bilder** von `arv.steirischursprung.at` nach Ghost migriert (11 Feature + 20 Content).
Alle liegen jetzt unter `dev.steirischursprung.at/content/images/2026/04/`.
Ghost-natives srcset/responsive Handling aktiv. 0 externe URLs übrig.

### ✔ infactory images — CLI-Befehl für Image Management

Neues Modul `src/images.js` + CLI-Integration in `bin/infactory.js`:
```bash
infactory images audit   --hostname=<host> [--from=<archiv>]   # Externe Bilder finden
infactory images migrate --hostname=<host> --from=<archiv>     # Upload + URL-Replace
infactory images list    [--verbose]                           # Inventar aller Bilder
infactory images upload  <datei> [...]                         # Einzelne Bilder hochladen
```
Kein rsync, kein SSH, kein SysOps — die Fabrik handelt ihre eigenen Assets via HTTPS.

### ✔ infactory qa — 3-Sensor Visual QA (Die Augen der Fabrik)

```bash
infactory qa compare --source=https://arv.steirischursprung.at/<slug>/ --target=https://dev.steirischursprung.at/<slug>/
infactory qa batch --source-base=https://arv.steirischursprung.at --target-base=https://dev.steirischursprung.at --slugs=hotel,brauerei,feiern-geniessen
```

| Sensor | Tool | Gewicht | Misst |
|---|---|---|---|
| Pixel | **odiff** (CIE76 Lab ΔE) | 35% | Perzeptuelle Farbdistanz, Layout-Diff |
| CSS | **shot-scraper** + getComputedStyle | 25% | 12 Elemente × 3-5 Properties |
| Struktur | **crawl4ai** + shot-scraper JS | 40% | Sections, Grids, Content, Media |

**QA-Baseline (feiern-geniessen): GESAMT 44%** (Struktur 57%, Pixel 40%, CSS 30%)
**Ziel: 99%**

### Erfahrungen aus Session 16

1. **Ghost Lexical Format:** 22 Card-Types in `node-renderers/`, plus Builtins (paragraph, heading, list, text, link, linebreak). Root direction muss `"ltr"` sein (nicht `null`).
2. **Text format flags** sind bitwise OR: 1=bold, 2=italic, 4=strikethrough, 8=underline.
3. **Image Nodes** werden von Ghost automatisch mit `kg-card kg-image-card` Klasse + srcset gerendert.
4. **Headings** bekommen automatisch `id="slug"` für Anchor-Links.
5. **Truncated HTML:** Datenschutz-Page war abgeschnitten (kein schließendes `</div>`). Parser muss unclosed blocks am EOF behandeln.
6. **`wso-privacy` Div** ist ein einfacher Wrapper (kein komplexer BeTheme-Block).
7. **Ghost Admin API `?formats=lexical,html`** liefert beide Formate.
8. **Struktur ist Hauptblocker, nicht CSS.** Flacher Content (h2, p, img...) vs strukturierte Sections (Hero, 3-Col Cards, Grids). CSS-Fixes bringen max ~60%, Sections-Arbeit ist der Weg zu 99%.
9. **odiff > pixelmatch** für Web-Screenshots: CIE76 Lab ΔE (perzeptuell) > YIQ (TV), Layout-Diff-Erkennung, weniger False Positives.
10. **crawl4ai > shot-scraper** für Content-Extraktion: Schema-basierte Extraktion, Markdown-Conversion, Media-Inventar. shot-scraper kann nur JS.
11. **crawl4ai stdout-Verschmutzung:** `[INIT]`, `[FETCH]`, `[SCRAPE]` auf stdout. Lösung: `###JSON_START###` Marker im Python-Script.

---

## OFFENE PUNKTE für Session 17

### 1. Content-Struktur (HÖCHSTE PRIORITÄT — der Weg zu 99%)

Das Kernproblem: Ghost-Pages haben flachen Content, Original hat strukturierte Sections.
- Source hat 26 Sections, Target hat 12
- Source hat Grid-Layouts (3-Spalten Feature Cards), Target hat keine
- Seitenhöhe +35% weil alles untereinander statt nebeneinander
- Content-Länge: 16.332 vs 7.571 Zeichen — Content beim Import verloren

**Tiefe Analyse nötig:**
- Wie kann die Section Library die BeTheme-Strukturen abbilden?
- Wie wird flaches Lexical JSON in Section-basiertes Ghost Content umgewandelt?
- Welche Section-Types brauchen wir konkret für feiern-geniessen?
  - Hero Image + Overlay Text
  - 3-Spalten Feature Cards mit Tier-Illustrationen
  - Venue Grid (6 Säle mit Bildern + Preisen)
  - CTA-Bar

### 2. CSS-Kalibrierung (erst wenn Struktur > 80%)

| Property | Original | Ghost | Fix |
|---|---|---|---|
| H1 fontSize | 63px | 40px | `font-size: 63px` |
| H2 fontSize | 45px | 28.8px | `font-size: 45px` |
| H3 fontSize | 30px | 24px | `font-size: 30px` |
| Heading fontWeight | 400 | 600 | `font-weight: 400` |
| Body/P color | `#2c2930` | `#554030` | Token stimmt, wird überschrieben |
| P lineHeight | 25px (1.39) | 29.92px (1.7) | `line-height: 1.4` |

### 3. SERVER-AUTONOMIE (KRITISCH — dev.steirischursprung.at ist UNVERÄNDERT)

Session 16 hat Werkzeuge gebaut (QA, Images, Lexical), aber ALLES steckt NUR in der
lokalen CLI. Der inFactory Server (025-CBU-5025:3369) hat NICHTS davon.
`infactory update` holt nur cli/ + server/ von GitHub — KEINE Referenz-Themes, KEINE Tools.

**Server braucht:**
- QA-Endpunkte: POST /api/qa/compare, /api/qa/batch, /api/qa/structure
- Lexical-Upgrade: POST /api/ghost/pages/upgrade-lexical
- Image audit+list Endpunkte
- Python-Tools auf LXC (shot-scraper, crawl4ai, Playwright venv)
- Referenz-Themes zugänglich (Design-Entscheidung: im Repo? Separater Fetch?)
- odiff-bin + pngjs in server/package.json

**Design-Prinzip:** Der AI Agent ist der ARCHITEKT, der Server ist die FABRIK.
Die Fabrik muss alle Werkzeuge und Materialien SELBST haben.

### 4. Plugin-System / Add-on Architektur

Plugin-System bei dem man bei Bedarf Funktionalitäten wie
"XED /Restore" oder "Content-Extraktion" (Quelle-A vs Ziel-B) einbinden kann.
crawl4ai ist die Engine dafür.

### 5. Fehlende Seiten

- Wellness (`/wellness/`) — nicht im Archiv
- Ursprung Dorf (`/ursprung-dorf/`) — nicht im Archiv

### 6. Mobile-Optimierung

- Hamburger-Menü mit Dropdowns testen
- Logo-Größe Mobile (60px)
- Footer responsive

---

## NICHT TUN (harte Regeln, alle erlitten in Sessions 1-12)

- **NICHT CSS-Werte raten oder schätzen** — immer messen (Session 5: goldener Kreis komplett falsch)
- **NICHT neue CSS-Klassen für bestehende Blöcke erfinden** — einheitliche Klassen nutzen
- **NICHT `<a>` in `<a>` verschachteln** — bricht Grid-Layout (Session 8). Buttons als `<span>`
- **NICHT Bootstrap oder Tailwind einbauen** — eigenes CSS nach Pico-Vorbild
- **NICHT proprietäre BeTheme-Elemente kopieren** — alles in purem Open-Source CSS
- **NICHT mit aktivem Cloudflare Proxy entwickeln** — cached alles aggressiv
- **NICHT `locations-wo.conf` bei Ghost-Sites verwenden** — blockiert Ghost-Funktionalität
- **NICHT `/etc/nginx/common/` editieren** — wird von WordOps überschrieben
- **NICHT Heading/Body Fonts tauschen** — Session 5 korrigiert, NIE WIEDER (Crimson=Heading, Josefin=Body)
- **NICHT Ghost `html` Feld für Content verwenden** — wird ignoriert, NUR `lexical`
- **NICHT `mobiledoc` für Updates verwenden** — wird bei bestehenden Pages ignoriert, Page löschen + neu erstellen

---

## Professioneller Workflow (Pflicht für jede Seite)

### Phase 1: Messen (BEVOR CSS geschrieben wird)

```bash
source crawler/bin/.venv/bin/activate

# Full-Page Screenshots (Cookie-Banner entfernen!)
shot-scraper 'https://arv.steirischursprung.at/SEITE/' \
  --javascript "document.querySelectorAll('[class*=cookie],[id*=cookie]').forEach(e=>e.remove())" \
  -o /tmp/compare/original.png --width 1440 --wait 3000

shot-scraper 'https://dev.steirischursprung.at/SEITE/' \
  -o /tmp/compare/ghost.png --width 1440

# CSS-Werte messen (BEIDE Seiten!)
shot-scraper javascript URL "
(() => {
  const el = document.querySelector('SELECTOR');
  const cs = getComputedStyle(el);
  return {
    fontSize: cs.fontSize, fontFamily: cs.fontFamily,
    color: cs.color, backgroundColor: cs.backgroundColor,
    padding: cs.padding, margin: cs.margin,
    width: Math.round(el.getBoundingClientRect().width),
    height: Math.round(el.getBoundingClientRect().height)
  };
})()"
```

### Phase 2: Vergleichstabelle (Pflicht-Format)

```
| Eigenschaft | Original (gemessen) | Ghost (gemessen) | Status |
|---|---|---|---|
| H3 Font-Size | 30px | 26px | FIX: 30px |
| Badge Size | 105×105 rund | 40×30 Rechteck | FIX: Kreis |
```

### Phase 3: Implementieren + Verifizieren

1. CSS-Fixes aus der Tabelle ableiten
2. `node bin/infactory.js build --preset=steirischursprung --zip && deploy`
3. Erneut messen → Tabelle aktualisieren → alle OK? → Fertig

---

## Theme-Architektur (3 Seitentypen)

| Typ | Beispiel | Aufbau |
|---|---|---|
| **A — Raumseiten** | Bienenstock | Feature-Image → Title-Bar + Badge → 2-Spalten Content |
| **B — Übersichtsseiten** | Hotel, Feiern, Brauerei | Header → Title-Bar → Cards → CTA |
| **C — Blog/Posts** | Aktuelles | Header → Titel + Meta → Content → Tags |

---

## Alle Menü-Seiten (Stand dev.steirischursprung.at, Session 13)

| Seite | Slug | Status | Quelle |
|---|---|---|---|
| Hotel | `hotel` | ✔ Session 12 | arv |
| Erlebnishotel | `erlebnishotel` | ✔ Session 13 | arv |
| Angebote & Packages | `angebote-packages` | ✔ Session 13 | arv |
| Ursprung Wellness | `wellness` | ✗ fehlt | nicht im Archiv |
| Zimmer & Preise | `zimmer-preise` | ✔ Session 13 | arv |
| Erkundungstour | `zimmer-und-angebote-ursprung-tour` | ✔ Session 13 | arv |
| Ursprung Dorf | `ursprung-dorf` | ✗ fehlt | nicht im Archiv |
| Gutscheine | `gutscheine` | ✔ Session 13 | arv |
| Gasthaus | `gasthaus` | ✔ Session 13 | arv |
| Feiern & Genießen | `feiern-geniessen` | ✔ Session 12 | arv |
| Braustube | `zimmer-und-angebote-braustube` | ✔ Session 13 | arv |
| Veranstaltungssäle | `veranstaltungssaele` | ✔ Session 13 | arv |
| Hochzeiten | `hochzeiten` | ✔ Session 13 | arv |
| Seminar | `seminar` | ✔ Session 13 | arv |
| Bienenstock | `zimmer-und-angebote-bienenstock` | ✔ Session 12 | arv |
| Brauerei | `brauerei` | ✔ Session 12 | arv |
| Sonnenbierführung | `zimmer-und-angebote-sonnenbierfuehrung` | ✔ Session 13 | arv |
| Bierempfehlung | `bierempfehlung` | ✔ Session 13 | arv |
| Kontakt | `kontakt` | ✔ Session 13 | arv |
| Impressum | `impressum` | ✔ Session 13 | arv |
| Datenschutz | `datenschutz` | ✔ Session 13 | arv |

---

## BeTheme Section-Typen (wso-Klassen)

### Content-Sektionen (IMPORTIEREN)

| wso-Klasse | Beschreibung |
|---|---|
| `wso-portfolio-header` | Header-Bild (CSS background-image) |
| `wso-single-portfolio-title-section` | Titel-Bar (H1 + optional Kapazität) |
| `wso-single-portfolio-description` | Hauptcontent (Text, Bilder, Listen) |
| `wso-single-portfolio-features` | Feature-Cards (3-Spalten) |
| *(kein wso-Prefix)* | Generischer Content |

### Template-Sektionen (ÜBERSPRINGEN)

| Erkennung | Beschreibung |
|---|---|
| `wso-angebot-button` | CTA-Bar |
| `wso-news-carousel` oder `esg-grid` | News & Termine Grid |
| `id="wso-angebot-section"` | Weitere Angebote Grid |
| `wso-start-box-section` | Homepage Feature-Boxen |
| `section-decoration` | Zierleisten (sep-green) |
| Text: "Unsere News & Termine" | News-Section |
| Text: "Urlaub im schrägsten Hotel" | CTA-Section |
| `wso-single-portfolio-reservation` | Kontaktformular (wpcf7, NICHT importieren) |

### Bilder-Einbettung (3 Arten)

1. **Header/Slider** — CSS `background-image: url(...)` auf `.mcb-section`
2. **Inline Content** — `<img class="scale-with-grid" src="...">` in `.column_image`
3. **Revolution Slider** — `data-lazyload="..."` auf `<rs-slide>` (Achtung: `<img>` zeigt auf `dummy.png`)

### BeTheme Grid-System

| Klasse | Breite | Verwendung |
|---|---|---|
| `one` | 100% | Vollbreiter Text, Videos |
| `one-second` | 50% | Text + Bild nebeneinander |
| `one-third` | 33% | Feature-Cards (3 Spalten) |
| `one-fourth` | 25% | Preis-Badge, Placeholder |
| `three-fourth` | 75% | CTA-Bar Titel |

---

## Referenz: Alte README

Vollständige Session-Chronologie (Sessions 1-11) und detaillierte CSS-Fix-Tabellen:
`dev/bin/XED-Restore/templates/README.md` (1891 Zeilen)

---

*Erstellt: 2026-04-05 — aus 12 Sessions Erfahrung extrahiert*
*Aktualisiert: 2026-04-06 — Session 13 (Nav, Footer, 15 neue Pages)*
*Aktualisiert: 2026-04-09 — Session 14 (WHITEPAPER, inFactory Server, studio.xed.dev)*
*Aktualisiert: 2026-04-09 — Session 15 (Section Library v1.0, 21/28 Templates, Theme-Bibliothek)*
*Aktualisiert: 2026-04-09 — Session 16 (Lexical Converter, 31 Bilder migriert, infactory images CLI)*
