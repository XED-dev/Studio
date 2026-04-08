
/**
 * generate-tokens.js — inFactory Token Pipeline v0.2
 * Liest tokens.json + preset.yaml-Overrides → schreibt tokens.css
 *
 * Usage (intern):
 *   const { generateTokens } = require('./generate-tokens');
 *   await generateTokens({ presetPath, tokensBasePath, outputCssPath, verbose });
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ── Basis Design Tokens (Nexus Palette + inFactory Defaults) ──────────────────
const BASE_TOKENS = {
  // Surfaces — Light
  color_bg:               '#f7f6f2',
  color_surface:          '#f9f8f5',
  color_surface_2:        '#fbfbf9',
  color_surface_offset:   '#f3f0ec',
  color_surface_offset_2: '#edeae5',
  color_surface_dynamic:  '#e6e4df',
  color_divider:          '#dcd9d5',
  color_border:           '#d4d1ca',

  // Text — Light
  color_text:         '#28251d',
  color_text_muted:   '#7a7974',
  color_text_faint:   '#bab9b4',
  color_text_inverse: '#f9f8f4',

  // Primary Accent — Hydra Teal (default)
  color_primary:           '#01696f',
  color_primary_hover:     '#0c4e54',
  color_primary_active:    '#0f3638',
  color_primary_highlight: '#cedcd8',

  // Semantic
  color_success: '#437a22',
  color_warning: '#964219',
  color_error:   '#a12c7b',

  // Typography
  font_display: "'Cabinet Grotesk', 'Georgia', serif",
  font_body:    "'Satoshi', 'Inter', sans-serif",

  // Type Scale (clamp)
  text_xs:   'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
  text_sm:   'clamp(0.875rem, 0.8rem + 0.35vw, 1rem)',
  text_base: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)',
  text_lg:   'clamp(1.125rem, 1rem + 0.75vw, 1.5rem)',
  text_xl:   'clamp(1.5rem, 1.2rem + 1.25vw, 2.25rem)',
  text_2xl:  'clamp(2rem, 1.2rem + 2.5vw, 3.5rem)',
  text_3xl:  'clamp(2.5rem, 1rem + 4vw, 5rem)',
  text_hero: 'clamp(3rem, 0.5rem + 7vw, 8rem)',

  // Spacing (4px system)
  space_1:  '0.25rem',
  space_2:  '0.5rem',
  space_3:  '0.75rem',
  space_4:  '1rem',
  space_5:  '1.25rem',
  space_6:  '1.5rem',
  space_8:  '2rem',
  space_10: '2.5rem',
  space_12: '3rem',
  space_16: '4rem',
  space_20: '5rem',
  space_24: '6rem',
  space_32: '8rem',

  // Radius
  radius_sm:   '0.375rem',
  radius_md:   '0.5rem',
  radius_lg:   '0.75rem',
  radius_xl:   '1rem',
  radius_full: '9999px',

  // Shadows
  shadow_sm: '0 1px 2px oklch(0.2 0.01 80 / 0.06)',
  shadow_md: '0 4px 12px oklch(0.2 0.01 80 / 0.08)',
  shadow_lg: '0 12px 32px oklch(0.2 0.01 80 / 0.12)',

  // Content widths
  content_narrow:  '640px',
  content_default: '960px',
  content_wide:    '1200px',

  // Transitions
  transition_interactive: '180ms cubic-bezier(0.16, 1, 0.3, 1)',
};

// ── Dark Mode Overrides (fix — werden nicht von Preset überschrieben) ─────────
const DARK_TOKENS = {
  color_bg:               '#171614',
  color_surface:          '#1c1b19',
  color_surface_2:        '#201f1d',
  color_surface_offset:   '#1d1c1a',
  color_surface_offset_2: '#22211f',
  color_surface_dynamic:  '#2d2c2a',
  color_divider:          '#262523',
  color_border:           '#393836',
  color_text:         '#cdccca',
  color_text_muted:   '#797876',
  color_text_faint:   '#5a5957',
  color_text_inverse: '#2b2a28',
  color_primary:           '#4f98a3',
  color_primary_hover:     '#227f8b',
  color_primary_active:    '#1a626b',
  color_primary_highlight: '#313b3b',
  color_success: '#6daa45',
  color_warning: '#bb653b',
  color_error:   '#d163a7',
  shadow_sm: '0 1px 2px oklch(0 0 0 / 0.2)',
  shadow_md: '0 4px 12px oklch(0 0 0 / 0.3)',
  shadow_lg: '0 12px 32px oklch(0 0 0 / 0.4)',
};

// Preset-spezifische Primary-Farben: dark-mode Variante auto-aufhellen
const PRESET_DARK_PRIMARY_MAP = {
  agency: { color_primary: '#7ec4cc', color_primary_hover: '#5aadb6', color_primary_active: '#3d96a0' },
  saas:   { color_primary: '#6daadf', color_primary_hover: '#4d8fc8', color_primary_active: '#3474b0' },
  blog:   { color_primary: '#4f98a3', color_primary_hover: '#227f8b', color_primary_active: '#1a626b' },
  studio: { color_primary: '#c49b6a', color_primary_hover: '#b07e4a', color_primary_active: '#8f6035' },
};

// ── Preset-spezifische Default-Overrides ──────────────────────────────────────
const PRESET_DEFAULTS = {
  agency: {
    color_primary:       '#1a1a2e',
    color_primary_hover: '#16213e',
    font_display: "'Clash Display', 'Georgia', serif",
    font_body:    "'General Sans', 'Inter', sans-serif",
  },
  saas: {
    color_primary:       '#2563eb',
    color_primary_hover: '#1d4ed8',
    font_display: "'Cabinet Grotesk', 'Georgia', serif",
    font_body:    "'Satoshi', 'Inter', sans-serif",
  },
  blog: {
    color_primary:       '#01696f',
    color_primary_hover: '#0c4e54',
    font_display: "'Instrument Serif', 'Georgia', serif",
    font_body:    "'Work Sans', 'Helvetica Neue', sans-serif",
  },
  studio: {
    color_primary:       '#8b5e3c',
    color_primary_hover: '#6e4a2e',
    font_display: "'Zodiak', 'Georgia', serif",
    font_body:    "'Satoshi', 'Inter', sans-serif",
  },
};

/**
 * Hauptfunktion: Tokens generieren und als CSS ausgeben.
 */
async function generateTokens(opts) {
  const { presetPath, outputCssPath, verbose = false } = opts;
  const log = verbose ? (m) => console.log(`  ${m}`) : () => {};

  // ── 1. Preset laden ──────────────────────────────────────────────────────────
  let preset = {};
  if (presetPath && fs.existsSync(presetPath)) {
    preset = yaml.load(fs.readFileSync(presetPath, 'utf8'));
    log(`Preset: ${preset.name} (${preset.id})`);
  }

  const presetId = preset.id || 'base';

  // ── 2. Tokens zusammenführen (Priorität: preset.tokens > PRESET_DEFAULTS > BASE) ─
  const presetDefaults    = PRESET_DEFAULTS[presetId] || {};
  const presetOverrides   = flattenTokens(preset.tokens || {});
  const resolvedLight     = { ...BASE_TOKENS, ...presetDefaults, ...presetOverrides };

  // Accent-Farbe: wenn @custom.accent_color gesetzt → überschreibt color_primary
  // (wird zur Laufzeit von Ghost via CSS Custom Property überschrieben — hier als Default)

  // ── 3. Dark Mode: base dark + preset-spezifische Primary-Anpassung ────────────
  const darkPrimary    = PRESET_DARK_PRIMARY_MAP[presetId] || {};
  const resolvedDark   = { ...DARK_TOKENS, ...darkPrimary };

  // ── 4. Font-URL aus Font-Namen ableiten ─────────────────────────────────────
  const fontLinks = deriveFontLinks(resolvedLight.font_display, resolvedLight.font_body);
  log(`Fonts: ${fontLinks.map(f => f.name).join(', ')}`);

  // ── 5. CSS generieren ────────────────────────────────────────────────────────
  const css = buildCss(resolvedLight, resolvedDark, fontLinks, preset, presetId);

  // ── 6. Ausgabe ───────────────────────────────────────────────────────────────
  if (outputCssPath) {
    fs.mkdirSync(path.dirname(outputCssPath), { recursive: true });
    fs.writeFileSync(outputCssPath, css, 'utf8');
    log(`✔ tokens.css → ${outputCssPath}`);
  }

  return { ok: true, css, tokensCount: Object.keys(resolvedLight).length };
}

/**
 * Flacht verschachtelte Preset-Token-Objekte auf: { color: { primary: '#x' } } → { color_primary: '#x' }
 */
function flattenTokens(obj, prefix = '') {
  const flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(flat, flattenTokens(v, key));
    } else {
      flat[key] = v;
    }
  }
  return flat;
}

/**
 * Leitet Font-CDN-Links aus Font-Namen ab.
 */
function deriveFontLinks(displayFont, bodyFont) {
  const FONTSHARE = {
    'Cabinet Grotesk': 'cabinet-grotesk@400,500,700',
    'Satoshi':         'satoshi@300,400,500,700',
    'General Sans':    'general-sans@400,500,600',
    'Clash Display':   'clash-display@400,500,600,700',
    'Zodiak':          'zodiak@400,500,700',
    'Boska':           'boska@400,500,700',
  };
  const GOOGLE = {
    'Instrument Serif': 'family=Instrument+Serif:ital@0;1',
    'Work Sans':        'family=Work+Sans:wght@300..700',
    'DM Sans':          'family=DM+Sans:wght@300..700',
  };

  const links = [];
  const fontshareNeeded = [];
  const googleNeeded    = [];

  for (const raw of [displayFont, bodyFont]) {
    const name = raw?.split("'")[1] || raw?.split('"')[1] || '';
    if (FONTSHARE[name]) fontshareNeeded.push({ name, slug: FONTSHARE[name] });
    else if (GOOGLE[name]) googleNeeded.push({ name, query: GOOGLE[name] });
  }

  if (fontshareNeeded.length) {
    const params = fontshareNeeded.map(f => `f[]=${f.slug}`).join('&');
    links.push({
      type: 'fontshare',
      name: fontshareNeeded.map(f => f.name).join(' + '),
      href: `https://api.fontshare.com/v2/css?${params}&display=swap`,
    });
  }

  if (googleNeeded.length) {
    const params = googleNeeded.map(f => f.query).join('&');
    links.push({
      type: 'google',
      name: googleNeeded.map(f => f.name).join(' + '),
      href: `https://fonts.googleapis.com/css2?${params}&display=swap`,
    });
  }

  return links;
}

/**
 * Baut den vollständigen tokens.css String.
 */
function buildCss(light, dark, fontLinks, preset, presetId) {
  const now = new Date().toISOString().split('T')[0];

  // CSS-Property-Name: token_key → --token-key
  const toProp = (key) => `--${key.replace(/_/g, '-')}`;

  // Tokens als CSS Custom Properties serialisieren
  const serializeTokens = (tokens, indent = '  ') =>
    Object.entries(tokens)
      .map(([k, v]) => `${indent}${toProp(k)}: ${v};`)
      .join('\n');

  // Font-@import Zeilen
  const fontshareLinks = fontLinks.filter(f => f.type === 'fontshare');
  const googleLinks    = fontLinks.filter(f => f.type === 'google');

  const googleImports = googleLinks.length
    ? `/* Google Fonts — Preconnect via partials/head.hbs */\n` +
      googleLinks.map(f => `@import url('${f.href}');`).join('\n')
    : '';

  const fontshareImports = fontshareLinks.length
    ? fontshareLinks.map(f => `@import url('${f.href}');`).join('\n')
    : '';

  // Welche Tokens gehören in dark mode (nur Farben + Shadows)
  const darkEntries = Object.entries(dark)
    .filter(([k]) => k.startsWith('color_') || k.startsWith('shadow_'));

  const darkCss = darkEntries
    .map(([k, v]) => `  ${toProp(k)}: ${v};`)
    .join('\n');

  return `/*
 * tokens.css — inFactory Generated
 * ─────────────────────────────────────────────────
 * Preset:    ${preset.name || 'base'} (${presetId})
 * Generated: ${now} by inFactory CLI v0.2
 *
 * ⚠  NICHT MANUELL BEARBEITEN.
 *    Tokens ändern → preset.yaml → infactory tokens --preset=${presetId}
 * ─────────────────────────────────────────────────
 */

/* ── Font Imports ──────────────────────────────────────────────── */
${fontshareImports}
${googleImports}

/* ── Light Mode (Default) ──────────────────────────────────────── */
:root,
[data-theme="light"] {
${serializeTokens(light)}
}

/* ── Dark Mode ─────────────────────────────────────────────────── */
[data-theme="dark"] {
${darkCss}
}

/* ── System Preference Fallback ────────────────────────────────── */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
${darkCss.replace(/^  /gm, '    ')}
  }
}

/* ── Ghost Accent Color (optional) ───────────────────────────── */
/* Falls Ghost Admin eine Accent Color setzt, ist sie via          */
/* var(--ghost-accent-color) verfügbar. Theme nutzt eigene Tokens. */
`;
}

module.exports = { generateTokens, BASE_TOKENS, DARK_TOKENS, PRESET_DEFAULTS };
