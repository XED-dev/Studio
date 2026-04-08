
/**
 * compose-sections.js — inFactory Generator v0.2
 * Liest preset.yaml → layout.home → kopiert Section-Partials → generiert home.hbs
 *
 * Usage (intern, vom CLI aufgerufen):
 *   const { composeSections } = require('./compose-sections');
 *   await composeSections({ preset, registry, baseThemeDir, outputDir });
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Hauptfunktion: Setzt home.hbs aus Section-Partials zusammen.
 * @param {object} opts
 * @param {string} opts.presetPath     - Pfad zur preset.yaml
 * @param {string} opts.registryPath   - Pfad zur registry.json
 * @param {string} opts.baseThemeDir   - Quell-Verzeichnis (base-theme/)
 * @param {string} opts.outputDir      - Ziel-Verzeichnis (dist/infactory-<preset>/)
 * @param {boolean} opts.verbose       - Log-Ausgabe
 * @returns {object} result { ok, sections, warnings }
 */
async function composeSections(opts) {
  const { presetPath, registryPath, baseThemeDir, outputDir, verbose = false } = opts;

  const log  = verbose ? (msg) => console.log(`  ${msg}`) : () => {};
  const warn = (msg)   => console.warn(`  ⚠  ${msg}`);

  // ── 1. Preset + Registry laden ──────────────────────────────────────────────
  if (!fs.existsSync(presetPath))   throw new Error(`Preset nicht gefunden: ${presetPath}`);
  if (!fs.existsSync(registryPath)) throw new Error(`Registry nicht gefunden: ${registryPath}`);

  const preset   = yaml.load(fs.readFileSync(presetPath,   'utf8'));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  // Registry als ID-Map aufbauen
  const sectionMap = {};
  for (const s of registry.sections) sectionMap[s.id] = s;

  log(`Preset:   ${preset.name} (${preset.id})`);
  log(`Registry: ${registry.sections.length} Sections verfügbar`);

  // ── 2. Layout validieren ────────────────────────────────────────────────────
  const layout = preset?.layout?.home;
  if (!layout || !Array.isArray(layout) || layout.length === 0) {
    throw new Error(`preset.yaml enthält kein gültiges layout.home Array`);
  }

  const warnings = [];
  const validSections = [];

  for (const sectionId of layout) {
    if (!sectionMap[sectionId]) {
      warn(`Section '${sectionId}' nicht in Registry — wird übersprungen`);
      warnings.push(`Unbekannte Section: ${sectionId}`);
      continue;
    }
    validSections.push(sectionMap[sectionId]);
    log(`✔ Section: ${sectionId}`);
  }

  if (validSections.length === 0) {
    throw new Error('Keine gültigen Sections im Preset-Layout gefunden');
  }

  // ── 3. Output-Verzeichnisse anlegen ─────────────────────────────────────────
  const partialsRoot = path.join(outputDir, 'partials', 'sections');
  fs.mkdirSync(partialsRoot, { recursive: true });

  // Kategorien als Unterordner
  const categories = [...new Set(validSections.map(s => s.category))];
  for (const cat of categories) {
    fs.mkdirSync(path.join(partialsRoot, cat), { recursive: true });
  }

  // ── 4. Section-Partials kopieren ────────────────────────────────────────────
  const copiedPartials = [];

  for (const section of validSections) {
    const srcFile = path.join(baseThemeDir, section.partial);
    // Ghost sucht Partials in partials/ — sections/ muss darunter liegen
    const dstFile = path.join(outputDir, 'partials', section.partial);

    // Ziel-Verzeichnis sicherstellen
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });

    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, dstFile);
      log(`  → kopiert: ${section.partial}`);
      copiedPartials.push(section);
    } else {
      // Placeholder erzeugen (Section noch nicht implementiert)
      const placeholder = generatePlaceholderPartial(section);
      fs.writeFileSync(dstFile, placeholder, 'utf8');
      warn(`Placeholder erzeugt für: ${section.id} (${srcFile} nicht gefunden)`);
      warnings.push(`Placeholder: ${section.id}`);
      copiedPartials.push(section);
    }
  }

  // ── 5. home.hbs generieren ──────────────────────────────────────────────────
  const homeHbs = generateHomeHbs(preset, copiedPartials);
  const homePath = path.join(outputDir, 'home.hbs');
  fs.writeFileSync(homePath, homeHbs, 'utf8');
  log(`✔ home.hbs generiert (${copiedPartials.length} Sections)`);

  // ── 6. index.hbs als Fallback sicherstellen ─────────────────────────────────
  const indexPath = path.join(outputDir, 'index.hbs');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, '{{!> home}}\n', 'utf8');
    log(`✔ index.hbs Fallback erzeugt`);
  }

  return {
    ok:       warnings.length === 0,
    sections: copiedPartials.map(s => s.id),
    warnings,
    homePath,
  };
}

/**
 * Generiert den home.hbs Inhalt aus Preset + Sections.
 */
function generateHomeHbs(preset, sections) {
  const sectionIncludes = sections
    .map(s => {
      const partialPath = s.partial.replace(/\.hbs$/, '').replace(/^sections\//, 'sections/');
      return [
        `  {{!-- ── ${s.label} ─────────────────────────── --}}`,
        `  {{> "${partialPath}"}}`,
      ].join('\n');
    })
    .join('\n\n');

  const now = new Date().toISOString().split('T')[0];

  return `{{!--
  home.hbs — inFactory Generated
  ─────────────────────────────────────────────────
  Preset:    ${preset.name} (${preset.id})
  Sections:  ${sections.map(s => s.id).join(', ')}
  Generated: ${now} by inFactory CLI v0.2

  ⚠  NICHT MANUELL BEARBEITEN.
     Änderungen am Layout → preset.yaml → infactory build
  ─────────────────────────────────────────────────
--}}

{{!< default}}

${sectionIncludes}
`;
}

/**
 * Erzeugt einen Placeholder-Partial für noch nicht implementierte Sections.
 */
function generatePlaceholderPartial(section) {
  return `{{!--
  ${section.partial} — PLACEHOLDER
  Section: ${section.label}
  Beschreibung: ${section.description}
  TODO: Diesen Placeholder mit echtem .hbs ersetzen.
  Ghost Helpers: ${(section.ghost_helpers || []).join(', ') || 'keine'}
--}}
<section class="s-placeholder" aria-label="${section.label} (Placeholder)" style="padding:4rem 1rem;text-align:center;background:var(--color-surface-offset);color:var(--color-text-muted);">
  <p style="font-family:monospace;font-size:0.875rem;">
    [inFactory] Section Placeholder: <strong>${section.id}</strong><br>
    ${section.description}
  </p>
</section>
`;
}

module.exports = { composeSections, generateHomeHbs };
