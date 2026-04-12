# inFactory Server — Factory Floor Controller

> Express REST API. Gesteuert von AI Agents via API-Key.
> Teil von XED /Studio.

> **Session 21 + Session 22 Port-Schema-Klarstellung (2026-04-12).** Dieses README stammt aus der Session-16/17-Ära und wurde nachträglich auf Track-A-Defaults (**Port 4368** statt veraltetem **3333**, Labels gespiegelt) aktualisiert. Vollständige und autoritative Architektur-Referenz: `dev/bin/XED-Studio/docs/WHITEPAPER.md` v1.6, insbesondere §13 (Target-Driver), §13.4 (`infactory.json`), §13.6 (Track-A Server-Topologie inkl. Vier-Zonen-Port-Schema) und §18.3 (Track-B Server-Topologie, Ghost-gekoppelt).
>
> **Port-Schema in vier +1000er-Zonen:**
>
> | Zone | Rolle | Pro |
> |---|---|---|
> | **2368+** | Ghost CMS | pro Ghost-Instanz (Default) |
> | **3368+** | **Track B** inFactory Server — `inFactory@ /Themes` Ghost-Theme-Fabrik (eingefroren). Config `/var/ghost/<domain>/.infactory/infactory.json`. NGINX-Proxy `/factory/`. Per-Instanz-Code in `.infactory/server/`. | pro Ghost-Instanz = Ghost + 1000 |
> | **4368+** | **Track A** inFactory Server — `inFactory@ /Studio` LEMP Section-Renderer (aktiv seit Session 19). Config `/var/xed/<tld>/infactory.json`. NGINX-Proxy `/xed/`. Zentraler Code in `/opt/infactory/`. | pro TLD = Ghost + 2000 |
> | **5368+** | **Studio-Payload** Next.js Server (dd-starter Fork, Puck UI + Payload Admin, ab Schritt 1.2 §15.3). Eigenständiger systemd-Service neben dem Track-A inFactory-Server. | pro TLD = Track-A + 1000 |
>
> Die curl-Beispiele unten verwenden `localhost:4368` als Track-A-Default.

## Architektur

```
Developer Workstation                    LXC 025-CBU-5025
┌──────────────────┐                    ┌──────────────────────────────┐
│ Claude Code      │   HTTPS + API-Key  │ inFactory Server (:4368)     │
│ (AI Agent)       │ ──────────────────→│   ├── Theme Build + Deploy   │
│                  │                    │   ├── Ghost Content CRUD     │
│                  │                    │   ├── Image Upload/Migrate   │
│                  │                    │   └── Ghost Restart          │
└──────────────────┘                    │                              │
                                        │ localhost:2369 ← Ghost DEV   │
                                        │ localhost:2368 ← Ghost WEB   │
                                        │ /var/ghost/ ← Filesystem     │
                                        └──────────────────────────────┘
```

## Deployment (SysOps)

### 1. Code auf Server kopieren

```bash
# Auf Developer Workstation:
rsync -av --exclude='node_modules' \
  dev/bin/XED-Studio/infactory-cli/ \
  dev/bin/XED-Studio/infactory-server/ \
  g-host@025-CBU-5025:/opt/infactory/
```

### 2. Setup auf dem Server

```bash
ssh g-host@025-CBU-5025
cd /opt/infactory/infactory-server

# .env erstellen
cp .env.example .env

# API-Key generieren
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → In .env eintragen: INFACTORY_API_KEY=<generierter key>

# Ghost Admin API Keys eintragen (aus Ghost Admin > Integrations):
# GHOST_DEV_URL=http://localhost:2369
# GHOST_DEV_KEY=<id>:<secret>
# GHOST_DEV_CONTENT_PATH=/var/ghost/steirischursprung.at/content

nano .env

# Dependencies installieren
npm install

# Auch für infactory-cli:
cd ../infactory-cli && npm install && cd ../infactory-server
```

### 3. Starten

```bash
# Direkt (Test):
node src/index.js

# Mit PM2 (Production):
pm2 start src/index.js --name infactory-server
pm2 save

# Oder als systemd Service:
sudo tee /etc/systemd/system/infactory.service << 'EOF'
[Unit]
Description=inFactory Server
After=network.target

[Service]
Type=simple
User=g-host
WorkingDirectory=/opt/infactory/infactory-server
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable infactory
sudo systemctl start infactory
```

### 4. Nginx Reverse Proxy (optional, für HTTPS)

```nginx
# /etc/nginx/sites-available/factory.steirischursprung.at
server {
    listen 443 ssl http2;
    server_name factory.steirischursprung.at;

    ssl_certificate     /etc/letsencrypt/live/factory.steirischursprung.at/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/factory.steirischursprung.at/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4368;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

### 5. Bild-Archiv bereitstellen (für Image Migration)

```bash
# Archiv vom Dev-Rechner auf Server kopieren:
rsync -av dev/bin/XED-Restore/archive/www.steirischursprung.at/ \
  g-host@025-CBU-5025:/opt/infactory/archive/www.steirischursprung.at/

# In .env eintragen:
# IMAGE_ARCHIVE_PATH=/opt/infactory/archive/www.steirischursprung.at
```

---

## API-Referenz

### Auth

Alle Endpunkte (außer `/api/health`) erfordern:
```
X-API-Key: <INFACTORY_API_KEY aus .env>
```

### Health

```bash
curl http://localhost:4368/api/health
```

### Theme Build

```bash
curl -X POST http://localhost:4368/api/theme/build \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"preset": "steirischursprung"}'
```

### Theme Deploy

```bash
curl -X POST http://localhost:4368/api/theme/deploy \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"preset": "steirischursprung", "site": "dev", "activate": true}'
```

### Pages auflisten

```bash
curl "http://localhost:4368/api/ghost/pages?site=dev&limit=50" \
  -H "X-API-Key: $KEY"
```

### Page erstellen

```bash
curl -X POST http://localhost:4368/api/ghost/pages?site=dev \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "slug": "test", "html": "<p>Hello</p>", "status": "draft"}'
```

### Bild hochladen (von URL)

```bash
curl -X POST "http://localhost:4368/api/ghost/images/upload?site=dev" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://arv.steirischursprung.at/wp-content/uploads/2016/09/hotel.jpg"}'
```

### Bilder einer Page migrieren

```bash
# Dry Run (nur analysieren):
curl -X POST "http://localhost:4368/api/ghost/images/migrate?site=dev" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug": "hotel", "source": "archive", "dry_run": true}'

# Echt migrieren:
curl -X POST "http://localhost:4368/api/ghost/images/migrate?site=dev" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug": "hotel", "source": "archive"}'
```

### Ghost Restart

```bash
curl -X POST http://localhost:4368/api/system/restart \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"site": "dev"}'
```

### Ghost Status

```bash
curl http://localhost:4368/api/system/status \
  -H "X-API-Key: $KEY"
```

### Presets

```bash
# Liste
curl http://localhost:4368/api/theme/presets -H "X-API-Key: $KEY"

# Laden
curl http://localhost:4368/api/theme/presets/steirischursprung -H "X-API-Key: $KEY"

# Speichern (YAML als raw String)
curl -X PUT http://localhost:4368/api/theme/presets/steirischursprung \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"raw": "id: steirischursprung\nname: ..."}'
```

### Sections Registry

```bash
curl http://localhost:4368/api/theme/sections -H "X-API-Key: $KEY"
```

### NGINX Static Target (Track A — Schritt A, LEMP Section-Renderer)

Ab Server-Version 1.2 unterstützt der inFactory Server einen **NGINX-Static-Target-Driver**: er schreibt vom Server kompiliertes HTML/CSS/JS direkt in einen explizit konfigurierten NGINX-Webroot. Das ist der erste Baustein der `inFactory@ /Studio` **Track-A**-Architektur (aktiv, siehe `dev/bin/XED-Studio/docs/WHITEPAPER.md` v1.6 §13.2 NGINX-Target-Driver + §15.1 Schritt A). In Session 20 produktiv gesetzt auf `jam.steirischursprung.at`. Historie: Bis Session 20 trug dieser Pfad das alte Label „Track B" — siehe §3.2 Namens-Bridge.

**Sicherheitsmodell:** Der Server schreibt **ausschließlich** in Webroots, die in der Server-Config explizit als Allowlist hinterlegt sind. Pfad-Traversal (`..`), absolute Pfade und Null-Bytes werden abgelehnt. Der normalisierte Zielpfad wird gegen den konfigurierten Webroot validiert.

**Konfiguration in `infactory.json`:**

```json
{
  "infactory_port": 4368,
  "api_key": "...",
  "nginx_sites": {
    "jam": { "webroot": "/var/www/jam.steirischursprung.at/htdocs/" }
  }
}
```

(Im `.env`-Fallback alternativ: `NGINX_SITES_JSON='{"jam":{"webroot":"/var/www/jam.steirischursprung.at/htdocs/"}}'`)

**Konfigurierte Sites auflisten:**

```bash
curl http://localhost:4368/api/nginx/sites -H "X-API-Key: $KEY"
# → { sites: { jam: { webroot, exists, writable } }, count: 1 }
```

**Datei in einen Webroot schreiben:**

```bash
curl -X POST http://localhost:4368/api/nginx/write \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site": "jam",
    "path": "index.html",
    "content": "<!DOCTYPE html><html><body><h1>Hello from inFactory</h1></body></html>"
  }'
# → { ok: true, site: "jam", path: "index.html", absolute: "/var/www/.../index.html", bytes: 78, mtime: "..." }
```

**Body-Felder:**

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `site` | String | ja | Schlüssel aus `nginx_sites` (z.B. `"jam"`) |
| `path` | String | ja | Relativer Pfad innerhalb des Webroots (z.B. `"index.html"`, `"hotel/index.html"`) |
| `content` | String | ja | Datei-Inhalt |
| `encoding` | String | nein | `"utf8"` (Default) oder `"base64"` für Binärdaten |

**Fehlerfälle:**

- `400` — `path` enthält `..`, ist absolut, leer, oder enthält Null-Bytes
- `400` — Resolved Pfad verlässt den Webroot
- `404` — `site` ist nicht in `nginx_sites` konfiguriert (Antwort enthält `configured_sites` und `hint`)
- `500` — Schreiben fehlgeschlagen (Permissions, Disk-Space, etc.) — Antwort enthält `absolute` und Original-Fehlermeldung

---

## Dependencies (aktuell)

```
express   ^4.21.0    HTTP Server
cors      ^2.8.5     Cross-Origin (für Remote-Agents)
js-yaml   ^4.1.0     Preset YAML Parsing
```

## FEHLENDE FÄHIGKEITEN (Session 16 erkannt — Session 17 Aufgabe)

Der Server ist aktuell ein **dummes Terminal**. Er kann Build+Deploy, aber:

| Fähigkeit | Status | Was fehlt |
|---|---|---|
| **QA-Sensoren** | ✗ FEHLT | odiff, shot-scraper, crawl4ai — alle nur lokal |
| **Referenz-Themes** | ✗ FEHLT | 43 MIT + 10 Themex liegen nur auf der Workstation |
| **Lexical-Upgrade** | ✗ FEHLT | html-to-lexical.js nur in CLI |
| **Image audit/list** | ✗ FEHLT | Nur upload + migrate existieren |
| **Struktur-Analyse** | ✗ FEHLT | crawl4ai nur lokal |
| **Python-Tools** | ✗ FEHLT | Kein venv auf dem LXC (shot-scraper, crawl4ai) |

### Fehlende API-Endpunkte

```
POST /api/qa/compare                  { source, target, width }
POST /api/qa/batch                    { source_base, target_base, slugs }
POST /api/qa/structure                { url }
POST /api/ghost/pages/upgrade-lexical { slug | all, dry_run }
GET  /api/ghost/images/audit          ?hostname=...
GET  /api/ghost/images/list
GET  /api/theme/references            → Referenz-Themes auflisten
```

### Fehlende Dependencies

```
odiff-bin             Pixel-Diff (CIE76 Lab ΔE)
pngjs                 PNG encode/decode
```

### Fehlende Python-Tools (eigenes venv auf LXC nötig)

```
shot-scraper          Screenshots + getComputedStyle
crawl4ai              Strukturierte Content-Extraktion
playwright            Browser-Engine für shot-scraper
```

### Design-Fragen (offen)

1. Wo liegen Referenz-Themes auf dem Server? (Im Repo? Separater Fetch? /opt/infactory/references/?)
2. Wie kommt das Themex-Bundle (Commercial) auf den Server?
3. Wird QA auf dem Server oder lokal ausgeführt? (Server = autonomer, lokal = einfacher)
4. `infactory update` muss ALLES aktualisieren — nicht nur cli/ + server/

---

*MIT License — XED.dev*
