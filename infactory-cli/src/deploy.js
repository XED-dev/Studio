/**
 * deploy.js — inFactory CLI Ghost Deploy v0.7
 *
 * Vollständige Deploy-Pipeline:
 *   1. Build  (Preset → dist/)
 *   2. ZIP    (dist/ → infactory-<preset>.zip)
 *   3. Upload (Ghost Admin API — POST /themes/upload/)
 *   4. Activate (PUT /themes/:name/activate)
 *
 * Authentifizierung: Ghost Admin API Key (id:secret)
 * JWT: HS256, kid = key-id, aud = "/admin/"
 *
 * Usage:
 *   infactory deploy --preset=agency --url=https://mein.blog --key=<id>:<secret>
 *   infactory deploy --preset=agency --url=https://mein.blog --key=<id>:<secret> --activate
 *   infactory deploy --preset=agency --url=https://mein.blog --key=<id>:<secret> --no-activate
 *   infactory deploy --preset=agency --url=https://mein.blog --key=<id>:<secret> --dry-run
 *
 * Config via .infactory.json (deploy.url, deploy.key) oder env:
 *   INFACTORY_GHOST_URL=https://mein.blog
 *   INFACTORY_GHOST_KEY=<id>:<secret>
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const crypto  = require('crypto');
const { execSync } = require('child_process');

/**
 * Vollständige Deploy-Pipeline.
 *
 * @param {object} opts
 * @param {string}  opts.preset        - Preset-ID
 * @param {string}  opts.ghostUrl      - Ghost-URL (https://mein.blog)
 * @param {string}  opts.adminKey      - Admin API Key (id:secret)
 * @param {string}  opts.presetsDir
 * @param {string}  opts.baseThemeDir
 * @param {string}  opts.outputDir
 * @param {string}  opts.registryPath
 * @param {boolean} opts.activate      - Theme nach Upload aktivieren (default: true)
 * @param {boolean} opts.dryRun        - Nur bauen + validieren, nicht hochladen
 * @param {boolean} opts.skipBuild     - Kein Rebuild, existierendes ZIP verwenden
 * @param {boolean} opts.verbose
 */
async function deploy(opts) {
  const {
    preset,
    ghostUrl,
    adminKey,
    presetsDir,
    baseThemeDir,
    outputDir,
    registryPath,
    activate  = true,
    dryRun    = false,
    skipBuild = false,
    verbose   = false,
  } = opts;

  const log  = verbose ? (m) => console.log(m) : () => {};
  const info = (m) => console.log(m);

  // ── Validierung ─────────────────────────────────────────────────────────────
  if (!preset)   throw new Error('--preset fehlt. Beispiel: infactory deploy --preset=agency --url=https://mein.blog --key=id:secret');
  if (!ghostUrl) throw new Error('--url fehlt. Beispiel: --url=https://mein.blog (auch via INFACTORY_GHOST_URL)');
  if (!adminKey) throw new Error('--key fehlt. Ghost Admin API Key: id:secret (auch via INFACTORY_GHOST_KEY)');

  const keyParts = adminKey.split(':');
  if (keyParts.length !== 2 || !keyParts[0] || !keyParts[1]) {
    throw new Error(`Ungültiges Key-Format: "${adminKey}"\n  Erwartet: <id>:<secret>  (aus Ghost Admin → Integrations)`);
  }

  const [keyId, keySecret] = keyParts;
  const baseUrl = ghostUrl.replace(/\/$/, '');

  info(`\n  🚀 inFactory Deploy\n`);
  info(`     Preset:  ${preset}`);
  info(`     Ghost:   ${baseUrl}`);
  info(`     Key-ID:  ${keyId}`);
  if (dryRun) info(`     Modus:   DRY RUN (kein Upload)`);
  info('');

  // ── 1. Build ────────────────────────────────────────────────────────────────
  let zipPath;

  if (!skipBuild) {
    info(`  [1/4] Build — Preset "${preset}" → dist/`);
    const { build } = require('./build');
    await build({
      preset,
      presetsDir,
      baseThemeDir,
      outputDir,
      registryPath,
      zip:     true,
      verbose: verbose,
    });
    info(`        ✔ Build abgeschlossen`);
  } else {
    info(`  [1/4] Build übersprungen (--skip-build)`);
  }

  // ── 2. ZIP lokalisieren ──────────────────────────────────────────────────────
  info(`  [2/4] ZIP lokalisieren`);

  const possibleNames = [
    path.join(outputDir, `infactory-${preset}.zip`),
    path.join(outputDir, `${preset}.zip`),
  ];

  zipPath = possibleNames.find(p => fs.existsSync(p));

  if (!zipPath) {
    // Fallback: neuestes ZIP in outputDir
    if (fs.existsSync(outputDir)) {
      const zips = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.zip'))
        .map(f => ({ f, t: fs.statSync(path.join(outputDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (zips.length) zipPath = path.join(outputDir, zips[0].f);
    }
  }

  if (!zipPath) {
    throw new Error(
      `Kein ZIP gefunden in: ${outputDir}\n` +
      `  Führe zuerst aus: infactory build --preset=${preset} --zip`
    );
  }

  const zipSize = (fs.statSync(zipPath).size / 1024).toFixed(1);
  info(`        ✔ ZIP: ${path.basename(zipPath)} (${zipSize} KB)`);

  if (dryRun) {
    info(`\n  ✔ Dry Run abgeschlossen — kein Upload.\n`);
    info(`     ZIP bereit: ${zipPath}\n`);
    return { ok: true, dryRun: true, zipPath };
  }

  // ── 3. JWT generieren ────────────────────────────────────────────────────────
  info(`  [3/4] Authentifizierung`);
  const token = generateJWT(keyId, keySecret);
  log(`        JWT: ${token.substring(0, 40)}...`);
  info(`        ✔ JWT generiert (HS256)`);

  // ── 4. Upload ────────────────────────────────────────────────────────────────
  info(`  [4/4] Upload`);
  const uploadUrl = `${baseUrl}/ghost/api/admin/themes/upload/`;
  log(`        POST ${uploadUrl}`);

  const uploadResult = await uploadTheme(uploadUrl, token, zipPath);

  if (!uploadResult.ok) {
    throw new Error(
      `Upload fehlgeschlagen (HTTP ${uploadResult.status}):\n` +
      `  ${uploadResult.body}\n\n` +
      `  Tipps:\n` +
      `  • Ghost URL korrekt? (${baseUrl})\n` +
      `  • Admin API Key gültig? (Ghost Admin → Settings → Integrations)\n` +
      `  • Ghost erreichbar? (CORS, Firewall, VPN)`
    );
  }

  const themeName = uploadResult.data?.themes?.[0]?.name || preset;
  info(`        ✔ Theme hochgeladen: "${themeName}"`);
  log(`        Response: ${JSON.stringify(uploadResult.data, null, 2)}`);

  // ── 5. Aktivieren ────────────────────────────────────────────────────────────
  if (activate) {
    const activateUrl = `${baseUrl}/ghost/api/admin/themes/${encodeURIComponent(themeName)}/activate/`;
    log(`        PUT ${activateUrl}`);

    const activateResult = await activateTheme(activateUrl, token);

    if (!activateResult.ok) {
      // Nicht als fataler Fehler — Theme ist hochgeladen, nur Aktivierung schlug fehl
      console.warn(
        `\n  ⚠  Aktivierung fehlgeschlagen (HTTP ${activateResult.status}).\n` +
        `     Theme ist hochgeladen — aktiviere manuell in Ghost Admin → Design.\n`
      );
    } else {
      info(`        ✔ Theme aktiviert: "${themeName}"`);
    }
  } else {
    info(`        ℹ  Aktivierung übersprungen (--no-activate)`);
    info(`           Ghost Admin → Design → "${themeName}" aktivieren`);
  }

  info(`\n  ✅  Deploy abgeschlossen!\n`);
  info(`     ${baseUrl}/ghost/#/settings/design\n`);

  return { ok: true, themeName, zipPath, ghostUrl: baseUrl };
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

/**
 * Ghost Admin API JWT generieren.
 * Spec: https://ghost.org/docs/admin-api/#token-authentication
 *
 * Header: { alg: "HS256", typ: "JWT", kid: keyId }
 * Payload: { iat, exp (+5min), aud: "/admin/" }
 * Signature: HMAC-SHA256 mit hex-decodiertem secret
 */
function generateJWT(keyId, keySecret) {
  const now   = Math.floor(Date.now() / 1000);
  const exp   = now + 5 * 60; // 5 Minuten

  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId }));
  const payload = b64url(JSON.stringify({ iat: now, exp, aud: '/admin/' }));

  const signingInput = `${header}.${payload}`;
  const secretBytes  = Buffer.from(keySecret, 'hex');

  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

// ─── HTTP Helpers ──────────────────────────────────────────────────────────────

/**
 * Multipart-Upload für Ghost Theme ZIP.
 * POST /ghost/api/admin/themes/upload/
 * Content-Type: multipart/form-data; boundary=<boundary>
 * Field: "file" → ZIP-Datei
 */
async function uploadTheme(url, token, zipPath) {
  const boundary = `----InFactoryBoundary${Date.now().toString(36)}`;
  const filename  = path.basename(zipPath);
  const fileData  = fs.readFileSync(zipPath);

  // Multipart-Body manuell bauen (kein form-data dependency nötig)
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
    'Content-Length': body.length,
    'Accept':         'application/json',
    'Accept-Version': 'v5.0',
  };

  return httpRequest('POST', url, headers, body);
}

/**
 * Theme aktivieren.
 * PUT /ghost/api/admin/themes/:name/activate/
 */
async function activateTheme(url, token) {
  const headers = {
    'Authorization':  `Ghost ${token}`,
    'Content-Type':   'application/json',
    'Accept':         'application/json',
    'Accept-Version': 'v5.0',
  };
  return httpRequest('PUT', url, headers, null);
}

/**
 * Generischer HTTP-Request (no external dependencies).
 * Unterstützt http + https.
 */
function httpRequest(method, urlStr, headers, body) {
  return new Promise((resolve) => {
    const parsed   = new URL(urlStr);
    const lib      = parsed.protocol === 'https:' ? https : http;
    const options  = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed_data = null;
        try { parsed_data = JSON.parse(data); } catch { parsed_data = data; }
        resolve({
          ok:     res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body:   data,
          data:   parsed_data,
        });
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, status: 0, body: err.message, data: null });
    });

    if (body) req.write(body);
    req.end();
  });
}

// ─── Config Helper ────────────────────────────────────────────────────────────

/**
 * Deploy-Config aus .infactory.json + ENV auflesen.
 * Priorität: CLI-Flag > ENV > .infactory.json
 */
function resolveDeployConfig(opts, projectCfg) {
  return {
    ghostUrl: opts.url
      || process.env.INFACTORY_GHOST_URL
      || (projectCfg && projectCfg.deploy && projectCfg.deploy.url)
      || null,

    adminKey: opts.key
      || process.env.INFACTORY_GHOST_KEY
      || (projectCfg && projectCfg.deploy && projectCfg.deploy.key)
      || null,
  };
}

module.exports = { deploy, resolveDeployConfig, generateJWT };
