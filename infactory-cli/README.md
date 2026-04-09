# inFactory CLI by XED.dev

> Ghost Theme Generator — Scaffold, Build, Preview, Compose, Deploy.
> Teil der XED /Suite · Domain: infactory.com · Lizenz: MIT

[![npm version](https://img.shields.io/npm/v/@infactory/cli)](https://www.npmjs.com/package/@infactory/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ghost 6](https://img.shields.io/badge/Ghost-6.x-15171a)](https://ghost.org)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

inFactory ist ein Open-Source CLI-Tool für Ghost-Theme-Entwicklung.  
Von `infactory new` bis `infactory deploy` — ohne einmal den Ghost Admin zu öffnen.

---

## PFLICHT: Neue Session? ZUERST LESEN!

### Für das SteirischUrsprung-Projekt

**Lies `BETHEME.md`** bevor du am SteirischUrsprung-Projekt arbeitest!
Diese Datei enthält alle Design-Tokens, Seitenstrukturen, Measurement-Regeln
und Fallen aus 16 Sessions Erfahrung. **Offene Punkte für die nächste Session
stehen am Ende der BETHEME.md** (Abschnitt "OFFENE PUNKTE für Session 17").

### Ghost 6.x — Kritische Regeln

1. **`{{#post}}` Block-Helper ist PFLICHT:** In `page.hbs` und `post.hbs` MUSS der gesamte
   Content in `{{#post}}...{{/post}}` eingewickelt sein. Ohne diesen Block sind
   `{{title}}`, `{{content}}`, `{{slug}}` etc. ALLE undefined.

2. **Content-Format = Lexical:** Ghost 6.x ignoriert das `html` Feld beim API-Erstellen.
   NUR `lexical` wird akzeptiert:
   ```json
   {"root":{"children":[{"type":"html","version":1,"html":"<h2>...</h2><p>...</p>"}],
     "direction":null,"format":"","indent":0,"type":"root","version":1}}
   ```

3. **Ghost Accent Color:** Ghost injiziert `--ghost-accent-color` via `ghost_head` und
   überschreibt damit CSS-Variablen. Theme-CSS muss eigene Token-Variablen als Authority
   verwenden. Accent Color im Ghost Admin auf `#006633` setzen.

4. **Nach Theme-Upload:** Ghost braucht manchmal einen Restart (`ghost restart`) um neue
   `.hbs`-Templates zu laden. CSS/Bilder brauchen nur Hard Reload.

5. **GScan-Validierung:** Ghost prüft Themes beim Upload. Häufige Fehler:
   - `author.email` in package.json fehlt
   - `.kg-width-wide` CSS-Klasse muss exakt existieren
   - Unused `@custom.*` Settings → Error
   - `@page.show_title_and_feature_image` erst ab Ghost 6.27+

### Verzeichnisstruktur

```
infactory-cli/
├── bin/infactory.js           ← CLI Entry Point
├── src/
│   ├── build.js               ← Preset → Ghost Theme (ZIP)
│   ├── deploy.js              ← Ghost Admin API Deploy (JWT + Upload + Activate)
│   ├── ghost-api.js           ← Ghost Admin API Client (Pages, Posts, Lexical)
│   ├── scaffold.js            ← infactory new: Projektstruktur
│   ├── preview-server.js      ← Lokaler Ghost Preview (express-hbs + Hot Reload)
│   ├── generate-tokens.js     ← Preset YAML → tokens.css (CSS Custom Properties)
│   ├── compose-sections.js    ← Section-Partials → home.hbs
│   ├── section-composer.js    ← add/remove/move Sections in Presets
│   ├── preset-clone.js        ← Preset forken mit Token-Overrides
│   ├── hbs-stubs.js           ← Ghost Handlebars Helper Stubs für Preview
│   ├── mock-data.js           ← Fake Ghost Content API für Preview
│   └── infactory-config-template.json
├── base-theme/                ← Ghost 6 Handlebars Templates
│   ├── default.hbs            ← Base-Layout (Nav + Footer + {{{body}}})
│   ├── index.hbs              ← Homepage Fallback → home.hbs
│   ├── page.hbs               ← Statische Seiten ({{#post}} Context!)
│   ├── post.hbs               ← Blog-Posts ({{#post}} Context!)
│   ├── author.hbs, tag.hbs    ← Archiv-Templates
│   ├── error.hbs, error-404.hbs
│   ├── partials/              ← head, navigation, footer, pagination
│   ├── sections/              ← Wiederverwendbare Section-Partials
│   │   ├── hero/hero-slider.hbs
│   │   ├── features/feature-cards-3col.hbs
│   │   ├── cta/cta-bar.hbs
│   │   └── posts/news-grid.hbs
│   └── assets/css/            ← tokens.css (generated), base.css, style.css
├── presets/                   ← YAML Design-Presets
│   ├── steirischursprung.yaml ← 65 Tokens, 4 Sections
│   ├── blog.yaml, agency.yaml, saas.yaml, studio.yaml
├── sections/registry.json     ← 28 Sections in 7 Kategorien
├── seed-steirischursprung.js  ← Content-Seeder (4 Pages + 4 Featured Posts)
├── BETHEME.md                 ← BeTheme-Referenz für SteirischUrsprung
├── CHANGELOG.md
└── package.json               ← type: "commonjs", Dependencies installiert
```

### Ghost API Keys

```
/tmp/.dev.ghost_key  → dev.steirischursprung.at (Ghost 6.26.0, Port 2369)
/tmp/.web.ghost_key  → web.steirischursprung.at (Ghost 6.26.0, Port 2368)
```

### Häufige Befehle

```bash
# Theme bauen + deployen
node bin/infactory.js build --preset=steirischursprung --zip
INFACTORY_GHOST_URL=https://dev.steirischursprung.at \
INFACTORY_GHOST_KEY=$(cat /tmp/.dev.ghost_key) \
node bin/infactory.js deploy --preset=steirischursprung --skip-build

# Content seeden (Pages + Featured Posts)
INFACTORY_GHOST_URL=https://dev.steirischursprung.at \
INFACTORY_GHOST_KEY=$(cat /tmp/.dev.ghost_key) \
node seed-steirischursprung.js

# Screenshot zur Verifizierung
source crawler/bin/.venv/bin/activate
shot-scraper https://dev.steirischursprung.at/ -w 1440 -h 900 -o /tmp/screenshot.png
```

---

## Installation

```bash
cd dev/bin/XED-Studio/infactory-cli
npm install
```

Voraussetzung: Node.js >= 18

---

## Schnellstart

```bash
# 1. Projekt anlegen
infactory new --name=mein-blog --preset=blog

# 2. Wechsle ins Projektverzeichnis
cd mein-blog

# 3. Lokal vorschauen (Hot Reload)
infactory preview --preset=blog

# 4. Sections anpassen
infactory section add social_proof_bar --preset=blog --force
infactory section layout --preset=blog

# 5. Preset forken & Farbe anpassen
infactory preset clone blog --name=mein-blog --color=#e11d48

# 6. Builden + auf Ghost deployen
infactory deploy --preset=mein-blog \
  --url=https://mein.blog \
  --key=<id>:<secret>
```

---

## Befehle

### `infactory new`

Legt ein vollständiges Ghost-Theme-Projekt an.

```bash
infactory new --name=<slug> [--preset=<id>] [--mode=copy|link]
```

| Flag | Default | Beschreibung |
|------|---------|--------------|
| `--name` | — | Projektname / Slug (Pflicht) |
| `--preset` | `blog` | Startpreset |
| `--mode` | `copy` | `copy`: standalone, `link`: Symlink auf CLI-Pool |
| `--out` | cwd | Übergeordnetes Verzeichnis |
| `--no-git` | — | Kein `.gitignore` |

---

### `infactory build`

Baut ein Ghost-Theme aus Preset + Sections.

```bash
infactory build --preset=<id> [--zip] [--out=./dist]
```

---

### `infactory preview`

Startet einen lokalen Preview-Server mit Hot Reload und Ghost-kompatibler Template-Engine.

```bash
infactory preview --preset=<id> [--port=2369] [--no-open] [--mock=data.json]
```

---

### `infactory deploy`

Baut, zippt und deployt direkt auf Ghost via Admin API.

```bash
infactory deploy --preset=<id> --url=https://mein.blog --key=<id>:<secret>
```

| Flag | Beschreibung |
|------|-------------|
| `--url` | Ghost URL (auch via `INFACTORY_GHOST_URL`) |
| `--key` | Admin API Key `id:secret` (auch via `INFACTORY_GHOST_KEY`) |
| `--no-activate` | Hochladen ohne Aktivieren |
| `--dry-run` | Nur bauen, kein Upload |
| `--skip-build` | Kein Rebuild, existierendes ZIP verwenden |

**Key-Sicherheit:** Den Key nie in `.infactory.json` oder in Git speichern.  
Empfehlung: ENV-Variable oder CI/CD Secret.

```bash
export INFACTORY_GHOST_URL=https://mein.blog
export INFACTORY_GHOST_KEY=6746f21e8329c700017c65a1:a9b0c123...
infactory deploy --preset=mein-blog
```

**Admin API Key anlegen:**  
Ghost Admin → Settings → Integrations → Add custom integration → Admin API Key kopieren.

---

### `infactory preset`

Presets forken und verwalten.

```bash
# Klonen mit Overrides
infactory preset clone blog --name=mein-blog
infactory preset clone agency --name=client-xyz --color=#e11d48
infactory preset clone saas --name=my-saas --font-display="'Boska', serif"
infactory preset clone blog --name=newsletter --sections=hero_centered,posts_featured,cta_newsletter

# Alle Presets anzeigen
infactory preset list

# Preset löschen
infactory preset remove mein-blog --force
```

---

### `infactory section`

Sections im Layout eines Presets verwalten.

```bash
infactory section add    <id> --preset=<id> [--pos=N] [--force]
infactory section remove <id> --preset=<id>
infactory section move   <id> --preset=<id> --pos=N
infactory section layout      --preset=<id>
infactory section list        [--preset=<id>]
infactory section search <query>
```

---

## Presets

| Preset | Beschreibung | Sections |
|--------|-------------|---------|
| `blog` | Persönlicher Blog / Newsletter | 4 |
| `agency` | Digitalagentur | 4 |
| `saas` | SaaS-Produkt / Software | 5 |
| `studio` | Design Studio / Portfolio | 4 |

---

## `.infactory.json`

Jedes Projekt enthält eine `.infactory.json`. Im Projektverzeichnis werden `--preset`-Flags automatisch aus der Config gelesen.

```json
{
  "version": "0.7",
  "name": "mein-blog",
  "preset": "blog",
  "build": {
    "outputDir": "./dist",
    "baseThemeDir": "./base-theme",
    "presetsDir": "./presets",
    "registryPath": "./sections/registry.json"
  },
  "preview": { "port": 2369, "open": true },
  "deploy": {
    "url": "https://mein.blog"
  },
  "studio": { "enabled": false, "api": "http://localhost:2370" }
}
```

---

## CI/CD — GitHub Actions Beispiel

```yaml
name: Deploy Ghost Theme

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g @infactory/cli
      - run: infactory deploy --preset=mein-blog
        env:
          INFACTORY_GHOST_URL: ${{ secrets.GHOST_URL }}
          INFACTORY_GHOST_KEY: ${{ secrets.GHOST_ADMIN_KEY }}
```

---

## Lizenz

MIT — Themes, die mit inFactory gebaut werden, können ohne Einschränkung kommerziell verwendet, verkauft und weitergegeben werden.
