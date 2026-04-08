/**
 * routes/system.js — System Operations (Ghost Restart, Status)
 *
 * ACHTUNG: ghost restart erfordert, dass der Server-User (g-host)
 * das Recht hat, Ghost zu restarten (ghost-cli oder systemctl).
 */

'use strict';

const express = require('express');
const { execSync } = require('child_process');
const config  = require('../config');

const router = express.Router();

/**
 * POST /api/system/restart
 * Body: { site: "dev"|"web" } (optional, default: alle)
 *
 * Führt `ghost restart` im Ghost-Verzeichnis aus.
 */
router.post('/restart', (req, res) => {
  const { site: siteName } = req.body;

  // Ghost-Verzeichnisse aus contentPath ableiten
  // contentPath: /var/ghost/steirischursprung.at/content → ghostDir: /var/ghost/steirischursprung.at
  const targets = [];

  if (siteName) {
    const s = config.sites[siteName];
    if (!s) return res.status(400).json({ error: `Site "${siteName}" nicht konfiguriert` });
    if (s.contentPath) targets.push({ name: siteName, dir: s.contentPath.replace(/\/content\/?$/, '') });
  } else {
    for (const [name, s] of Object.entries(config.sites)) {
      if (s.contentPath) targets.push({ name, dir: s.contentPath.replace(/\/content\/?$/, '') });
    }
  }

  if (targets.length === 0) {
    return res.status(400).json({
      error: 'Kein Ghost-Verzeichnis konfiguriert (contentPath fehlt in .env)'
    });
  }

  const results = [];
  for (const target of targets) {
    try {
      const output = execSync('ghost restart', {
        cwd:      target.dir,
        encoding: 'utf8',
        timeout:  60000,
      });
      results.push({ site: target.name, ok: true, output: output.trim() });
    } catch (err) {
      results.push({
        site: target.name,
        ok: false,
        error: err.stderr || err.message,
        output: err.stdout || '',
      });
    }
  }

  const allOk = results.every(r => r.ok);
  res.status(allOk ? 200 : 500).json({ results });
});

/**
 * GET /api/system/status
 *
 * Ghost-Status für alle konfigurierten Sites.
 */
router.get('/status', (req, res) => {
  const results = [];

  for (const [name, site] of Object.entries(config.sites)) {
    const ghostDir = site.contentPath ? site.contentPath.replace(/\/content\/?$/, '') : null;

    if (!ghostDir) {
      results.push({ site: name, status: 'unknown', reason: 'contentPath nicht konfiguriert' });
      continue;
    }

    try {
      const output = execSync('ghost status', {
        cwd:      ghostDir,
        encoding: 'utf8',
        timeout:  10000,
      });
      // Parse: "running (production)" oder "stopped"
      const running = output.includes('running');
      results.push({ site: name, status: running ? 'running' : 'stopped', output: output.trim() });
    } catch (err) {
      results.push({ site: name, status: 'error', error: err.stderr || err.message });
    }
  }

  res.json({ results });
});

module.exports = router;
