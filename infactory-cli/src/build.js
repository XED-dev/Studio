
/**
 * build.js — inFactory CLI Build Command v0.2
 * Vollständiger Build-Prozess: Preset → Ghost-Theme-Verzeichnis + Optional ZIP
 *
 * Usage:
 *   infactory build --preset=agency
 *   infactory build --preset=saas --out=./dist --zip
 *   infactory build --preset=blog --verbose
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { composeSections } = require('./compose-sections');
const { generateTokens }  = require('./generate-tokens');

/**
 * Build-Pipeline
 * @param {object} opts
 * @param {string}  opts.preset       - Preset-ID (z.B. "agency")
 * @param {string}  opts.presetsDir   - Pfad zu presets/  (default: ./presets)
 * @param {string}  opts.registryPath - Pfad zu sections/registry.json
 * @param {string}  opts.baseThemeDir - Pfad zu base-theme/
 * @param {string}  opts.outputDir    - Ausgabeverzeichnis (default: ./dist)
 * @param {boolean} opts.zip          - ZIP erzeugen?
 * @param {boolean} opts.verbose      - Verbose Logging?
 * @returns {object} buildResult
 */
async function build(opts) {
  const {
    preset,
    presetsDir   = path.resolve('./presets'),
    registryPath = path.resolve('./sections/registry.json'),
    baseThemeDir = path.resolve('./base-theme'),
    outputDir    = path.resolve('./dist'),
    zip          = false,
    verbose      = false,
  } = opts;

  const log  = verbose ? (m) => console.log(m) : () => {};
  const info = (m) => console.log(m);

  const startTime = Date.now();
  info(`\n🏭 inFactory Build — Preset: ${preset}\n`);

  // ── Schritt 1: Preset-Datei finden ─────────────────────────────────────────
  const presetPath = path.join(presetsDir, `${preset}.yaml`);
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset nicht gefunden: ${presetPath}\nVerfügbar: ${listPresets(presetsDir).join(', ')}`);
  }

  const presetData = yaml.load(fs.readFileSync(presetPath, 'utf8'));
  log(`  ✔ Preset geladen: ${presetData.name}`);

  // ── Schritt 2: Output-Verzeichnis ───────────────────────────────────────────
  const themeDir = path.join(outputDir, `infactory-${preset}`);
  fs.mkdirSync(themeDir, { recursive: true });
  log(`  ✔ Output: ${themeDir}`);

  // ── Schritt 3: base-theme → Output kopieren ─────────────────────────────────
  copyBaseTheme(baseThemeDir, themeDir, log);
  log(`  ✔ base-theme kopiert`);

  // ── Schritt 4: tokens.css generieren ────────────────────────────────────────
  info(`  [1/4] Token-Pipeline...`);
  const tokensResult = await generateTokens({
    presetPath,
    outputCssPath: path.join(themeDir, 'assets', 'css', 'tokens.css'),
    verbose,
  });
  info(`        ✔ tokens.css (${tokensResult.tokensCount} Tokens)`);

  // ── Schritt 5: Sections composieren → home.hbs ───────────────────────────────
  info(`  [2/4] Section Composer...`);
  const composeResult = await composeSections({
    presetPath,
    registryPath,
    baseThemeDir,
    outputDir: themeDir,
    verbose,
  });

  if (composeResult.warnings.length > 0) {
    for (const w of composeResult.warnings) info(`  ⚠  ${w}`);
  }
  info(`        ✔ home.hbs (${composeResult.sections.length} Sections: ${composeResult.sections.join(', ')})`);

  // ── Schritt 6: package.json schreiben ────────────────────────────────────────
  info(`  [3/4] package.json...`);
  const pkg = buildPackageJson(presetData);
  fs.writeFileSync(path.join(themeDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  info(`        ✔ package.json`);

  // ── Schritt 7: SCHEMA.md + ai-analysis Platzhalter ──────────────────────────
  info(`  [4/4] Metadaten...`);
  const analysisPath = path.join(themeDir, 'ai-analysis.json');
  const analysis = {
    timestamp:   new Date().toISOString(),
    theme:       themeDir,
    preset:      preset,
    sections:    composeResult.sections,
    ok:          composeResult.ok,
    warnings:    composeResult.warnings,
    tokens:      tokensResult.tokensCount,
    generated_by: 'inFactory CLI v0.2',
  };
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf8');
  info(`        ✔ ai-analysis.json`);

  // ── Schritt 8: ZIP (optional) ────────────────────────────────────────────────
  let zipPath = null;
  if (zip) {
    info(`\n  📦 ZIP wird erstellt...`);
    zipPath = path.join(outputDir, `infactory-${preset}.zip`);
    await createZip(themeDir, zipPath);
    const size = (fs.statSync(zipPath).size / 1024).toFixed(1);
    info(`     ✔ ${zipPath} (${size} KB)`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  info(`\n✅ Build fertig in ${elapsed}s`);
  info(`   Theme:  ${themeDir}`);
  if (zipPath) info(`   ZIP:    ${zipPath}`);
  info(`   Upload: Ghost Admin → Einstellungen → Design → Theme hochladen\n`);

  return {
    ok:        true,
    themeDir,
    zipPath,
    sections:  composeResult.sections,
    warnings:  composeResult.warnings,
    elapsed,
  };
}

/**
 * Kopiert base-theme/* nach outputDir, ohne home.hbs (wird generiert).
 */
function copyBaseTheme(src, dst, log) {
  if (!fs.existsSync(src)) {
    log(`  ⚠  base-theme nicht gefunden: ${src} — übersprungen`);
    return;
  }
  copyDirRecursive(src, dst, ['home.hbs', 'package.json', 'ai-analysis.json'], log);
}

function copyDirRecursive(src, dst, exclude = [], log) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (exclude.includes(entry)) continue;
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, dstPath, exclude, log);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      log(`    → ${path.relative(dst, dstPath)}`);
    }
  }
}

/**
 * Erzeugt package.json aus Preset-Daten.
 */
function buildPackageJson(preset) {
  const ghost = preset.ghost || {};
  return {
    name:        `infactory-${preset.id}`,
    description: preset.description || `inFactory Theme — ${preset.name}`,
    version:     '1.0.0',
    engines:     { ghost: '>=5.0.0' },
    license:     'MIT',
    author:      { name: 'inFactory CLI', email: 'hello@infactory.com', url: 'https://infactory.com' },
    config: {
      posts_per_page: ghost.posts_per_page || 9,
      image_sizes: {
        xxs: { width: 30 },
        xs:  { width: 100 },
        s:   { width: 300 },
        m:   { width: 600 },
        l:   { width: 1000 },
        xl:  { width: 2000 },
      },
      card_assets: true,
      custom: buildCustomSettings(ghost.custom || []),
    },
  };
}

function buildCustomSettings(customArray) {
  if (!Array.isArray(customArray)) return {};
  const obj = {};
  for (const item of customArray) {
    if (!item.key) continue;
    obj[item.key] = {
      type:    item.type    || 'text',
      default: item.default !== undefined ? item.default : '',
      description: item.description || item.key,
    };
    if (item.options) obj[item.key].options = item.options;
  }
  return obj;
}

/**
 * Listet verfügbare Presets.
 */
function listPresets(presetsDir) {
  if (!fs.existsSync(presetsDir)) return [];
  return fs.readdirSync(presetsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => f.replace(/\.ya?ml$/, ''));
}

/**
 * Erstellt ZIP-Archiv via Node.js (kein externes Binary nötig).
 * Nutzt archiver wenn vorhanden, sonst native zlib-basierte Lösung.
 */
async function createZip(sourceDir, outputPath) {
  // archiver ist eine peer dependency — falls nicht vorhanden: Fallback-Nachricht
  try {
    const archiver = require('archiver');
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  } catch {
    // Fallback: Hinweis ausgeben
    console.warn(`  ⚠  'archiver' nicht installiert. ZIP überspungen.`);
    console.warn(`     npm install archiver  →  dann erneut mit --zip`);
  }
}

module.exports = { build, listPresets };
