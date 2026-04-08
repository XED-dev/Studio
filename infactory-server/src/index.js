/**
 * inFactory Server v1.0 — Factory Floor Controller
 *
 * Express REST API auf dem Ghost-Host.
 * Gesteuert von AI Agents via X-API-Key.
 *
 * Features:
 *   - Auto-Sleep: Stoppt sich nach N Minuten Inaktivität
 *   - systemd Restart=on-failure weckt ihn bei nächster Anfrage
 *   - Liest Config aus infactory.json (via INFACTORY_CONFIG ENV)
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const config  = require('./config');
const auth    = require('./auth');

const app = express();

// ─── Auto-Sleep Timer ─────────────────────────────────────────────────────────

const SLEEP_MS = (config.autoSleepMinutes || 360) * 60 * 1000;
let sleepTimer = null;

function resetSleepTimer() {
  if (sleepTimer) clearTimeout(sleepTimer);
  if (SLEEP_MS > 0) {
    sleepTimer = setTimeout(() => {
      console.log(`\n  Auto-Sleep: ${config.autoSleepMinutes} Minuten Inaktivität — Server stoppt.`);
      console.log('  Neustart via systemd oder: infactory start\n');
      process.exit(0);
    }, SLEEP_MS);
    sleepTimer.unref(); // Timer verhindert nicht process.exit bei SIGTERM
  }
}

// Activity-Tracking Middleware — jeder Request setzt Timer zurück
app.use((req, res, next) => {
  resetSleepTimer();
  next();
});

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health ohne Auth (für Monitoring + Wakeup)
app.use('/api/health', require('./routes/health'));

// Alle anderen Routes mit Auth
app.use('/api/theme',  auth, require('./routes/theme'));
app.use('/api/ghost',  auth, require('./routes/ghost'));
app.use('/api/system', auth, require('./routes/system'));

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Interner Serverfehler', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  const sites = Object.entries(config.sites)
    .filter(([k]) => k !== 'local')
    .map(([k, v]) => `${k}: ${v.url}`)
    .join(', ') || Object.values(config.sites).map(v => v.url).join(', ') || '(keine)';

  console.log(`
  inFactory Server v1.0
  ${config.domain || 'Factory Floor Controller'}

  Port:        ${config.port}
  Ghost:       ${sites}
  CLI:         ${config.cliPath}
  Auto-Sleep:  ${config.autoSleepMinutes} min
  Config:      ${config.configPath || '.env (Legacy)'}

  http://localhost:${config.port}/api/health
  `);

  // Initialen Sleep-Timer starten
  resetSleepTimer();
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('\n  SIGTERM — Server stoppt...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n  SIGINT — Server stoppt...');
  server.close(() => process.exit(0));
});
