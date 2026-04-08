/**
 * routes/ghost.js — Ghost Content CRUD + Image Upload/Migration
 *
 * Alle Endpunkte erfordern ?site=dev|web (default: dev)
 */

'use strict';

const express = require('express');
const config  = require('../config');
const { GhostClient } = require('../ghost-client');

const router = express.Router();

/** Ghost Client für Request auflösen */
function getClient(req, res) {
  const siteName = req.query.site || 'dev';
  const site = config.sites[siteName];
  if (!site) {
    res.status(400).json({
      error: `Site "${siteName}" nicht konfiguriert`,
      available: Object.keys(config.sites),
    });
    return null;
  }
  return new GhostClient(site);
}

// ─── Pages ────────────────────────────────────────────────────────────

router.get('/pages', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;
  try {
    const limit  = parseInt(req.query.limit || '50', 10);
    const filter = req.query.filter || '';
    const pages  = await client.getPages(limit, filter);
    res.json({ count: pages.length, pages });
  } catch (err) {
    res.status(502).json({ error: 'Ghost API Fehler', message: err.message });
  }
});

router.get('/pages/:slug', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;
  try {
    const page = await client.getPageBySlug(req.params.slug);
    if (!page) return res.status(404).json({ error: `Page "${req.params.slug}" nicht gefunden` });
    res.json({ page });
  } catch (err) {
    res.status(502).json({ error: 'Ghost API Fehler', message: err.message });
  }
});

router.post('/pages', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;
  try {
    const result = await client.createOrUpdatePage(req.body);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Ghost API Fehler', message: err.message });
  }
});

// ─── Posts ─────────────────────────────────────────────────────────────

router.get('/posts', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;
  try {
    const limit  = parseInt(req.query.limit || '50', 10);
    const filter = req.query.filter || '';
    const posts  = await client.getPosts(limit, filter);
    res.json({ count: posts.length, posts });
  } catch (err) {
    res.status(502).json({ error: 'Ghost API Fehler', message: err.message });
  }
});

router.post('/posts', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;
  try {
    const result = await client.createOrUpdatePost(req.body);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Ghost API Fehler', message: err.message });
  }
});

// ─── Images ───────────────────────────────────────────────────────────

/**
 * POST /api/ghost/images/upload
 * Body: { url: "https://..." } oder { path: "/local/file.jpg" } oder { base64: "...", filename: "img.jpg" }
 */
router.post('/images/upload', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;

  try {
    let imageBuffer, filename;

    if (req.body.url) {
      // Von URL herunterladen
      const downloaded = await client.downloadImage(req.body.url);
      imageBuffer = downloaded.buffer;
      filename    = downloaded.filename;
    } else if (req.body.path) {
      // Lokale Datei
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(req.body.path)) {
        return res.status(400).json({ error: `Datei nicht gefunden: ${req.body.path}` });
      }
      imageBuffer = fs.readFileSync(req.body.path);
      filename    = path.basename(req.body.path);
    } else if (req.body.base64 && req.body.filename) {
      imageBuffer = Buffer.from(req.body.base64, 'base64');
      filename    = req.body.filename;
    } else {
      return res.status(400).json({
        error: 'Body muss "url", "path" oder "base64"+"filename" enthalten'
      });
    }

    // Upload — Filesystem wenn möglich, sonst Ghost API
    let ghostUrl;
    if (client.contentPath) {
      const relativePath = client.copyImageToContent(imageBuffer, filename);
      ghostUrl = relativePath;
    } else {
      ghostUrl = await client.uploadImage(imageBuffer, filename);
    }

    res.json({ uploaded: true, url: ghostUrl, filename, size: imageBuffer.length });
  } catch (err) {
    res.status(500).json({ error: 'Image Upload fehlgeschlagen', message: err.message });
  }
});

/**
 * POST /api/ghost/images/migrate
 * Body: { slug: "hotel", source: "arv"|"archive", dry_run: false }
 */
router.post('/images/migrate', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;

  const { slug, source, dry_run } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug ist Pflicht' });

  try {
    const report = await client.migratePageImages(slug, {
      source:      source || 'arv',
      archivePath: config.imageArchivePath,
      dryRun:      dry_run || false,
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Migration fehlgeschlagen', message: err.message });
  }
});

module.exports = router;
