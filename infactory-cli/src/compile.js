/**
 * compile.js — Track A Compile-Engine (Schritt A.1, Session 22)
 *
 * Kompiliert eine Page aus
 *   pages/<slug>.json                         (grid_layout + Zonen-Werte)
 *   sections/_a/<id>/{section.yaml, template.hbs}  (Schema + Template)
 *   layouts/<layout>.hbs                      (HTML-Wrapper mit {{{body}}})
 * zu einem finalen HTML-String.
 *
 * Ziel (Session 22): DOM-identisch zum handgeschriebenen Session-20-Proof-of-Life
 * auf jam.steirischursprung.at.
 *
 * Scope bewusst minimal (Schritt A.1):
 * - Nur Handlebars-Format, kein TSX (TSX kommt in Schritt 2 via dd-starter-Fork)
 * - Statisches pages/<slug>.json als Input, keine Payload-Collection (Schritt 2+)
 * - Kein URL-Importer (Schritt 3)
 * - Keine Section-Composition-Features (Partials, Helper, Preset-Overrides)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Handlebars = require('handlebars');

/** Lädt die Page-Definition aus pages/<slug>.json */
function loadPage(cwd, slug) {
  const p = path.join(cwd, 'pages', `${slug}.json`);
  if (!fs.existsSync(p)) throw new Error(`Page not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Lädt Section-Schema + Template aus sections/_a/<id>/ */
function loadSection(cwd, sectionId) {
  const dir      = path.join(cwd, 'sections', '_a', sectionId);
  const yamlPath = path.join(dir, 'section.yaml');
  const hbsPath  = path.join(dir, 'template.hbs');
  if (!fs.existsSync(yamlPath)) throw new Error(`Section YAML not found: ${yamlPath}`);
  if (!fs.existsSync(hbsPath))  throw new Error(`Section template not found: ${hbsPath}`);
  return {
    schema:   yaml.load(fs.readFileSync(yamlPath, 'utf8')),
    template: fs.readFileSync(hbsPath, 'utf8'),
  };
}

/** Lädt ein Layout-Template aus layouts/<name>.hbs */
function loadLayout(cwd, layoutName) {
  const p = path.join(cwd, 'layouts', `${layoutName}.hbs`);
  if (!fs.existsSync(p)) throw new Error(`Layout not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

/** Rendert eine einzelne Section mit den grid_layout-Zonen-Werten */
function renderSection(section, zones) {
  const compiled = Handlebars.compile(section.template);
  return compiled({ zones });
}

/**
 * Hauptfunktion — kompiliert eine Page zu HTML.
 *
 * @param {string} slug — Page-Slug, z.B. 'homepage'
 * @param {object} [opts] — { cwd }: Arbeits-Verzeichnis (Default: process.cwd())
 * @returns {string} — gerendertes HTML
 */
function compilePage(slug, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const page = loadPage(cwd, slug);

  // Alle Sections rendern und als body-Block zusammenfügen
  const sectionHtml = page.sections.map(item => {
    const section = loadSection(cwd, item.section_id);
    return renderSection(section, item.zones);
  }).join('\n');

  // Layout-Wrapper rendern
  const layoutSource = loadLayout(cwd, page.layout || 'default');
  const layoutCompiled = Handlebars.compile(layoutSource);
  return layoutCompiled({
    page: { title: page.title, slug: page.slug },
    body: sectionHtml,
  });
}

module.exports = { compilePage };
