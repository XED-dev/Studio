/**
 * inFactory Server v1.0 — Factory Floor Controller
 *
 * Express REST API auf dem Ghost-Host (LXC 025-CBU-5025).
 * Gesteuert von AI Agents via X-API-Key.
 *
 * Endpunkte:
 *   GET  /api/health                 → Server + Ghost Status
 *   POST /api/theme/build            → Preset → ZIP
 *   POST /api/theme/deploy           → Build + Upload + Activate
 *   GET  /api/theme/presets           → Preset-Liste
 *   GET  /api/theme/presets/:id       → Preset YAML
 *   PUT  /api/theme/presets/:id       → Preset YAML speichern
 *   GET  /api/theme/sections          → Section Registry
 *   GET  /api/ghost/pages             → Pages auflisten
 *   GET  /api/ghost/pages/:slug       → Einzelne Page
 *   POST /api/ghost/pages             → Page erstellen/aktualisieren
 *   GET  /api/ghost/posts             → Posts auflisten
 *   POST /api/ghost/posts             → Post erstellen/aktualisieren
 *   POST /api/ghost/images/upload     → Bild hochladen
 *   POST /api/ghost/images/migrate    → Bilder einer Page migrieren
 *   POST /api/system/restart          → Ghost Restart
 *   GET  /api/system/status           → Ghost Status
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const config  = require('./config');
const auth    = require('./auth');

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));  // Groß wegen Base64-Bilder

// Health ohne Auth (für Monitoring)
app.use('/api/health', require('./routes/health'));

// Alle anderen Routes mit Auth
app.use('/api/theme',  auth, require('./routes/theme'));
app.use('/api/ghost',  auth, require('./routes/ghost'));
app.use('/api/system', auth, require('./routes/system'));

// ─── Error Handler ────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Interner Serverfehler', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  const sites = Object.keys(config.sites).join(', ') || '(keine)';
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║  inFactory Server v1.0                       ║
  ║  Factory Floor Controller for Ghost CMS      ║
  ╚══════════════════════════════════════════════╝

  Port:       ${config.port}
  Ghost Sites: ${sites}
  CLI:        ${config.cliPath}
  Archiv:     ${config.imageArchivePath || '(nicht konfiguriert)'}

  API:  http://localhost:${config.port}/api/health
  Auth: X-API-Key Header
  `);
});
