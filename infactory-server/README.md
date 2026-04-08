# inFactory Server — Factory Floor Controller

> Express REST API auf dem Ghost-Host. Gesteuert von AI Agents via API-Key.
> Teil von XED /Studio.

## Architektur

```
Developer Workstation                    LXC 025-CBU-5025
┌──────────────────┐                    ┌──────────────────────────────┐
│ Claude Code      │   HTTPS + API-Key  │ inFactory Server (:3333)     │
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
        proxy_pass http://127.0.0.1:3333;
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
curl http://localhost:3333/api/health
```

### Theme Build

```bash
curl -X POST http://localhost:3333/api/theme/build \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"preset": "steirischursprung"}'
```

### Theme Deploy

```bash
curl -X POST http://localhost:3333/api/theme/deploy \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"preset": "steirischursprung", "site": "dev", "activate": true}'
```

### Pages auflisten

```bash
curl "http://localhost:3333/api/ghost/pages?site=dev&limit=50" \
  -H "X-API-Key: $KEY"
```

### Page erstellen

```bash
curl -X POST http://localhost:3333/api/ghost/pages?site=dev \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "slug": "test", "html": "<p>Hello</p>", "status": "draft"}'
```

### Bild hochladen (von URL)

```bash
curl -X POST "http://localhost:3333/api/ghost/images/upload?site=dev" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://arv.steirischursprung.at/wp-content/uploads/2016/09/hotel.jpg"}'
```

### Bilder einer Page migrieren

```bash
# Dry Run (nur analysieren):
curl -X POST "http://localhost:3333/api/ghost/images/migrate?site=dev" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug": "hotel", "source": "archive", "dry_run": true}'

# Echt migrieren:
curl -X POST "http://localhost:3333/api/ghost/images/migrate?site=dev" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug": "hotel", "source": "archive"}'
```

### Ghost Restart

```bash
curl -X POST http://localhost:3333/api/system/restart \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"site": "dev"}'
```

### Ghost Status

```bash
curl http://localhost:3333/api/system/status \
  -H "X-API-Key: $KEY"
```

### Presets

```bash
# Liste
curl http://localhost:3333/api/theme/presets -H "X-API-Key: $KEY"

# Laden
curl http://localhost:3333/api/theme/presets/steirischursprung -H "X-API-Key: $KEY"

# Speichern (YAML als raw String)
curl -X PUT http://localhost:3333/api/theme/presets/steirischursprung \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"raw": "id: steirischursprung\nname: ..."}'
```

### Sections Registry

```bash
curl http://localhost:3333/api/theme/sections -H "X-API-Key: $KEY"
```

---

## Dependencies

```
express   ^4.21.0    HTTP Server
cors      ^2.8.5     Cross-Origin (für Remote-Agents)
js-yaml   ^4.1.0     Preset YAML Parsing
```

Keine weiteren Dependencies. JWT, Multipart-Upload, HTTP-Client — alles mit Node.js Built-ins.

---

*MIT License — XED.dev*
