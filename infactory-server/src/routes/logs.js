/**
 * routes/logs.js — Remote Log Access
 *
 * GET /api/logs?service=<name>&lines=<n>
 *
 * Erlaubt AI-Agents, Server-Logs ohne SSH zu lesen.
 * Authentifiziert via X-API-Key (wie alle anderen Endpunkte).
 *
 * Erlaubte Services (Allowlist):
 *   - infactory-*           (infactory-server systemd units)
 *   - studio-payload-*      (studio-payload systemd units)
 *   - nginx                 (NGINX)
 *
 * Erlaubte Log-Dateien:
 *   - /var/log/infactory-health.log
 *   - /var/log/nginx/error.log
 *   - /var/log/nginx/access.log
 *
 * Beispiele:
 *   GET /api/logs?service=studio-payload-steirischursprung-at&lines=30
 *   GET /api/logs?file=infactory-health&lines=50
 *   GET /api/logs?service=nginx&lines=20
 */

'use strict';

const express = require('express');
const { execFile } = require('child_process');

const router = express.Router();

// Erlaubte systemd Service-Patterns (Prefix-Match)
const ALLOWED_SERVICE_PREFIXES = [
  'infactory-',
  'studio-payload-',
  'nginx',
];

// Erlaubte Log-Dateien (Kurzname → Pfad)
const ALLOWED_FILES = {
  'infactory-health': '/var/log/infactory-health.log',
  'nginx-error':      '/var/log/nginx/error.log',
  'nginx-access':     '/var/log/nginx/access.log',
};

const MAX_LINES = 200;
const DEFAULT_LINES = 30;

function isAllowedService(name) {
  if (!name || typeof name !== 'string') return false;
  // Nur alphanumerisch, Bindestrich und Punkt erlaubt (kein Path-Traversal)
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return false;
  return ALLOWED_SERVICE_PREFIXES.some(prefix => name === prefix.replace(/-$/, '') || name.startsWith(prefix));
}

router.get('/', (req, res) => {
  const service = req.query.service;
  const file = req.query.file;
  const lines = Math.min(Math.max(parseInt(req.query.lines) || DEFAULT_LINES, 1), MAX_LINES);

  if (!service && !file) {
    return res.status(400).json({
      error: 'Parameter fehlt',
      message: 'Entweder ?service=<name> oder ?file=<name> angeben',
      allowed_services: ALLOWED_SERVICE_PREFIXES,
      allowed_files: Object.keys(ALLOWED_FILES),
    });
  }

  if (service) {
    if (!isAllowedService(service)) {
      return res.status(403).json({
        error: 'Service nicht erlaubt',
        message: `Service "${service}" ist nicht in der Allowlist`,
        allowed_prefixes: ALLOWED_SERVICE_PREFIXES,
      });
    }

    execFile('journalctl', ['-u', service, '-n', String(lines), '--no-pager', '-o', 'short-iso'], {
      timeout: 10000,
    }, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({
          error: 'journalctl fehlgeschlagen',
          message: err.message,
          stderr: stderr || '',
        });
      }
      res.json({
        source: 'journalctl',
        service,
        lines,
        output: stdout,
      });
    });
    return;
  }

  if (file) {
    const filePath = ALLOWED_FILES[file];
    if (!filePath) {
      return res.status(403).json({
        error: 'Datei nicht erlaubt',
        message: `Datei "${file}" ist nicht in der Allowlist`,
        allowed_files: Object.keys(ALLOWED_FILES),
      });
    }

    execFile('tail', ['-n', String(lines), filePath], {
      timeout: 10000,
    }, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({
          error: 'tail fehlgeschlagen',
          message: err.message,
          path: filePath,
        });
      }
      res.json({
        source: 'file',
        file,
        path: filePath,
        lines,
        output: stdout,
      });
    });
  }
});

module.exports = router;
