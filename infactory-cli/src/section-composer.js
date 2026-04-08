/**
 * section-composer.js — inFactory CLI Section Composer v0.5
 *
 * Drei neue Befehle:
 *   infactory section add <id> --preset=agency
 *   infactory section remove <id> --preset=agency
 *   infactory section move <id> --pos=2 --preset=agency
 *
 * Liest/schreibt direkt in preset.yaml → layout.home[]
 * Validiert gegen registry.json (Preset-Kompatibilität, Duplikate)
 * Führt danach automatisch einen Rebuild + Reload-Signal aus
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Section zu einem Preset hinzufügen.
 *
 * @param {object} opts
 * @param {string}  opts.sectionId     - Section-ID (z.B. "social_proof_bar")
 * @param {string}  opts.preset        - Preset-ID
 * @param {string}  opts.presetsDir
 * @param {string}  opts.registryPath
 * @param {number|null} opts.position  - Einfügeposition (0-basiert, null = Ende)
 * @param {boolean} opts.force         - Auch hinzufügen wenn nicht im presets[]-Array
 * @param {boolean} opts.verbose
 * @returns {object} result
 */
async function sectionAdd(opts) {
  const { sectionId, preset, presetsDir, registryPath, position = null, force = false, verbose = false } = opts;
  const log = verbose ? console.log : () => {};

  const { presetData, presetPath, registry } = loadAll(preset, presetsDir, registryPath);
  const section = findSection(registry, sectionId);

  // ── Validierungen ────────────────────────────────────────────────────────────
  if (!section) {
    const available = (registry.sections || []).map(s => s.id);
    throw new Error(
      `Section "${sectionId}" nicht in der Registry.\n` +
      `  Verfügbar: ${available.join(', ')}`
    );
  }

  const homeLayout = ensureHomeLayout(presetData);

  if (homeLayout.includes(sectionId)) {
    throw new Error(`Section "${sectionId}" ist bereits im Layout von Preset "${preset}".`);
  }

  const compatPresets = section.presets || [];
  if (!force && compatPresets.length > 0 && !compatPresets.includes(preset)) {
    console.warn(
      `  ⚠  Section "${sectionId}" ist für Presets [${compatPresets.join(', ')}] optimiert.\n` +
      `     Preset "${preset}" ist nicht in der Liste.\n` +
      `     Verwende --force um trotzdem hinzuzufügen.`
    );
    return { ok: false, reason: 'incompatible_preset' };
  }

  // ── Einfügen ─────────────────────────────────────────────────────────────────
  const insertAt = position !== null
    ? Math.min(Math.max(0, position), homeLayout.length)
    : homeLayout.length;

  homeLayout.splice(insertAt, 0, sectionId);
  presetData.layout.home = homeLayout;

  writePreset(presetPath, presetData);

  console.log(`  ✔  Section "${sectionId}" zu "${preset}" hinzugefügt (Position ${insertAt + 1}/${homeLayout.length})`);
  log(`     Layout: ${homeLayout.join(' → ')}`);

  return { ok: true, layout: homeLayout, position: insertAt };
}

/**
 * Section aus einem Preset entfernen.
 */
async function sectionRemove(opts) {
  const { sectionId, preset, presetsDir, registryPath, verbose = false } = opts;
  const log = verbose ? console.log : () => {};

  const { presetData, presetPath } = loadAll(preset, presetsDir, registryPath);
  const homeLayout = ensureHomeLayout(presetData);

  const idx = homeLayout.indexOf(sectionId);
  if (idx === -1) {
    throw new Error(`Section "${sectionId}" nicht im Layout von Preset "${preset}".`);
  }

  homeLayout.splice(idx, 1);
  presetData.layout.home = homeLayout;
  writePreset(presetPath, presetData);

  console.log(`  ✔  Section "${sectionId}" aus "${preset}" entfernt`);
  log(`     Layout: ${homeLayout.join(' → ')}`);

  return { ok: true, layout: homeLayout };
}

/**
 * Section innerhalb des Layouts verschieben.
 */
async function sectionMove(opts) {
  const { sectionId, preset, presetsDir, registryPath, position, verbose = false } = opts;
  const log = verbose ? console.log : () => {};

  if (position === null || position === undefined) {
    throw new Error('--pos fehlt. Beispiel: infactory section move hero_split --pos=1 --preset=agency');
  }

  const { presetData, presetPath } = loadAll(preset, presetsDir, registryPath);
  const homeLayout = ensureHomeLayout(presetData);

  const idx = homeLayout.indexOf(sectionId);
  if (idx === -1) {
    throw new Error(`Section "${sectionId}" nicht im Layout von Preset "${preset}".`);
  }

  // Entfernen und an neuer Position einfügen
  homeLayout.splice(idx, 1);
  const insertAt = Math.min(Math.max(0, position - 1), homeLayout.length); // --pos ist 1-basiert
  homeLayout.splice(insertAt, 0, sectionId);
  presetData.layout.home = homeLayout;
  writePreset(presetPath, presetData);

  console.log(`  ✔  Section "${sectionId}" auf Position ${insertAt + 1} verschoben`);
  log(`     Layout: ${homeLayout.join(' → ')}`);

  return { ok: true, layout: homeLayout };
}

/**
 * Aktuelles Layout eines Presets anzeigen.
 */
function sectionLayout(opts) {
  const { preset, presetsDir, registryPath } = opts;
  const { presetData, registry } = loadAll(preset, presetsDir, registryPath);
  const homeLayout = ensureHomeLayout(presetData);

  console.log(`\n  Layout: ${preset}\n`);
  homeLayout.forEach((id, i) => {
    const section = findSection(registry, id);
    const label   = section ? section.label : '(unbekannt)';
    const cat     = section ? (registry.categories[section.category] || {}).icon || '•' : '?';
    console.log(`    ${String(i + 1).padStart(2)}.  ${cat}  ${id.padEnd(24)} ${label}`);
  });
  console.log();

  return { ok: true, layout: homeLayout };
}

/**
 * Alle verfügbaren Sections anzeigen, optional nach Kategorie gefiltert.
 */
function sectionSearch(opts) {
  const { query, preset: presetFilter, registryPath } = opts;

  if (!fs.existsSync(registryPath)) {
    throw new Error(`registry.json nicht gefunden: ${registryPath}`);
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  let sections   = registry.sections || [];

  if (query) {
    const q = query.toLowerCase();
    sections = sections.filter(s =>
      s.id.includes(q) || (s.label || '').toLowerCase().includes(q) || s.category.includes(q)
    );
  }
  if (presetFilter) {
    sections = sections.filter(s => !s.presets || s.presets.length === 0 || s.presets.includes(presetFilter));
  }

  console.log(`\n  Sections${query ? ` — "${query}"` : ''}${presetFilter ? ` — Preset: ${presetFilter}` : ''}\n`);

  const byCategory = {};
  for (const s of sections) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  }

  for (const [catId, catSections] of Object.entries(byCategory)) {
    const cat = (registry.categories || {})[catId] || { icon: '•', label: catId };
    console.log(`  ${cat.icon}  ${cat.label}`);
    for (const s of catSections) {
      const presets = (s.presets || []).join(', ') || 'alle';
      console.log(`       ${s.id.padEnd(24)} ${(s.label || '').padEnd(28)} [${presets}]`);
    }
    console.log();
  }

  if (sections.length === 0) console.log('  Keine Sections gefunden.\n');

  return { ok: true, count: sections.length };
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function loadAll(preset, presetsDir, registryPath) {
  const presetPath = path.join(presetsDir, `${preset}.yaml`);
  if (!fs.existsSync(presetPath)) {
    const available = fs.existsSync(presetsDir)
      ? fs.readdirSync(presetsDir).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml',''))
      : [];
    throw new Error(
      `Preset "${preset}" nicht gefunden: ${presetPath}\n` +
      (available.length ? `  Verfügbar: ${available.join(', ')}` : '  Keine Presets gefunden.')
    );
  }

  if (!fs.existsSync(registryPath)) {
    throw new Error(`registry.json nicht gefunden: ${registryPath}`);
  }

  const presetData = yaml.load(fs.readFileSync(presetPath, 'utf8'));
  const registry   = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  return { presetData, presetPath, registry };
}

function findSection(registry, id) {
  return (registry.sections || []).find(s => s.id === id) || null;
}

function ensureHomeLayout(presetData) {
  if (!presetData.layout)      presetData.layout = {};
  if (!presetData.layout.home) presetData.layout.home = [];
  return presetData.layout.home;
}

function writePreset(presetPath, presetData) {
  // YAML schreiben — Kommentare bleiben erhalten soweit möglich
  // js-yaml schreibt sauber, aber Kommentare gehen verloren (YAML-Limitation)
  const output = yaml.dump(presetData, {
    lineWidth:  120,
    quotingType: '"',
    forceQuotes: false,
    noRefs:      true,
  });
  fs.writeFileSync(presetPath, output, 'utf8');
}

module.exports = {
  sectionAdd,
  sectionRemove,
  sectionMove,
  sectionLayout,
  sectionSearch,
};
