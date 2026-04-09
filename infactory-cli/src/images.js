/**
 * images.js — inFactory Image Management
 *
 * Upload, audit, migrate, and list images via Ghost Admin API.
 * No rsync, no SSH, no SysOps — the factory handles its own assets.
 *
 * Ghost Admin API endpoints used:
 *   POST /images/upload/  — upload a single image (multipart/form-data)
 *   GET  /pages/          — read pages to find image URLs
 *   PUT  /pages/:id/      — update pages with new image URLs
 *
 * All operations work over HTTPS — same auth as theme deploy.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const { ghostRequest } = require('./ghost-api');
const { generateJWT }  = require('./deploy');

// ─── Image Upload ──────────────────────────────────────────────────────────────

const MIME_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.avif': 'image/avif',
};

/**
 * Upload a single image file to Ghost via Admin API.
 *
 * @param {string} localPath  - Absolute path to the image file
 * @param {string} ghostUrl   - Ghost instance URL
 * @param {string} adminKey   - Ghost Admin API key (id:secret)
 * @returns {Promise<string>} - The Ghost-hosted image URL
 */
async function uploadImage(localPath, ghostUrl, adminKey) {
  const [keyId, keySecret] = adminKey.split(':');
  const token = generateJWT(keyId, keySecret);

  const fileName    = path.basename(localPath);
  const ext         = path.extname(fileName).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const fileData    = fs.readFileSync(localPath);
  const boundary    = '----inFactoryUpload' + Date.now().toString(36);

  // Build multipart body
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body   = Buffer.concat([header, fileData, footer]);

  const url    = `${ghostUrl.replace(/\/$/, '')}/ghost/api/admin/images/upload/`;
  const parsed = new URL(url);
  const lib    = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Authorization':  `Ghost ${token}`,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length':  body.length,
        'Accept-Version': 'v5.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300 && json.images && json.images[0]) {
            resolve(json.images[0].url);
          } else {
            reject(new Error(`Upload ${res.statusCode}: ${data.substring(0, 300)}`));
          }
        } catch {
          reject(new Error(`Upload ${res.statusCode}: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Page Helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch all Ghost pages with lexical format.
 */
async function getAllPages(ghostUrl, adminKey) {
  const pages = [];
  let page = 1;
  while (true) {
    const result = await ghostRequest('GET', ghostUrl, adminKey,
      `/ghost/api/admin/pages/?formats=lexical&limit=15&page=${page}`);
    if (result.pages) pages.push(...result.pages);
    if (!result.meta?.pagination?.next) break;
    page++;
  }
  return pages;
}

/**
 * Extract all external image URLs from a page (feature_image + lexical content).
 * Returns Set of URLs matching the given hostname pattern.
 */
function extractImageUrls(page, hostnamePattern) {
  const urls = new Set();
  const re = new RegExp(`https?://${hostnamePattern}[^"\\\\]*`, 'g');

  if (page.feature_image) {
    const m = page.feature_image.match(re);
    if (m) m.forEach(u => urls.add(u));
  }
  if (page.lexical) {
    const m = page.lexical.match(re);
    if (m) m.forEach(u => urls.add(u));
  }
  return urls;
}

/**
 * Convert an external URL to a local archive path.
 * Strips protocol + hostname, joins with archiveDir.
 */
function urlToLocalPath(url, archiveDir) {
  const parsed  = new URL(url);
  const relPath = parsed.pathname.replace(/^\//, '');
  return path.join(archiveDir, relPath);
}

// ─── CLI Commands ──────────────────────────────────────────────────────────────

/**
 * infactory images audit
 *
 * Scans all pages for external image URLs and reports:
 * - Which images are external (not on Ghost)
 * - Which have local archive files available
 * - Which are missing from the archive
 */
async function audit({ ghostUrl, adminKey, archiveDir, hostname, verbose }) {
  console.log('\n  🔍 Image Audit\n');

  const pages    = await getAllPages(ghostUrl, adminKey);
  const hostPat  = hostname.replace(/\./g, '\\.');
  const urlMap   = new Map(); // url → Set of slugs

  for (const page of pages) {
    const urls = extractImageUrls(page, hostPat);
    for (const url of urls) {
      if (!urlMap.has(url)) urlMap.set(url, new Set());
      urlMap.get(url).add(page.slug);
    }
  }

  if (urlMap.size === 0) {
    console.log(`  ✔ Keine externen Bilder von ${hostname} gefunden.\n`);
    return { external: 0, available: 0, missing: 0 };
  }

  let available = 0, missing = 0;
  const missingUrls = [];

  console.log(`  ${urlMap.size} externe Bilder von ${hostname}:\n`);

  for (const [url, slugs] of urlMap) {
    const fileName  = path.basename(new URL(url).pathname);
    const localPath = archiveDir ? urlToLocalPath(url, archiveDir) : null;
    const exists    = localPath && fs.existsSync(localPath);
    const size      = exists ? fs.statSync(localPath).size : 0;
    const sizeStr   = exists ? `${(size / 1024).toFixed(0)} KB` : '';

    if (exists) {
      available++;
      console.log(`  ✔ ${fileName.padEnd(45)} ${sizeStr.padStart(8)}  ← ${[...slugs].join(', ')}`);
    } else {
      missing++;
      missingUrls.push(url);
      console.log(`  ✗ ${fileName.padEnd(45)} MISSING   ← ${[...slugs].join(', ')}`);
    }

    if (verbose) console.log(`    ${url}`);
  }

  console.log(`\n  Ergebnis: ${available} verfügbar, ${missing} fehlend, ${urlMap.size} gesamt`);

  if (missing > 0) {
    console.log(`\n  Fehlende Bilder:`);
    for (const u of missingUrls) console.log(`    ${u}`);
  }

  if (available === urlMap.size && archiveDir) {
    console.log(`\n  → Bereit für Migration: infactory images migrate --from=${archiveDir}`);
  }

  console.log();
  return { external: urlMap.size, available, missing };
}

/**
 * infactory images migrate
 *
 * Full migration pipeline:
 * 1. Scan all pages for external images
 * 2. Upload each unique image to Ghost
 * 3. Replace URLs in all affected pages
 */
async function migrate({ ghostUrl, adminKey, archiveDir, hostname, dryRun, slug, verbose }) {
  console.log(`\n  🖼  Image Migration${dryRun ? ' (DRY-RUN)' : ''}\n`);

  const pages   = await getAllPages(ghostUrl, adminKey);
  const target  = slug ? pages.filter(p => p.slug === slug) : pages;
  const hostPat = hostname.replace(/\./g, '\\.');

  // Phase 1: Collect all unique external URLs
  const urlToSlugs = new Map();
  for (const page of target) {
    const urls = extractImageUrls(page, hostPat);
    for (const url of urls) {
      if (!urlToSlugs.has(url)) urlToSlugs.set(url, new Set());
      urlToSlugs.get(url).add(page.slug);
    }
  }

  if (urlToSlugs.size === 0) {
    console.log(`  ✔ Keine externen Bilder von ${hostname} zu migrieren.\n`);
    return;
  }

  console.log(`  ${urlToSlugs.size} Bilder zu migrieren\n`);

  // Phase 2: Upload each image, build replacement map
  const replaceMap = new Map(); // old URL → new Ghost URL
  let uploaded = 0, errors = 0;

  for (const [url] of urlToSlugs) {
    const fileName  = path.basename(new URL(url).pathname);
    const localPath = urlToLocalPath(url, archiveDir);

    if (!fs.existsSync(localPath)) {
      console.log(`  ✗ ${fileName} — Datei nicht gefunden: ${localPath}`);
      errors++;
      continue;
    }

    const size = (fs.statSync(localPath).size / 1024).toFixed(0);
    process.stdout.write(`  ↑ ${fileName} (${size} KB)`);

    if (dryRun) {
      replaceMap.set(url, `[DRY-RUN:${fileName}]`);
      uploaded++;
      console.log(' → [dry-run]');
      continue;
    }

    try {
      const ghostImageUrl = await uploadImage(localPath, ghostUrl, adminKey);
      replaceMap.set(url, ghostImageUrl);
      uploaded++;
      console.log(` → ${ghostImageUrl}`);
    } catch (err) {
      errors++;
      console.log(` ✗ ${err.message.substring(0, 100)}`);
    }
  }

  console.log(`\n  Upload: ${uploaded} OK, ${errors} Fehler\n`);

  if (errors > 0 && !dryRun) {
    console.log('  ⚠  Migration abgebrochen wegen Upload-Fehlern.');
    console.log('  Bereits hochgeladene Bilder bleiben in Ghost.\n');
    return;
  }

  // Phase 3: Replace URLs in pages
  let pagesUpdated = 0;

  for (const page of target) {
    const urls = extractImageUrls(page, hostPat);
    if (urls.size === 0) continue;

    let newLexical     = page.lexical;
    let newFeatureImg  = page.feature_image;
    let changes        = 0;

    for (const [oldUrl, newUrl] of replaceMap) {
      if (newLexical && newLexical.includes(oldUrl)) {
        newLexical = newLexical.split(oldUrl).join(newUrl);
        changes++;
      }
      if (newFeatureImg === oldUrl) {
        newFeatureImg = newUrl;
        changes++;
      }
    }

    if (changes === 0) continue;

    process.stdout.write(`  ↻ ${page.slug} (${changes} URL${changes > 1 ? 's' : ''})`);

    if (dryRun) {
      pagesUpdated++;
      console.log(' → [dry-run]');
      continue;
    }

    try {
      await ghostRequest('PUT', ghostUrl, adminKey,
        `/ghost/api/admin/pages/${page.id}/`, {
          pages: [{
            lexical: newLexical,
            feature_image: newFeatureImg,
            updated_at: page.updated_at,
          }]
        });
      pagesUpdated++;
      console.log(' ✔');
    } catch (err) {
      console.log(` ✗ ${err.message.substring(0, 100)}`);
    }
  }

  console.log(`\n  ✅ Migration: ${uploaded} Bilder, ${pagesUpdated} Pages aktualisiert\n`);
}

/**
 * infactory images list
 *
 * List all images referenced in Ghost pages, grouped by source.
 */
async function list({ ghostUrl, adminKey, verbose }) {
  console.log('\n  📋 Image Inventory\n');

  const pages = await getAllPages(ghostUrl, adminKey);

  const ghostImages   = new Set();
  const externalMap   = new Map(); // hostname → Set of URLs

  for (const page of pages) {
    // Collect all image URLs from lexical
    const allUrls = new Set();
    if (page.feature_image) allUrls.add(page.feature_image);
    if (page.lexical) {
      const matches = page.lexical.match(/https?:\/\/[^"\\]*\.(?:jpg|jpeg|png|gif|svg|webp|avif|ico)/gi);
      if (matches) matches.forEach(u => allUrls.add(u));
    }

    for (const url of allUrls) {
      try {
        const host = new URL(url).hostname;
        const ghostHost = new URL(ghostUrl).hostname;
        if (host === ghostHost) {
          ghostImages.add(url);
        } else {
          if (!externalMap.has(host)) externalMap.set(host, new Set());
          externalMap.get(host).add(url);
        }
      } catch { /* invalid URL, skip */ }
    }
  }

  console.log(`  Ghost-lokal: ${ghostImages.size} Bilder`);
  if (verbose) {
    for (const url of ghostImages) console.log(`    ${path.basename(new URL(url).pathname)}`);
  }

  if (externalMap.size > 0) {
    console.log();
    for (const [host, urls] of externalMap) {
      console.log(`  Extern (${host}): ${urls.size} Bilder`);
      if (verbose) {
        for (const url of urls) console.log(`    ${path.basename(new URL(url).pathname)}`);
      }
    }
  }

  const totalExternal = [...externalMap.values()].reduce((s, set) => s + set.size, 0);
  console.log(`\n  Gesamt: ${ghostImages.size} lokal, ${totalExternal} extern\n`);

  if (totalExternal > 0) {
    console.log('  → Externe Bilder migrieren: infactory images audit --hostname=<host> --from=<archiv>\n');
  }
}

/**
 * infactory images upload
 *
 * Upload one or more image files to Ghost.
 */
async function upload({ ghostUrl, adminKey, files, verbose }) {
  console.log(`\n  ↑ Upload ${files.length} Bild${files.length > 1 ? 'er' : ''}\n`);

  let ok = 0, fail = 0;

  for (const filePath of files) {
    const absPath  = path.resolve(filePath);
    const fileName = path.basename(absPath);

    if (!fs.existsSync(absPath)) {
      console.log(`  ✗ ${fileName} — Datei nicht gefunden`);
      fail++;
      continue;
    }

    const size = (fs.statSync(absPath).size / 1024).toFixed(0);
    process.stdout.write(`  ↑ ${fileName} (${size} KB)`);

    try {
      const ghostUrl2 = await uploadImage(absPath, ghostUrl, adminKey);
      ok++;
      console.log(` → ${ghostUrl2}`);
    } catch (err) {
      fail++;
      console.log(` ✗ ${err.message.substring(0, 100)}`);
    }
  }

  console.log(`\n  ✅ ${ok} hochgeladen, ${fail} fehlgeschlagen\n`);
}

module.exports = { audit, migrate, list, upload, uploadImage };
