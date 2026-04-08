/**
 * preset-clone.js — inFactory CLI Preset Clone v0.6
 *
 * Forkt ein bestehendes Preset und erzeugt eine vollständig
 * eigenständige Kopie mit neuer ID, optionalen Token-Overrides
 * und optionaler Layout-Übersteuerung.
 *
 * Usage:
 *   infactory preset clone blog --name=recode-blog
 *   infactory preset clone agency --name=client-xyz --color=#e11d48
 *   infactory preset clone saas --name=my-saas --font-display="'Boska', serif"
 *   infactory preset clone blog --name=newsletter --sections=hero_centered,posts_featured,cta_newsletter
 *   infactory preset clone agency --name=dark-agency --description="Dark Agentur Theme"
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Preset klonen.
 *
 * @param {object} opts
 * @param {string}   opts.sourceId      - Quell-Preset-ID (z.B. "blog")
 * @param {string}   opts.name          - Neuer Slug/ID (z.B. "recode-blog")
 * @param {string}   opts.presetsDir    - Pfad zu presets/
 * @param {string}   opts.registryPath  - Pfad zu registry.json (für Sections-Validierung)
 * @param {string|null} opts.color      - Primärfarbe überschreiben (#hex)
 * @param {string|null} opts.fontDisplay - Display-Font überschreiben
 * @param {string|null} opts.fontBody   - Body-Font überschreiben
 * @param {string|null} opts.description - Beschreibung überschreiben
 * @param {string|null} opts.sections   - Komma-getrenntes Layout überschreiben
 * @param {boolean}  opts.verbose
 * @returns {object} result
 */
async function presetClone(opts) {
  const {
    sourceId,
    name,
    presetsDir,
    registryPath,
    color        = null,
    fontDisplay  = null,
    fontBody     = null,
    description  = null,
    sections     = null,
    verbose      = false,
  } = opts;

  const log  = verbose ? (m) => console.log(m) : () => {};
  const info = (m) => console.log(m);

  // ── Validierung ─────────────────────────────────────────────────────────────
  if (!sourceId) throw new Error('Quell-Preset fehlt. Beispiel: infactory preset clone blog --name=mein-blog');
  if (!name)     throw new Error('--name fehlt. Beispiel: infactory preset clone blog --name=mein-blog');

  const newId   = toSlug(name);
  if (!newId)   throw new Error(`Ungültiger Name: "${name}"`);

  const srcPath = path.join(presetsDir, `${sourceId}.yaml`);
  if (!fs.existsSync(srcPath)) {
    const available = listPresetIds(presetsDir);
    throw new Error(
      `Quell-Preset "${sourceId}" nicht gefunden.\n` +
      (available.length ? `  Verfügbar: ${available.join(', ')}` : '  Keine Presets im Verzeichnis.')
    );
  }

  const dstPath = path.join(presetsDir, `${newId}.yaml`);
  if (fs.existsSync(dstPath)) {
    throw new Error(`Preset "${newId}" existiert bereits: ${dstPath}\n  Lösche es zuerst oder wähle einen anderen Namen.`);
  }

  // ── Quell-Preset laden + tief kopieren ──────────────────────────────────────
  const source   = yaml.load(fs.readFileSync(srcPath, 'utf8'));
  const cloned   = deepClone(source);

  // ── ID + Name setzen ─────────────────────────────────────────────────────────
  cloned.id   = newId;
  cloned.name = toTitleCase(name);

  // ── Optionale Overrides ──────────────────────────────────────────────────────

  // Tokens sicherstellen
  if (!cloned.tokens)        cloned.tokens = {};
  if (!cloned.tokens.color)  cloned.tokens.color = {};
  if (!cloned.tokens.font)   cloned.tokens.font  = {};

  if (color) {
    if (!isValidHex(color)) throw new Error(`Ungültige Farbe: "${color}" — erwartet #RRGGBB oder #RGB`);
    cloned.tokens.color.primary       = color;
    cloned.tokens.color.primary_hover = darken(color, 0.15);
    cloned.tokens.color.primary_active= darken(color, 0.30);
    log(`  ✔ Farbe: ${color} → hover: ${cloned.tokens.color.primary_hover}`);
  }

  if (fontDisplay) {
    cloned.tokens.font.display = fontDisplay;
    log(`  ✔ font-display: ${fontDisplay}`);
  }

  if (fontBody) {
    cloned.tokens.font.body = fontBody;
    log(`  ✔ font-body: ${fontBody}`);
  }

  if (description) {
    cloned.description = description;
  }

  // ── Layout überschreiben ─────────────────────────────────────────────────────
  if (sections) {
    const sectionList = sections.split(',').map(s => s.trim()).filter(Boolean);

    // Gegen Registry validieren
    if (fs.existsSync(registryPath)) {
      const registry    = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const knownIds    = (registry.sections || []).map(s => s.id);
      const unknown     = sectionList.filter(id => !knownIds.includes(id));
      if (unknown.length > 0) {
        throw new Error(
          `Unbekannte Section-IDs: ${unknown.join(', ')}\n` +
          `  Verfügbar: ${knownIds.join(', ')}`
        );
      }
    }

    if (!cloned.layout) cloned.layout = {};
    cloned.layout.home = sectionList;
    log(`  ✔ Layout: ${sectionList.join(' → ')}`);
  }

  // Herkunft dokumentieren (für Debugging + Studio-Anzeige)
  cloned._cloned_from = sourceId;
  cloned._cloned_at   = new Date().toISOString();

  // ── Schreiben ────────────────────────────────────────────────────────────────
  const output = yaml.dump(cloned, {
    lineWidth:   120,
    quotingType: '"',
    forceQuotes: false,
    noRefs:      true,
  });

  fs.writeFileSync(dstPath, output, 'utf8');

  // ── Output ───────────────────────────────────────────────────────────────────
  info(`\n  ✔  Preset geklont: ${sourceId} → ${newId}`);
  info(`     Datei: ${dstPath}`);
  info(`     Name:  ${cloned.name}`);
  if (cloned.tokens.color.primary)  info(`     Farbe: ${cloned.tokens.color.primary}`);
  if (cloned.tokens.font.display)   info(`     Font:  ${cloned.tokens.font.display}`);
  if (cloned.layout && cloned.layout.home) {
    info(`     Layout (${cloned.layout.home.length} Sections):`);
    cloned.layout.home.forEach((s, i) => info(`       ${i + 1}. ${s}`));
  }
  info(`\n  Nächste Schritte:`);
  info(`    infactory build   --preset=${newId}`);
  info(`    infactory preview --preset=${newId}\n`);

  return { ok: true, newId, presetPath: dstPath, cloned };
}

/**
 * Preset löschen.
 */
async function presetRemove(opts) {
  const { presetId, presetsDir, force = false } = opts;

  const presetPath = path.join(presetsDir, `${presetId}.yaml`);
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset "${presetId}" nicht gefunden: ${presetPath}`);
  }

  if (!force) {
    console.log(`\n  ⚠  Preset "${presetId}" löschen?`);
    console.log(`     ${presetPath}`);
    console.log(`     Verwende --force zum Bestätigen.\n`);
    return { ok: false, reason: 'needs_force' };
  }

  fs.unlinkSync(presetPath);
  console.log(`\n  ✔  Preset "${presetId}" gelöscht.\n`);
  return { ok: true };
}

/**
 * Alle vorhandenen Presets anzeigen mit Details.
 */
function presetList(presetsDir) {
  const ids = listPresetIds(presetsDir);
  if (!ids.length) {
    console.log('\n  Keine Presets gefunden.\n');
    return;
  }
  console.log('\n  Presets\n');
  for (const id of ids) {
    try {
      const data = yaml.load(fs.readFileSync(path.join(presetsDir, `${id}.yaml`), 'utf8'));
      const clonedFrom = data._cloned_from ? ` (geklont von: ${data._cloned_from})` : '';
      const sections   = (data.layout && data.layout.home) ? data.layout.home.length : 0;
      console.log(`  ${data.icon || '•'}  ${id.padEnd(20)} ${(data.name||id).padEnd(20)} ${sections} Sections${clonedFrom}`);
    } catch {
      console.log(`  •  ${id}`);
    }
  }
  console.log();
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[äöüÄÖÜß]/g, c => ({ ä:'ae',ö:'oe',ü:'ue',Ä:'ae',Ö:'oe',Ü:'ue',ß:'ss' }[c]||c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toTitleCase(str) {
  return str.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function listPresetIds(presetsDir) {
  if (!fs.existsSync(presetsDir)) return [];
  return fs.readdirSync(presetsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => f.replace(/\.ya?ml$/, ''));
}

function isValidHex(color) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

/**
 * Hex-Farbe um einen Faktor abdunkeln.
 * @param {string} hex   - #RRGGBB
 * @param {number} amount - 0.0–1.0
 */
function darken(hex, amount) {
  const clean = hex.replace('#', '');
  const full  = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;

  const r = Math.max(0, Math.round(parseInt(full.slice(0,2),16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(full.slice(2,4),16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(full.slice(4,6),16) * (1 - amount)));

  return '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
}

module.exports = { presetClone, presetRemove, presetList };
