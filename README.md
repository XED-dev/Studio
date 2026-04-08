# XED /Studio

> AI-Agent-First Ghost Theme Factory — from preset to production in seconds.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ghost 6](https://img.shields.io/badge/Ghost-6.x-15171a)](https://ghost.org)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

XED /Studio is a CLI-native Ghost CMS theme factory designed for AI coding agents.
No browser. No drag-and-drop. Just YAML presets, Handlebars sections, and a deploy pipeline.

**Website:** [studio.xed.dev](https://studio.xed.dev)

---

## Components

### inFactory CLI

Build Ghost themes from YAML presets with a token-based design system.

```bash
cd infactory-cli && npm install

# Scaffold a new project
node bin/infactory.js new --name=myblog --preset=blog

# Build theme
node bin/infactory.js build --preset=blog --zip

# Deploy to Ghost
INFACTORY_GHOST_URL=https://myblog.ghost.io \
INFACTORY_GHOST_KEY=<id>:<secret> \
node bin/infactory.js deploy --preset=blog
```

**5 built-in presets:** blog, agency, saas, studio, steirischursprung
**28 sections** in 7 categories (hero, posts, features, CTA, social proof, navigation, misc)

### inFactory Server

Factory Floor Controller — an Express API running on your Ghost host.
AI agents control it remotely via API key.

```bash
cd infactory-server && npm install
cp .env.example .env
# Edit .env: set API key + Ghost credentials
node src/index.js
```

**17 API endpoints:** theme build/deploy, Ghost content CRUD, image upload/migration, Ghost restart.

See [infactory-server/README.md](infactory-server/README.md) for the full API reference.

---

## Architecture

```
Developer Workstation                    Ghost Host
┌──────────────────┐                    ┌──────────────────────────────┐
│ AI Agent         │   HTTPS + API-Key  │ inFactory Server (:3333)     │
│ (Claude Code,    │ ──────────────────→│   ├── Theme Build + Deploy   │
│  Gemini CLI,     │                    │   ├── Ghost Content CRUD     │
│  any CLI agent)  │                    │   ├── Image Upload/Migrate   │
│                  │                    │   └── Ghost Restart          │
└──────────────────┘                    │                              │
                                        │ localhost ← Ghost CMS        │
                                        │ /var/ghost/ ← Filesystem     │
                                        └──────────────────────────────┘
```

---

## Why CLI-first?

Every major website builder (Elementor, v0.dev, bolt.new, Lovable) requires a browser GUI.
None of them can be driven by an AI coding agent in a terminal.

XED /Studio fills this gap: a Ghost theme factory where the primary user is an AI agent,
not a human clicking buttons.

| Feature | Elementor | v0.dev | XED /Studio |
|---|---|---|---|
| CLI interface | No | No | **Yes** |
| Ghost CMS native | No (WordPress) | No (React) | **Yes** |
| AI agent friendly | No | No | **Yes** |
| Open source | No | No | **MIT** |
| Zero external deps | No | No | **Yes** (JWT, multipart — all Node built-ins) |

---

## License

MIT — build, sell, and redistribute Ghost themes without restriction.

---

*Part of the [XED /Suite](https://xed.dev) — open-source tools for AI-native development.*
