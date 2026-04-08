/**
 * routes/theme.js — Theme Build, Deploy, Presets, Sections
 *
 * Build + Deploy nutzen die infactory-cli auf demselben Host.
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { execSync } = require('child_process');
const yaml    = require('js-yaml');
const config  = require('../config');
const { GhostClient } = require('../ghost-client');

const router = express.Router();

/**
 * POST /api/theme/build
 * Body: { preset: "steirischursprung" }
 */
router.post('/build', (req, res) => {
  const { preset } = req.body;
  if (!preset) return res.status(400).json({ error: 'preset ist Pflicht' });

  try {
    const cmd = `node bin/infactory.js build --preset=${preset} --zip`;
    const output = execSync(cmd, {
      cwd:      config.cliPath,
      encoding: 'utf8',
      timeout:  30000,
    });

    const zipPath = path.join(config.cliPath, 'dist', `infactory-${preset}.zip`);
    const zipExists = fs.existsSync(zipPath);

    res.json({
      ok: true,
      preset,
      zip: zipExists ? zipPath : null,
      zipSize: zipExists ? `${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB` : null,
      output: output.trim(),
    });
  } catch (err) {
    res.status(500).json({
      error: 'Build fehlgeschlagen',
      message: err.stderr || err.message,
      output: err.stdout || '',
    });
  }
});

/**
 * POST /api/theme/deploy
 * Body: { preset: "steirischursprung", site: "dev", activate: true, skip_build: false }
 */
router.post('/deploy', async (req, res) => {
  const { preset, site: siteName = 'dev', activate = true, skip_build = false } = req.body;
  if (!preset) return res.status(400).json({ error: 'preset ist Pflicht' });

  const site = config.sites[siteName];
  if (!site) {
    return res.status(400).json({
      error: `Site "${siteName}" nicht konfiguriert`,
      available: Object.keys(config.sites),
    });
  }

  try {
    // 1. Build (optional)
    let buildOutput = '';
    if (!skip_build) {
      const cmd = `node bin/infactory.js build --preset=${preset} --zip`;
      buildOutput = execSync(cmd, {
        cwd:      config.cliPath,
        encoding: 'utf8',
        timeout:  30000,
      });
    }

    // 2. ZIP finden
    const zipPath = path.join(config.cliPath, 'dist', `infactory-${preset}.zip`);
    if (!fs.existsSync(zipPath)) {
      return res.status(500).json({
        error: `ZIP nicht gefunden: ${zipPath}`,
        hint: 'Build hat kein ZIP erstellt. Prüfe preset und build-output.',
        buildOutput,
      });
    }

    // 3. Upload + Activate via Ghost API
    const client = new GhostClient(site);
    const result = await client.uploadTheme(zipPath, activate);

    res.json({
      ok: true,
      preset,
      site: siteName,
      ...result,
      zipSize: `${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Deploy fehlgeschlagen',
      message: err.message,
    });
  }
});

// ─── Presets ──────────────────────────────────────────────────────────

router.get('/presets', (req, res) => {
  const presetsDir = path.join(config.cliPath, 'presets');
  try {
    const files = fs.readdirSync(presetsDir).filter(f => f.endsWith('.yaml'));
    const presets = files.map(f => {
      const content = fs.readFileSync(path.join(presetsDir, f), 'utf8');
      const parsed  = yaml.load(content);
      return {
        id:       parsed.id || path.basename(f, '.yaml'),
        name:     parsed.name || parsed.id,
        file:     f,
        sections: parsed.layout?.home?.length || 0,
        tokens:   Object.keys(parsed.tokens?.color || {}).length + Object.keys(parsed.tokens?.font || {}).length,
      };
    });
    res.json({ count: presets.length, presets });
  } catch (err) {
    res.status(500).json({ error: 'Presets lesen fehlgeschlagen', message: err.message });
  }
});

router.get('/presets/:id', (req, res) => {
  const filePath = path.join(config.cliPath, 'presets', `${req.params.id}.yaml`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Preset "${req.params.id}" nicht gefunden` });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed  = yaml.load(content);
  res.json({ preset: parsed, raw: content });
});

router.put('/presets/:id', (req, res) => {
  const filePath = path.join(config.cliPath, 'presets', `${req.params.id}.yaml`);
  try {
    let content;
    if (typeof req.body === 'string') {
      content = req.body;
    } else if (req.body.raw) {
      content = req.body.raw;
    } else {
      content = yaml.dump(req.body.preset || req.body, { lineWidth: 120 });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ ok: true, file: `${req.params.id}.yaml` });
  } catch (err) {
    res.status(500).json({ error: 'Preset speichern fehlgeschlagen', message: err.message });
  }
});

// ─── Sections ─────────────────────────────────────────────────────────

router.get('/sections', (req, res) => {
  const registryPath = path.join(config.cliPath, 'sections', 'registry.json');
  try {
    const content  = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(content);
    res.json(registry);
  } catch (err) {
    res.status(500).json({ error: 'Registry lesen fehlgeschlagen', message: err.message });
  }
});

module.exports = router;
