/**
 * lib/tokens.ts — Design-Token-Pipeline für inFactory CLI
 *
 * TypeScript-Port von infactory-cli/src/generate-tokens.js (CLI-M5.2).
 *
 * Scope:
 *   - Base Design Tokens (Nexus Palette + inFactory Defaults)
 *   - Dark Mode Overrides
 *   - Preset-spezifische Overrides (agency/saas/blog/studio)
 *   - Token-Flattening aus verschachteltem Preset-YAML
 *   - Font-CDN-Link-Ableitung (Fontshare + Google Fonts)
 *   - tokens.css Generation
 *
 * Error-Semantik: Build ist all-or-nothing → `throw BuildError` bei Fehlern.
 * Warnings sind nicht vorgesehen (Token-Layer hat keine non-fatal Fehler).
 *
 * Determinismus: `buildTokensCss(…, now?)` akzeptiert optionales Date für
 * reproduzierbare Snapshots in Tests. Ohne `now` wird `new Date()` verwendet.
 *
 * camelcase ESLint: dieses Modul arbeitet mit CSS-Custom-Property-Namen
 * (`color_primary` → `--color-primary`) als externer Vertrag. File-level
 * disable vermeidet hunderte von eslint-disable-next-line Kommentaren.
 */
/* eslint-disable camelcase */

import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'

import {BuildError} from './build-error.js'
import {loadYamlFile, type Preset} from './yaml.js'

// ── Base Design Tokens (Nexus Palette + inFactory Defaults) ──────────────────

const BASE_TOKENS: Record<string, string> = {
  color_bg:               '#f7f6f2',
  color_border:           '#d4d1ca',
  color_divider:          '#dcd9d5',
  color_error:            '#a12c7b',
  color_primary:          '#01696f',
  color_primary_active:   '#0f3638',
  color_primary_highlight: '#cedcd8',
  color_primary_hover:    '#0c4e54',
  color_success:          '#437a22',
  color_surface:          '#f9f8f5',
  color_surface_2:        '#fbfbf9',
  color_surface_dynamic:  '#e6e4df',
  color_surface_offset:   '#f3f0ec',
  color_surface_offset_2: '#edeae5',
  color_text:             '#28251d',
  color_text_faint:       '#bab9b4',
  color_text_inverse:     '#f9f8f4',
  color_text_muted:       '#7a7974',
  color_warning:          '#964219',

  content_default: '960px',
  content_narrow:  '640px',
  content_wide:    '1200px',
  font_body:       "'Satoshi', 'Inter', sans-serif",
  font_display:    "'Cabinet Grotesk', 'Georgia', serif",

  radius_full: '9999px',
  radius_lg:   '0.75rem',
  radius_md:   '0.5rem',
  radius_sm:   '0.375rem',
  radius_xl:   '1rem',

  shadow_lg: '0 12px 32px oklch(0.2 0.01 80 / 0.12)',
  shadow_md: '0 4px 12px oklch(0.2 0.01 80 / 0.08)',
  shadow_sm: '0 1px 2px oklch(0.2 0.01 80 / 0.06)',

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

  text_2xl:  'clamp(2rem, 1.2rem + 2.5vw, 3.5rem)',
  text_3xl:  'clamp(2.5rem, 1rem + 4vw, 5rem)',
  text_base: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)',
  text_hero: 'clamp(3rem, 0.5rem + 7vw, 8rem)',
  text_lg:   'clamp(1.125rem, 1rem + 0.75vw, 1.5rem)',
  text_sm:   'clamp(0.875rem, 0.8rem + 0.35vw, 1rem)',
  text_xl:   'clamp(1.5rem, 1.2rem + 1.25vw, 2.25rem)',
  text_xs:   'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',

  transition_interactive: '180ms cubic-bezier(0.16, 1, 0.3, 1)',
}

// ── Dark Mode Overrides ───────────────────────────────────────────────────────

const DARK_TOKENS: Record<string, string> = {
  color_bg:                '#171614',
  color_border:            '#393836',
  color_divider:           '#262523',
  color_error:             '#d163a7',
  color_primary:           '#4f98a3',
  color_primary_active:    '#1a626b',
  color_primary_highlight: '#313b3b',
  color_primary_hover:     '#227f8b',
  color_success:           '#6daa45',
  color_surface:           '#1c1b19',
  color_surface_2:         '#201f1d',
  color_surface_dynamic:   '#2d2c2a',
  color_surface_offset:    '#1d1c1a',
  color_surface_offset_2:  '#22211f',
  color_text:              '#cdccca',
  color_text_faint:        '#5a5957',
  color_text_inverse:      '#2b2a28',
  color_text_muted:        '#797876',
  color_warning:           '#bb653b',
  shadow_lg:               '0 12px 32px oklch(0 0 0 / 0.4)',
  shadow_md:               '0 4px 12px oklch(0 0 0 / 0.3)',
  shadow_sm:               '0 1px 2px oklch(0 0 0 / 0.2)',
}

// Preset-spezifische Primary-Farben im Dark Mode (auto-aufgehellt)
const PRESET_DARK_PRIMARY_MAP: Record<string, Record<string, string>> = {
  agency: {color_primary: '#7ec4cc', color_primary_active: '#3d96a0', color_primary_hover: '#5aadb6'},
  blog:   {color_primary: '#4f98a3', color_primary_active: '#1a626b', color_primary_hover: '#227f8b'},
  saas:   {color_primary: '#6daadf', color_primary_active: '#3474b0', color_primary_hover: '#4d8fc8'},
  studio: {color_primary: '#c49b6a', color_primary_active: '#8f6035', color_primary_hover: '#b07e4a'},
}

// Preset-spezifische Default-Overrides (vor preset.tokens applied)
const PRESET_DEFAULTS: Record<string, Record<string, string>> = {
  agency: {
    color_primary:       '#1a1a2e',
    color_primary_hover: '#16213e',
    font_body:           "'General Sans', 'Inter', sans-serif",
    font_display:        "'Clash Display', 'Georgia', serif",
  },
  blog: {
    color_primary:       '#01696f',
    color_primary_hover: '#0c4e54',
    font_body:           "'Work Sans', 'Helvetica Neue', sans-serif",
    font_display:        "'Instrument Serif', 'Georgia', serif",
  },
  saas: {
    color_primary:       '#2563eb',
    color_primary_hover: '#1d4ed8',
    font_body:           "'Satoshi', 'Inter', sans-serif",
    font_display:        "'Cabinet Grotesk', 'Georgia', serif",
  },
  studio: {
    color_primary:       '#8b5e3c',
    color_primary_hover: '#6e4a2e',
    font_body:           "'Satoshi', 'Inter', sans-serif",
    font_display:        "'Zodiak', 'Georgia', serif",
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FontLink {
  href: string
  name: string
  type: 'fontshare' | 'google'
}

export interface GenerateTokensOptions {
  /** Für reproduzierbare Snapshots (Tests). Default: new Date(). */
  now?: Date
  /** Ziel-CSS-Pfad. Wenn null → CSS wird nicht geschrieben, nur zurückgegeben. */
  outputCssPath: null | string
  /** Pfad zur Preset-YAML. Wenn null → nur BASE_TOKENS. */
  presetPath: null | string
  /** Verbose Logging an stdout. */
  verbose?: boolean
}

export interface GenerateTokensResult {
  css: string
  tokensCount: number
}

// ── Pure Functions (testbar) ──────────────────────────────────────────────────

/**
 * Flacht verschachtelte Preset-Token-Objekte auf:
 *   `{ color: { primary: '#x' } }` → `{ color_primary: '#x' }`
 *
 * Arrays bleiben unverändert als Value (werden zu String casten beim CSS-Schreiben).
 */
export function flattenTokens(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}_${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(flat, flattenTokens(v as Record<string, unknown>, key))
    } else {
      flat[key] = String(v)
    }
  }

  return flat
}

const FONTSHARE_MAP: Record<string, string> = {
  'Boska':           'boska@400,500,700',
  'Cabinet Grotesk': 'cabinet-grotesk@400,500,700',
  'Clash Display':   'clash-display@400,500,600,700',
  'General Sans':    'general-sans@400,500,600',
  'Satoshi':         'satoshi@300,400,500,700',
  'Zodiak':          'zodiak@400,500,700',
}

const GOOGLE_MAP: Record<string, string> = {
  'DM Sans':          'family=DM+Sans:wght@300..700',
  'Instrument Serif': 'family=Instrument+Serif:ital@0;1',
  'Work Sans':        'family=Work+Sans:wght@300..700',
}

/**
 * Extrahiert den ersten Font-Namen aus einer CSS font-family Deklaration.
 *
 * @example
 *   extractFontName("'Satoshi', 'Inter', sans-serif") → 'Satoshi'
 *   extractFontName('"Zodiak", serif') → 'Zodiak'
 *   extractFontName('sans-serif') → ''
 */
export function extractFontName(fontFamily: string): string {
  const single = fontFamily.split("'")
  if (single.length >= 3 && single[1]) return single[1]
  const double = fontFamily.split('"')
  if (double.length >= 3 && double[1]) return double[1]
  return ''
}

/**
 * Leitet Font-CDN-Links aus display- + body-Font-Namen ab.
 * Fonts die weder in FONTSHARE_MAP noch GOOGLE_MAP stehen werden ignoriert.
 */
export function deriveFontLinks(displayFont: string, bodyFont: string): FontLink[] {
  const fontshareNeeded: Array<{name: string; slug: string}> = []
  const googleNeeded: Array<{name: string; query: string}> = []

  for (const raw of [displayFont, bodyFont]) {
    const name = extractFontName(raw)
    if (!name) continue
    if (FONTSHARE_MAP[name]) fontshareNeeded.push({name, slug: FONTSHARE_MAP[name]})
    else if (GOOGLE_MAP[name]) googleNeeded.push({name, query: GOOGLE_MAP[name]})
  }

  const links: FontLink[] = []

  if (fontshareNeeded.length > 0) {
    const params = fontshareNeeded.map((f) => `f[]=${f.slug}`).join('&')
    links.push({
      href: `https://api.fontshare.com/v2/css?${params}&display=swap`,
      name: fontshareNeeded.map((f) => f.name).join(' + '),
      type: 'fontshare',
    })
  }

  if (googleNeeded.length > 0) {
    const params = googleNeeded.map((f) => f.query).join('&')
    links.push({
      href: `https://fonts.googleapis.com/css2?${params}&display=swap`,
      name: googleNeeded.map((f) => f.name).join(' + '),
      type: 'google',
    })
  }

  return links
}

/**
 * Baut den vollständigen tokens.css String aus aufgelösten Token-Maps.
 *
 * @param light     — aufgelöste Light-Mode Tokens
 * @param dark      — aufgelöste Dark-Mode Tokens (nur color_/shadow_ werden emittiert)
 * @param fontLinks — Fontshare/Google-Links für @import
 * @param preset    — Preset-Metadaten für Header-Kommentar
 * @param now       — für deterministische Snapshots (Default: new Date())
 */
export interface BuildTokensCssOptions {
  dark: Record<string, string>
  fontLinks: FontLink[]
  light: Record<string, string>
  /** Für reproduzierbare Snapshots (Tests). Default: new Date(). */
  now?: Date
  preset: {id: string; name?: string}
}

/** Wandelt Token-Key (`color_primary`) in CSS-Property-Name (`--color-primary`). */
function toCssProp(key: string): string {
  return `--${key.replaceAll('_', '-')}`
}

function serializeTokens(tokens: Record<string, string>, indent = '  '): string {
  return Object.entries(tokens)
    .map(([k, v]) => `${indent}${toCssProp(k)}: ${v};`)
    .join('\n')
}

export function buildTokensCss(options: BuildTokensCssOptions): string {
  const {dark, fontLinks, light, now = new Date(), preset} = options
  const today = now.toISOString().split('T')[0]

  const fontshareLinks = fontLinks.filter((f) => f.type === 'fontshare')
  const googleLinks = fontLinks.filter((f) => f.type === 'google')

  const fontshareImports = fontshareLinks.length > 0
    ? fontshareLinks.map((f) => `@import url('${f.href}');`).join('\n')
    : ''

  const googleImports = googleLinks.length > 0
    ? `/* Google Fonts — Preconnect via partials/head.hbs */\n`
      + googleLinks.map((f) => `@import url('${f.href}');`).join('\n')
    : ''

  const darkEntries = Object.entries(dark)
    .filter(([k]) => k.startsWith('color_') || k.startsWith('shadow_'))

  const darkCss = darkEntries
    .map(([k, v]) => `  ${toCssProp(k)}: ${v};`)
    .join('\n')

  return `/*
 * tokens.css — inFactory Generated
 * ─────────────────────────────────────────────────
 * Preset:    ${preset.name ?? 'base'} (${preset.id})
 * Generated: ${today} by inFactory CLI v2 (CLI-M5.2)
 *
 * ⚠  NICHT MANUELL BEARBEITEN.
 *    Tokens ändern → preset.yaml → infactory build --preset=${preset.id}
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
${darkCss.replaceAll(/^ {2}/gm, '    ')}
  }
}

/* ── Ghost Accent Color (optional) ───────────────────────────── */
/* Falls Ghost Admin eine Accent Color setzt, ist sie via          */
/* var(--ghost-accent-color) verfügbar. Theme nutzt eigene Tokens. */
`
}

/**
 * Löst die vollständige Token-Map für ein Preset auf.
 * Priorität: preset.tokens > PRESET_DEFAULTS[id] > BASE_TOKENS.
 */
export function resolveTokens(preset: Preset): {
  dark: Record<string, string>
  fontLinks: FontLink[]
  light: Record<string, string>
} {
  const presetId = preset.id || 'base'
  const presetDefaults = PRESET_DEFAULTS[presetId] ?? {}
  const presetOverrides = flattenTokens(preset.tokens ?? {})
  const light = {...BASE_TOKENS, ...presetDefaults, ...presetOverrides}

  const darkPrimary = PRESET_DARK_PRIMARY_MAP[presetId] ?? {}
  const dark = {...DARK_TOKENS, ...darkPrimary}

  const fontLinks = deriveFontLinks(light.font_display, light.font_body)

  return {dark, fontLinks, light}
}

// ── I/O-Wrapper ───────────────────────────────────────────────────────────────

/**
 * Generiert tokens.css aus Preset-YAML und schreibt (optional) in Datei.
 *
 * @throws BuildError bei fehlender/kaputter Preset-Datei.
 */
export function generateTokens(opts: GenerateTokensOptions): GenerateTokensResult {
  const {outputCssPath, presetPath, verbose = false} = opts
  const log = verbose ? (m: string) => console.log(`  ${m}`) : () => {}

  let preset: Preset = {id: 'base'}
  if (presetPath) {
    if (!existsSync(presetPath)) {
      throw new BuildError(`Preset nicht gefunden: ${presetPath}`)
    }

    preset = loadYamlFile<Preset>(presetPath)
    log(`Preset: ${preset.name ?? ''} (${preset.id})`)
  }

  const {dark, fontLinks, light} = resolveTokens(preset)

  if (fontLinks.length > 0) {
    log(`Fonts: ${fontLinks.map((f) => f.name).join(', ')}`)
  }

  const css = buildTokensCss({dark, fontLinks, light, now: opts.now, preset})

  if (outputCssPath) {
    mkdirSync(dirname(outputCssPath), {recursive: true})
    writeFileSync(outputCssPath, css, 'utf8')
    log(`✔ tokens.css → ${outputCssPath}`)
  }

  return {css, tokensCount: Object.keys(light).length}
}
