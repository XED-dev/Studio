/**
 * ghost-client.js — Ghost Admin API Client
 *
 * Läuft auf dem Ghost-Host (localhost).
 * Unterstützt: JWT Auth, Pages/Posts CRUD, Image Upload, Image Migration.
 *
 * Keine externen Dependencies — nur Node.js Built-ins.
 */

'use strict';

const crypto = require('crypto');
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ─── JWT ──────────────────────────────────────────────────────────────────────

/**
 * Ghost Admin API JWT generieren (HS256).
 * @param {string} adminKey - Format: "id:secret"
 * @returns {string} JWT Token (gültig 5 Minuten)
 */
function generateJWT(adminKey) {
  const [keyId, keySecret] = adminKey.split(':');
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId }));
  const payload = b64url(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' }));
  const input   = `${header}.${payload}`;

  const signature = crypto
    .createHmac('sha256', Buffer.from(keySecret, 'hex'))
    .update(input)
    .digest('base64url');

  return `${input}.${signature}`;
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

// ─── HTTP Request ─────────────────────────────────────────────────────────────

/**
 * HTTP/HTTPS Request — keine externen Dependencies.
 */
function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(urlStr);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers,
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({
          ok:     res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data,
          raw,
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

// ─── Ghost API Client ─────────────────────────────────────────────────────────

/**
 * Ghost Admin API Client für eine Ghost-Instanz.
 */
class GhostClient {
  /**
   * @param {object} site - { url, key, contentPath }
   */
  constructor(site) {
    this.url         = site.url;
    this.key         = site.key;
    this.contentPath = site.contentPath || '';
  }

  /** Authentifizierten API-Request ausführen */
  async api(method, endpoint, body = null) {
    const token   = generateJWT(this.key);
    const headers = {
      'Authorization':  `Ghost ${token}`,
      'Content-Type':   'application/json',
      'Accept':         'application/json',
      'Accept-Version': 'v5.0',
    };

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const result = await request(method, `${this.url}${endpoint}`, headers, bodyStr);

    if (!result.ok) {
      const msg = typeof result.data === 'object'
        ? JSON.stringify(result.data.errors || result.data, null, 2)
        : result.raw;
      throw new Error(`Ghost API ${method} ${endpoint} → HTTP ${result.status}: ${msg}`);
    }

    return result.data;
  }

  // ─── Health ───────────────────────────────────────────────────────────

  async ping() {
    try {
      await this.api('GET', '/ghost/api/admin/site/');
      return true;
    } catch {
      return false;
    }
  }

  async site() {
    const result = await this.api('GET', '/ghost/api/admin/site/');
    return result.site || result;
  }

  // ─── Pages ────────────────────────────────────────────────────────────

  async getPages(limit = 50, filter = '') {
    const params = `?limit=${limit}&formats=lexical,html${filter ? '&filter=' + encodeURIComponent(filter) : ''}`;
    const result = await this.api('GET', `/ghost/api/admin/pages/${params}`);
    return result.pages || [];
  }

  async getPageBySlug(slug) {
    const result = await this.api('GET', `/ghost/api/admin/pages/slug/${slug}/?formats=lexical,html`);
    return result.pages?.[0] || null;
  }

  async createOrUpdatePage(pageData) {
    const { title, slug, html, feature_image, custom_excerpt, status, tags } = pageData;

    // Prüfe ob Page existiert
    try {
      const existing = await this.getPageBySlug(slug);
      if (existing) {
        const updateBody = {
          pages: [{
            title,
            ...htmlToLexical(html),
            feature_image: feature_image || existing.feature_image,
            custom_excerpt: custom_excerpt || existing.custom_excerpt,
            status: status || existing.status,
            tags: tags || existing.tags,
            updated_at: existing.updated_at,
          }]
        };
        const result = await this.api('PUT', `/ghost/api/admin/pages/${existing.id}/`, updateBody);
        return { action: 'updated', page: result.pages[0] };
      }
    } catch { /* Page existiert nicht */ }

    // Neu erstellen
    const createBody = {
      pages: [{
        title, slug,
        ...htmlToLexical(html),
        feature_image: feature_image || null,
        custom_excerpt: custom_excerpt || null,
        status: status || 'draft',
        tags: tags || [],
      }]
    };
    const result = await this.api('POST', '/ghost/api/admin/pages/', createBody);
    return { action: 'created', page: result.pages[0] };
  }

  // ─── Posts ────────────────────────────────────────────────────────────

  async getPosts(limit = 50, filter = '') {
    const params = `?limit=${limit}&formats=lexical,html${filter ? '&filter=' + encodeURIComponent(filter) : ''}`;
    const result = await this.api('GET', `/ghost/api/admin/posts/${params}`);
    return result.posts || [];
  }

  async createOrUpdatePost(postData) {
    const { title, slug, html, feature_image, custom_excerpt, status, featured, tags } = postData;

    try {
      const existing = await this.api('GET', `/ghost/api/admin/posts/slug/${slug}/?formats=lexical,html`);
      const post = existing.posts?.[0];
      if (post) {
        const updateBody = {
          posts: [{
            title, ...htmlToLexical(html),
            feature_image: feature_image || post.feature_image,
            custom_excerpt: custom_excerpt || post.custom_excerpt,
            status: status || post.status,
            featured: featured !== undefined ? featured : post.featured,
            tags: tags || post.tags,
            updated_at: post.updated_at,
          }]
        };
        const result = await this.api('PUT', `/ghost/api/admin/posts/${post.id}/`, updateBody);
        return { action: 'updated', post: result.posts[0] };
      }
    } catch { /* Post existiert nicht */ }

    const createBody = {
      posts: [{
        title, slug, ...htmlToLexical(html),
        feature_image: feature_image || null,
        custom_excerpt: custom_excerpt || null,
        status: status || 'draft',
        featured: featured || false,
        tags: tags || [],
      }]
    };
    const result = await this.api('POST', '/ghost/api/admin/posts/', createBody);
    return { action: 'created', post: result.posts[0] };
  }

  // ─── Images ───────────────────────────────────────────────────────────

  /**
   * Bild via Ghost Admin API hochladen (Multipart).
   * @param {Buffer} imageBuffer - Bild-Daten
   * @param {string} filename - Dateiname (z.B. "hotel.jpg")
   * @returns {string} Ghost-URL des hochgeladenen Bildes
   */
  async uploadImage(imageBuffer, filename) {
    const token    = generateJWT(this.key);
    const boundary = `----InFactoryBoundary${Date.now().toString(36)}`;

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const prefix = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([prefix, imageBuffer, suffix]);

    const headers = {
      'Authorization':  `Ghost ${token}`,
      'Content-Type':   `multipart/form-data; boundary=${boundary}`,
      'Content-Length':  body.length,
      'Accept':          'application/json',
      'Accept-Version':  'v5.0',
    };

    const result = await request('POST', `${this.url}/ghost/api/admin/images/upload/`, headers, body);

    if (!result.ok) {
      throw new Error(`Image Upload fehlgeschlagen (HTTP ${result.status}): ${result.raw}`);
    }

    return result.data.images?.[0]?.url || null;
  }

  /**
   * Bild direkt ins Ghost content/images/ Verzeichnis kopieren (Filesystem).
   * Schneller als API-Upload, nur möglich wenn contentPath konfiguriert.
   * @param {Buffer} imageBuffer
   * @param {string} filename
   * @returns {string} Relativer URL-Pfad (/content/images/YYYY/MM/filename)
   */
  copyImageToContent(imageBuffer, filename) {
    if (!this.contentPath) {
      throw new Error('contentPath nicht konfiguriert — Filesystem-Copy nicht möglich');
    }

    const now   = new Date();
    const year  = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const dir   = path.join(this.contentPath, 'images', year, month);

    // Verzeichnis erstellen
    fs.mkdirSync(dir, { recursive: true });

    // Dateiname deduplizieren
    let targetName = filename;
    let targetPath = path.join(dir, targetName);
    let counter = 1;
    while (fs.existsSync(targetPath)) {
      const ext  = path.extname(filename);
      const base = path.basename(filename, ext);
      targetName = `${base}-${counter}${ext}`;
      targetPath = path.join(dir, targetName);
      counter++;
    }

    fs.writeFileSync(targetPath, imageBuffer);
    return `/content/images/${year}/${month}/${targetName}`;
  }

  /**
   * Bild von URL herunterladen.
   * @param {string} imageUrl
   * @returns {Promise<{buffer: Buffer, filename: string}>}
   */
  async downloadImage(imageUrl) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(imageUrl);
      const lib    = parsed.protocol === 'https:' ? https : http;

      lib.get(imageUrl, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadImage(res.headers.location).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Download fehlgeschlagen: HTTP ${res.statusCode} für ${imageUrl}`));
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer   = Buffer.concat(chunks);
          const filename = path.basename(parsed.pathname) || 'image.jpg';
          resolve({ buffer, filename });
        });
      }).on('error', reject);
    });
  }

  /**
   * Alle externen Bilder einer Ghost Page nach Ghost migrieren.
   *
   * Findet alle <img src="..."> und feature_image URLs die auf externe
   * Domains zeigen, lädt sie herunter/kopiert sie, und aktualisiert die Page.
   *
   * @param {string} slug - Page Slug
   * @param {object} opts
   * @param {string} opts.source - "arv" (Download) oder "archive" (lokales Archiv)
   * @param {string} opts.archivePath - Pfad zum lokalen Archiv
   * @param {boolean} opts.dryRun - Nur analysieren, nicht migrieren
   * @returns {object} Migration Report
   */
  async migratePageImages(slug, opts = {}) {
    const { source = 'arv', archivePath = '', dryRun = false } = opts;
    const page = await this.getPageBySlug(slug);
    if (!page) throw new Error(`Page "${slug}" nicht gefunden`);

    const report = { slug, migrated: 0, skipped: 0, errors: [], images: [] };

    // Externe Bilder finden (im HTML und feature_image)
    const html = page.html || '';
    const imgRegex = /(?:src|srcset)=["']([^"']+?\.(?:jpg|jpeg|png|gif|webp|svg))[^"']*["']/gi;
    const externalUrls = new Set();

    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.startsWith('/content/images/') || url.startsWith('/assets/')) continue;
      if (url.startsWith('http')) externalUrls.add(url);
    }

    if (page.feature_image && !page.feature_image.includes('/content/images/')) {
      externalUrls.add(page.feature_image);
    }

    if (externalUrls.size === 0) {
      report.skipped = 0;
      return report;
    }

    if (dryRun) {
      report.images = [...externalUrls].map(url => ({ original: url, ghost: '(dry run)' }));
      return report;
    }

    // URL-Mapping: original → ghost
    const urlMap = {};

    for (const originalUrl of externalUrls) {
      try {
        let imageBuffer, filename;

        if (source === 'archive' && archivePath) {
          // Lokales Archiv: URL-Pfad → Dateipfad
          const urlPath = new URL(originalUrl).pathname;
          const localPath = path.join(archivePath, urlPath);
          if (!fs.existsSync(localPath)) {
            report.errors.push({ url: originalUrl, error: `Nicht im Archiv: ${localPath}` });
            continue;
          }
          imageBuffer = fs.readFileSync(localPath);
          filename = path.basename(localPath);
        } else {
          // Von URL herunterladen
          const downloaded = await this.downloadImage(originalUrl);
          imageBuffer = downloaded.buffer;
          filename    = downloaded.filename;
        }

        // Upload — Filesystem wenn möglich, sonst API
        let ghostUrl;
        if (this.contentPath) {
          const relativePath = this.copyImageToContent(imageBuffer, filename);
          ghostUrl = relativePath;
        } else {
          ghostUrl = await this.uploadImage(imageBuffer, filename);
        }

        urlMap[originalUrl] = ghostUrl;
        report.images.push({ original: originalUrl, ghost: ghostUrl });
        report.migrated++;
      } catch (err) {
        report.errors.push({ url: originalUrl, error: err.message });
      }
    }

    // Page aktualisieren — URLs im Lexical Content ersetzen
    if (report.migrated > 0) {
      let lexicalStr = page.lexical || '';
      let newFeatureImage = page.feature_image;

      for (const [original, ghost] of Object.entries(urlMap)) {
        lexicalStr = lexicalStr.split(original).join(ghost);
        if (newFeatureImage === original) {
          newFeatureImage = ghost;
        }
      }

      // Page mit neuen URLs aktualisieren
      const updateBody = {
        pages: [{
          lexical: lexicalStr,
          feature_image: newFeatureImage,
          updated_at: page.updated_at,
        }]
      };
      await this.api('PUT', `/ghost/api/admin/pages/${page.id}/`, updateBody);
    }

    return report;
  }

  // ─── Theme ────────────────────────────────────────────────────────────

  /**
   * Theme ZIP hochladen + aktivieren.
   * @param {string} zipPath - Pfad zur ZIP-Datei
   * @param {boolean} activate - Theme nach Upload aktivieren
   */
  async uploadTheme(zipPath, activate = true) {
    const token    = generateJWT(this.key);
    const boundary = `----InFactoryBoundary${Date.now().toString(36)}`;
    const filename = path.basename(zipPath);
    const fileData = fs.readFileSync(zipPath);

    const prefix = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/zip\r\n\r\n`
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([prefix, fileData, suffix]);

    const headers = {
      'Authorization':  `Ghost ${token}`,
      'Content-Type':   `multipart/form-data; boundary=${boundary}`,
      'Content-Length':  body.length,
      'Accept':          'application/json',
      'Accept-Version':  'v5.0',
    };

    const uploadResult = await request('POST', `${this.url}/ghost/api/admin/themes/upload/`, headers, body);
    if (!uploadResult.ok) {
      throw new Error(`Theme Upload fehlgeschlagen (HTTP ${uploadResult.status}): ${uploadResult.raw}`);
    }

    const themeName = uploadResult.data?.themes?.[0]?.name;

    if (activate && themeName) {
      const activateHeaders = {
        'Authorization':  `Ghost ${token}`,
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'Accept-Version': 'v5.0',
      };
      await request('PUT', `${this.url}/ghost/api/admin/themes/${encodeURIComponent(themeName)}/activate/`, activateHeaders, null);
    }

    return { themeName, uploaded: true, activated: activate };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * HTML → Ghost Lexical Format (HTML Card).
 */
function htmlToLexical(html) {
  if (!html) return {};
  const lexical = JSON.stringify({
    root: {
      children: [{
        type: 'html',
        version: 1,
        html: html.trim(),
      }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    }
  });
  return { lexical };
}

module.exports = { GhostClient, generateJWT, htmlToLexical };
