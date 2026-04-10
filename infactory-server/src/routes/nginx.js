/**
 * routes/nginx.js — NGINX Static-File Target (Track B, Schritt A)
 *
 * Erster Target-Driver der neuen Architektur:
 * Schreibt vom inFactory Server kompiliertes HTML/CSS/JS direkt in
 * einen NGINX-Webroot. Die Sites sind in der Server-Config explizit
 * als Allowlist hinterlegt — kein generischer Filesystem-Zugriff.
 *
 * Konfiguration in infactory.json:
 *   "nginx_sites": {
 *     "jam": { "webroot": "/var/www/jam.steirischursprung.at/htdocs/" }
 *   }
 *
 * Endpunkte:
 *   GET  /api/nginx/sites          Liste der konfigurierten Sites
 *   POST /api/nginx/write          Eine Datei in einen Webroot schreiben
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const config  = require('../config');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSites() {
  return (config.nginxSites && typeof config.nginxSites === 'object') ? config.nginxSites : {};
}

/**
 * Validiert einen relativen Pfad innerhalb eines Webroots.
 * Wirft Error mit Status-Code-Hinweis bei Verstoß.
 */
function resolveSafe(webroot, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    const e = new Error('path fehlt oder leer'); e.status = 400; throw e;
  }
  if (relPath.startsWith('/') || relPath.startsWith('\\')) {
    const e = new Error('path muss relativ sein (kein führender Slash)'); e.status = 400; throw e;
  }
  if (relPath.includes('\0')) {
    const e = new Error('path enthält Null-Byte'); e.status = 400; throw e;
  }

  const webrootAbs = path.resolve(webroot);
  const targetAbs  = path.resolve(webrootAbs, relPath);

  // Defense in depth: normalisierter Zielpfad MUSS innerhalb des Webroots liegen.
  // path.resolve folgt `..` — wir prüfen das Ergebnis explizit.
  const rel = path.relative(webrootAbs, targetAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const e = new Error('path verlässt den Webroot'); e.status = 400; throw e;
  }

  return targetAbs;
}

// ─── GET /api/nginx/sites — Allowlist anzeigen ────────────────────────────────

router.get('/sites', (req, res) => {
  const sites = getSites();
  const out = {};
  for (const [name, cfg] of Object.entries(sites)) {
    let webrootExists = false;
    let writable = false;
    try {
      webrootExists = fs.existsSync(cfg.webroot);
      if (webrootExists) {
        // Probiere Schreibrechte (zerstörungsfrei via fs.accessSync)
        fs.accessSync(cfg.webroot, fs.constants.W_OK);
        writable = true;
      }
    } catch { /* writable bleibt false */ }
    out[name] = {
      webroot: cfg.webroot,
      exists:  webrootExists,
      writable,
    };
  }
  res.json({ sites: out, count: Object.keys(out).length });
});

// ─── POST /api/nginx/write — Datei in einen Webroot schreiben ────────────────

/**
 * Body:
 *   {
 *     "site":     "jam",                  // Schlüssel aus nginx_sites
 *     "path":     "index.html",           // relativer Pfad innerhalb des Webroots
 *     "content":  "<!DOCTYPE html>...",   // Datei-Inhalt
 *     "encoding": "utf8"                  // optional: utf8 (default) | base64
 *   }
 *
 * Antwort 200:
 *   { ok: true, site, path, absolute, bytes, mtime }
 */
router.post('/write', (req, res) => {
  const { site, path: relPath, content, encoding } = req.body || {};

  if (!site || typeof site !== 'string') {
    return res.status(400).json({ error: 'site fehlt im Body' });
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content fehlt oder ist kein String' });
  }

  const sites = getSites();
  const cfg   = sites[site];
  if (!cfg || !cfg.webroot) {
    return res.status(404).json({
      error:           `nginx-Site "${site}" nicht konfiguriert`,
      configured_sites: Object.keys(sites),
      hint:            'Ergänze "nginx_sites" in infactory.json und starte den Server neu.',
    });
  }

  let targetAbs;
  try {
    targetAbs = resolveSafe(cfg.webroot, relPath);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  // Buffer aus encoding aufbauen
  const enc = (encoding || 'utf8').toLowerCase();
  if (enc !== 'utf8' && enc !== 'base64') {
    return res.status(400).json({ error: 'encoding muss "utf8" oder "base64" sein' });
  }
  let buf;
  try {
    buf = enc === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
  } catch (err) {
    return res.status(400).json({ error: `content-Decoding fehlgeschlagen: ${err.message}` });
  }

  // Verzeichnis anlegen + Datei schreiben
  try {
    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, buf);
    const stat = fs.statSync(targetAbs);
    return res.json({
      ok:        true,
      site,
      path:      relPath,
      absolute:  targetAbs,
      bytes:     stat.size,
      mtime:     stat.mtime.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      error:    'Schreiben fehlgeschlagen',
      message:  err.message,
      absolute: targetAbs,
    });
  }
});

module.exports = router;
