/**
 * routes/ghost.js — Ghost Content CRUD + Image Upload/Migration
 *
 * Alle Endpunkte erfordern ?site=dev|web (default: dev)
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
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

// ─── Lexical Upgrade ─────────────────────────────────────────────────────

/**
 * POST /api/ghost/pages/upgrade-lexical
 * Body: { slug: "page-slug" | "all", site: "dev", dry_run: false }
 *
 * Konvertiert HTML-Content zu echtem Lexical (statt Monoblock-HTML-Card).
 * Nutzt den html-to-lexical.js Converter aus der CLI.
 */
router.post('/pages/upgrade-lexical', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;

  const { slug, dry_run = false } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug ist Pflicht ("page-slug" oder "all")' });

  // html-to-lexical.js laden
  const converterPath = path.join(config.cliPath, 'src', 'html-to-lexical.js');
  if (!fs.existsSync(converterPath)) {
    return res.status(503).json({
      error: 'html-to-lexical.js nicht gefunden',
      detail: converterPath,
    });
  }
  const { htmlToLexical } = require(converterPath);

  try {
    const results = [];

    if (slug === 'all') {
      const pages = await client.getPages(100);
      for (const page of pages) {
        const entry = await upgradePage(client, page, htmlToLexical, dry_run);
        if (entry) results.push(entry);
      }
    } else {
      const page = await client.getPageBySlug(slug);
      if (!page) return res.status(404).json({ error: `Page "${slug}" nicht gefunden` });
      const entry = await upgradePage(client, page, htmlToLexical, dry_run);
      if (entry) results.push(entry);
    }

    res.json({
      upgraded: results.filter(r => r.action === 'upgraded').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      dry_run,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: 'Lexical Upgrade fehlgeschlagen', message: err.message });
  }
});

async function upgradePage(client, page, htmlToLexical, dryRun) {
  const html = page.html || '';
  if (!html.trim()) return { slug: page.slug, action: 'skipped', reason: 'kein HTML' };

  // Prüfe ob bereits echtes Lexical (nicht nur HTML-Card)
  let lexicalObj;
  try { lexicalObj = JSON.parse(page.lexical || '{}'); } catch { lexicalObj = {}; }
  const children = lexicalObj.root?.children || [];
  const hasOnlyHtmlCards = children.length > 0 && children.every(c => c.type === 'html');

  if (!hasOnlyHtmlCards && children.length > 0) {
    // Bereits echtes Lexical — hat Paragraphs, Headings, etc.
    const types = [...new Set(children.map(c => c.type))];
    if (types.length > 1 || !types.includes('html')) {
      return { slug: page.slug, action: 'skipped', reason: 'bereits echtes Lexical', types };
    }
  }

  // Konvertieren
  const converted = htmlToLexical(html);
  if (!converted.lexical) {
    return { slug: page.slug, action: 'skipped', reason: 'Konvertierung leer' };
  }

  // Statistik
  let newObj;
  try { newObj = JSON.parse(converted.lexical); } catch { return { slug: page.slug, action: 'skipped', reason: 'Parse-Fehler' }; }
  const newChildren = newObj.root?.children || [];
  const nodeTypes = {};
  for (const c of newChildren) {
    nodeTypes[c.type] = (nodeTypes[c.type] || 0) + 1;
  }

  if (dryRun) {
    return { slug: page.slug, action: 'would-upgrade', nodes: newChildren.length, types: nodeTypes };
  }

  // Ghost Page aktualisieren
  const updateBody = {
    pages: [{
      lexical: converted.lexical,
      updated_at: page.updated_at,
    }]
  };
  await client.api('PUT', `/ghost/api/admin/pages/${page.id}/`, updateBody);

  return { slug: page.slug, action: 'upgraded', nodes: newChildren.length, types: nodeTypes };
}

// ─── Images Audit ────────────────────────────────────────────────────────

/**
 * GET /api/ghost/images/audit?site=dev&hostname=arv.steirischursprung.at
 *
 * Scannt alle Pages nach externen Bild-URLs und listet sie auf.
 */
router.get('/images/audit', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;

  const hostname = req.query.hostname || '';

  try {
    const pages = await client.getPages(100);
    const audit = [];

    for (const page of pages) {
      const html = page.html || '';
      const lexical = page.lexical || '';
      const content = html + lexical;

      const imgRegex = /(?:src|srcset)=["']([^"']+?\.(?:jpg|jpeg|png|gif|webp|svg))[^"']*["']/gi;
      const external = [];
      let match;

      while ((match = imgRegex.exec(content)) !== null) {
        const url = match[1];
        if (url.startsWith('/content/images/') || url.startsWith('/assets/')) continue;
        if (url.startsWith('http')) {
          if (!hostname || url.includes(hostname)) {
            external.push(url);
          }
        }
      }

      // feature_image prüfen
      if (page.feature_image && !page.feature_image.includes('/content/images/')) {
        if (!hostname || page.feature_image.includes(hostname)) {
          external.push(page.feature_image);
        }
      }

      if (external.length > 0) {
        audit.push({
          slug: page.slug,
          title: page.title,
          externalImages: external.length,
          urls: external,
        });
      }
    }

    const totalExternal = audit.reduce((s, a) => s + a.externalImages, 0);
    res.json({
      totalPages: pages.length,
      pagesWithExternal: audit.length,
      totalExternalImages: totalExternal,
      hostname: hostname || '(alle)',
      audit,
    });
  } catch (err) {
    res.status(502).json({ error: 'Audit fehlgeschlagen', message: err.message });
  }
});

/**
 * GET /api/ghost/images/list?site=dev
 *
 * Inventar aller Bilder, gruppiert nach Herkunft.
 */
router.get('/images/list', async (req, res) => {
  const client = getClient(req, res);
  if (!client) return;

  try {
    const pages = await client.getPages(100);
    const inventory = { local: [], external: {} };

    for (const page of pages) {
      const html = page.html || '';
      const lexical = page.lexical || '';
      const content = html + lexical;

      const imgRegex = /(?:src|srcset)=["']([^"']+?\.(?:jpg|jpeg|png|gif|webp|svg))[^"']*["']/gi;
      let match;

      while ((match = imgRegex.exec(content)) !== null) {
        const url = match[1];
        if (url.startsWith('/content/images/') || url.startsWith('/assets/')) {
          inventory.local.push({ url, page: page.slug });
        } else if (url.startsWith('http')) {
          try {
            const host = new URL(url).hostname;
            if (!inventory.external[host]) inventory.external[host] = [];
            inventory.external[host].push({ url, page: page.slug });
          } catch {}
        }
      }

      // feature_image
      if (page.feature_image) {
        if (page.feature_image.startsWith('/content/images/')) {
          inventory.local.push({ url: page.feature_image, page: page.slug, type: 'feature_image' });
        } else if (page.feature_image.startsWith('http')) {
          try {
            const host = new URL(page.feature_image).hostname;
            if (!inventory.external[host]) inventory.external[host] = [];
            inventory.external[host].push({ url: page.feature_image, page: page.slug, type: 'feature_image' });
          } catch {}
        }
      }
    }

    const externalCount = Object.values(inventory.external).reduce((s, arr) => s + arr.length, 0);
    res.json({
      totalPages: pages.length,
      localImages: inventory.local.length,
      externalImages: externalCount,
      externalHosts: Object.keys(inventory.external),
      inventory,
    });
  } catch (err) {
    res.status(502).json({ error: 'Image-Liste fehlgeschlagen', message: err.message });
  }
});

module.exports = router;
