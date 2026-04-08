/**
 * preview-server.js — inFactory Preview Server v0.3
 *
 * Startet einen lokalen Express-Server, der Ghost-Themes rendert
 * ohne eine Ghost-Installation zu benötigen.
 *
 * Features:
 *   - express-hbs (Ghost's eigene Template-Engine)
 *   - Ghost Handlebars Helper Stubs
 *   - Mock Content API (Posts, Tags, Authors, @site)
 *   - Hot Reload via chokidar + Server-Sent Events
 *   - gscan Validierung beim Start + nach jedem Rebuild
 *   - Automatischer Browser-Open
 *
 * Usage:
 *   infactory preview --preset=agency
 *   infactory preview --preset=saas --port=3000 --no-open
 *   infactory preview --preset=blog --mock=./fixtures.json --verbose
 */

'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');
const yaml     = require('js-yaml');
const EventEmitter = require('events');

const { loadMockData }     = require('./mock-data');
const { registerGhostStubs } = require('./hbs-stubs');
const { build }            = require('./build');

// express-hbs: Ghost's eigene Template-Engine (MIT, von TryGhost)
let hbs;
try { hbs = require('express-hbs'); }
catch { throw new Error("express-hbs fehlt. Bitte: npm install express-hbs"); }

// chokidar: File Watcher für Hot Reload
let chokidar;
try { chokidar = require('chokidar'); }
catch { chokidar = null; }

// gscan: Ghost Theme Validator
let gscan;
try { gscan = require('gscan'); }
catch { gscan = null; }

// Browser-Open
let openBrowser;
try { openBrowser = require('open'); }
catch { openBrowser = null; }

const reloadEmitter = new EventEmitter();
reloadEmitter.setMaxListeners(50);

/**
 * Startet den Preview Server.
 *
 * @param {object} opts
 * @param {string}  opts.preset       - Preset-ID
 * @param {string}  opts.presetsDir   - Pfad zu presets/
 * @param {string}  opts.registryPath - Pfad zu sections/registry.json
 * @param {string}  opts.baseThemeDir - Pfad zu base-theme/
 * @param {string}  opts.outputDir    - Build-Output-Verzeichnis (./dist)
 * @param {number}  opts.port         - Port (default: 2369)
 * @param {boolean} opts.open         - Browser öffnen?
 * @param {string}  opts.mockPath     - Custom Fixtures-JSON
 * @param {boolean} opts.verbose      - Verbose Logging
 */
async function startPreviewServer(opts) {
  const {
    preset,
    presetsDir   = path.resolve('./presets'),
    registryPath = path.resolve('./sections/registry.json'),
    baseThemeDir = path.resolve('./base-theme'),
    outputDir    = path.resolve('./dist'),
    port         = 2369,
    open         = true,
    mockPath     = null,
    verbose      = false,
  } = opts;

  const log  = verbose ? (m) => console.log(m) : () => {};
  const info = (m) => console.log(m);

  info(`\n🏭 inFactory Preview Server v0.3 — Preset: ${preset}\n`);

  // ── Schritt 1: Preset laden ──────────────────────────────────────────────────
  const presetPath = path.join(presetsDir, `${preset}.yaml`);
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset nicht gefunden: ${presetPath}`);
  }
  const presetData = yaml.load(fs.readFileSync(presetPath, 'utf8'));
  log(`  ✔ Preset geladen: ${presetData.name}`);

  // ── Schritt 2: Build ausführen ───────────────────────────────────────────────
  info('  [1/4] Build...');
  const buildResult = await build({
    preset, presetsDir, registryPath, baseThemeDir, outputDir, zip: false, verbose,
  });
  const themeDir = buildResult.themeDir;
  info(`        ✔ Theme: ${themeDir}`);

  // ── Schritt 3: gscan Validierung ─────────────────────────────────────────────
  info('  [2/4] gscan Validierung...');
  await runGscan(themeDir, info);

  // ── Schritt 4: Mock-Daten laden ──────────────────────────────────────────────
  info('  [3/4] Mock-Daten...');
  const mockData = loadMockData(mockPath, presetData);
  info(`        ✔ ${mockData.posts.length} Posts, ${mockData.tags.length} Tags, ${mockData.authors.length} Autoren`);

  // ── Schritt 5: Express + express-hbs Setup ────────────────────────────────────
  info('  [4/4] Express startet...');
  const app = express();
  const hbsInstance = hbs.create();

  // Ghost verwendet express-hbs intern — gleiche Engine, gleiche API
  app.engine('hbs', hbsInstance.express4({
    partialsDir: [
      path.join(themeDir, 'partials'),
      path.join(themeDir, 'partials', 'sections'),
    ],
    defaultLayout: false,
    extname: '.hbs',
    templateOptions: {
      data: {
        site: mockData.site,
        blog: mockData.site,         // Ghost <5 Alias
        labs: { members: true },
        @config: undefined,           // sicherheitshalber leer
      }
    },
  }));

  app.set('view engine', 'hbs');
  app.set('views', themeDir);
  app.set('view cache', false);  // für Hot Reload

  // Ghost Stubs registrieren
  registerGhostStubs(hbsInstance);
  log('        ✔ Ghost Helper Stubs registriert');

  // ── Static Assets ────────────────────────────────────────────────────────────
  app.use('/assets', express.static(path.join(themeDir, 'assets')));

  // ── Server-Sent Events für Hot Reload ────────────────────────────────────────
  app.get('/__infactory/reload', (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.write('data: connected\n\n');

    const onReload = () => res.write('data: reload\n\n');
    reloadEmitter.on('change', onReload);
    req.on('close', () => reloadEmitter.off('change', onReload));
  });

  // ── Status Route ─────────────────────────────────────────────────────────────
  app.get('/__infactory/status', (req, res) => {
    res.json({
      ok:      true,
      preset,
      themeDir,
      posts:   mockData.posts.length,
      version: '0.3.0',
    });
  });

  // ── Ghost Context Helper ──────────────────────────────────────────────────────
  function buildContext(extra = {}) {
    return {
      ...extra,
      _mockPosts:   mockData.posts,      // für {{#get}} Stub
      site:         mockData.site,
      blog:         mockData.site,       // Ghost <5 Alias
      navigation:   mockData.site.navigation,
      secondary_navigation: mockData.site.secondary_navigation,
    };
  }

  // ── Routes ───────────────────────────────────────────────────────────────────

  // / → home.hbs (Index-Kontext)
  app.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const perPage = 9;
    const start = (page - 1) * perPage;
    const pagePosts = mockData.posts.slice(start, start + perPage);

    res.render('home', buildContext({
      posts:      pagePosts,
      pagination: {
        page,
        limit:  perPage,
        pages:  Math.ceil(mockData.posts.length / perPage),
        total:  mockData.posts.length,
        next:   start + perPage < mockData.posts.length ? page + 1 : null,
        prev:   page > 1 ? page - 1 : null,
      },
    }), renderErrorHandler(res));
  });

  // /page/:n → Paginierte Index-Seite
  app.get('/page/:page', (req, res) => {
    res.redirect(`/?page=${req.params.page}`);
  });

  // /tag/:slug → tag.hbs
  app.get('/tag/:slug', (req, res) => {
    const tag = mockData.tags.find(t => t.slug === req.params.slug)
              || mockData.tags[0];
    const posts = mockData.posts.filter(p =>
      p.tags && p.tags.some(t => t.slug === tag.slug)
    );
    res.render('tag', buildContext({
      tag,
      posts,
      pagination: { page: 1, limit: 9, pages: 1, total: posts.length, next: null, prev: null },
    }), renderErrorHandler(res));
  });

  // /author/:slug → author.hbs
  app.get('/author/:slug', (req, res) => {
    const author = mockData.authors.find(a => a.slug === req.params.slug)
                 || mockData.authors[0];
    const posts  = mockData.posts.filter(p =>
      p.authors && p.authors.some(a => a.slug === author.slug)
    );
    res.render('author', buildContext({
      author,
      posts,
      pagination: { page: 1, limit: 9, pages: 1, total: posts.length, next: null, prev: null },
    }), renderErrorHandler(res));
  });

  // /:slug → post.hbs (muss nach spezifischeren Routes kommen)
  app.get('/:slug', (req, res) => {
    const post = mockData.posts.find(p => p.slug === req.params.slug)
               || mockData.posts[0];

    // Prüfe ob es ein Page-Template gibt → page.hbs
    const pageTemplate = path.join(themeDir, 'page.hbs');
    const template = fs.existsSync(pageTemplate) ? 'page' : 'post';

    res.render(template, buildContext({
      post,
      posts:   [post],
      tags:    post.tags,
      authors: post.authors,
    }), renderErrorHandler(res));
  });

  // 404 → error-404.hbs
  app.use((req, res) => {
    const tpl404 = path.join(themeDir, 'error-404.hbs');
    const tpl    = fs.existsSync(tpl404) ? 'error-404' : 'error';
    res.status(404).render(tpl, buildContext({
      statusCode: 404,
      message: 'Diese Seite existiert nicht.',
    }), renderErrorHandler(res));
  });

  // ── Server starten ───────────────────────────────────────────────────────────
  const server = http.createServer(app);
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    info(`\n  ✅ Preview läuft:`);
    info(`     ${url}`);
    info(`     Strg+C zum Beenden\n`);

    if (open && openBrowser) {
      openBrowser(url).catch(() => {});
    }
  });

  // ── Hot Reload via chokidar ───────────────────────────────────────────────────
  if (chokidar) {
    const watchPaths = [
      path.join(baseThemeDir, '**', '*.hbs'),
      path.join(baseThemeDir, '**', '*.css'),
      path.join(presetPath),
    ];
    log(`\n  👁  Watcher aktiv:`);
    for (const p of watchPaths) log(`     ${p}`);

    let rebuildTimer = null;

    const watcher = chokidar.watch(watchPaths, {
      ignoreInitial:  true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    watcher.on('change', async (filePath) => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(async () => {
        const rel = path.relative(process.cwd(), filePath);
        info(`\n  🔄 Änderung: ${rel}`);

        try {
          await build({ preset, presetsDir, registryPath, baseThemeDir, outputDir, zip: false, verbose: false });
          app.set('view cache', false);
          hbsInstance.cache = {};
          info(`     ✔ Rebuild OK → Browser reload`);
          reloadEmitter.emit('change');
        } catch (err) {
          info(`     ✗ Rebuild Fehler: ${err.message}`);
        }
      }, 100);
    });

    server.on('close', () => watcher.close());
  } else {
    info('  ⚠  chokidar nicht installiert — kein Hot Reload. npm install chokidar');
  }

  return { server, themeDir, url: `http://localhost:${port}` };
}

/**
 * Renderfehler-Handler: Gibt HTML-Fehlerseite zurück statt Stack-Trace.
 */
function renderErrorHandler(res) {
  return (err, html) => {
    if (err) {
      const msg = err.message || String(err);
      res.status(500).send(`
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>inFactory Preview — Render-Fehler</title>
<style>
  body{font-family:monospace;padding:2rem;background:#1c1b19;color:#cdccca;max-width:900px}
  h1{color:#dd6974;font-size:1.25rem}pre{background:#171614;padding:1rem;border-radius:8px;overflow:auto}
  .hint{color:#4f98a3;margin-top:1rem}
</style></head><body>
<h1>⚠ Render-Fehler</h1>
<pre>${escapeHtml(msg)}</pre>
<p class="hint">Überprüfe die .hbs Datei und starte ggf. <code>infactory sections validate</code></p>
<script>new EventSource('/__infactory/reload').onmessage=()=>location.reload();</script>
</body></html>`);
      return;
    }
    res.send(html);
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * Führt gscan aus und loggt Ergebnisse.
 */
async function runGscan(themeDir, info) {
  if (!gscan) {
    info('        ⚠  gscan nicht installiert — Validierung übersprungen. npm install gscan');
    return;
  }
  try {
    const result = await gscan.checkDirectory(themeDir, { checkVersion: 'v5' });
    const errors   = result.errors   || [];
    const warnings = result.warnings || [];

    if (errors.length === 0 && warnings.length === 0) {
      info('        ✔ gscan — keine Fehler, keine Warnungen');
    } else {
      if (errors.length > 0) {
        info(`        ✗ gscan — ${errors.length} Fehler:`);
        for (const e of errors.slice(0, 5)) info(`          • ${e.rule}`);
      }
      if (warnings.length > 0) {
        info(`        ⚠ gscan — ${warnings.length} Warnungen`);
      }
    }
  } catch (e) {
    info(`        ⚠ gscan Fehler: ${e.message}`);
  }
}

module.exports = { startPreviewServer };
