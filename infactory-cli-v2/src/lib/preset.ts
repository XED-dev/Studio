/**
 * lib/preset.ts — Preset-Verwaltung: clone/list/remove (CLI-M5.6)
 *
 * TypeScript-Port von infactory-cli/src/preset-clone.js.
 *
 * Drei Operationen:
 *   - clonePreset()  — fork eines bestehenden Presets mit optionalen Overrides
 *                      (Farbe, Fonts, Layout, Beschreibung)
 *   - listPresetDetails() — Details aller Presets (Name, Sections, Origin)
 *   - removePreset() — Preset-Datei löschen (mit --force-Schutz)
 *
 * Pure Helpers (testbar):
 *   - toSlug, toTitleCase, isValidHex, darken
 *   - applyTokenOverrides (color/font-Overrides ins Preset-Objekt mergen)
 *   - validateSectionList (gegen registry.json)
 *
 * Naming-Note: `listPresets` existiert bereits in `lib/build.ts` als simple
 * String-ID-Liste. Hier `listPresetDetails` mit YAML-Parsing für Anzeige.
 *
 * camelcase ESLint: Preset-YAML-Felder folgen externem Schema (snake_case
 * für `_cloned_from`/`_cloned_at` + Token-Properties wie `primary_hover`).
 * File-level disable vermeidet inline-noise.
 */
/* eslint-disable camelcase */

import {dump as dumpYaml, load as loadYaml} from 'js-yaml'
import {existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {PresetError} from './preset-error.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PresetTokens {
  [k: string]: unknown
  color?: {
    primary?: string
    primary_active?: string
    primary_hover?: string
  }
  font?: {
    body?: string
    display?: string
  }
}

export interface Preset {
  [k: string]: unknown
  _cloned_at?: string
  _cloned_from?: string
  description?: string
  icon?: string
  id: string
  layout?: {
    home?: string[]
  }
  name?: string
  tokens?: PresetTokens
}

export interface ClonePresetOptions {
  color?: null | string
  description?: null | string
  fontBody?: null | string
  fontDisplay?: null | string
  name: string
  /** Deterministischer Timestamp für `_cloned_at` (Tests). */
  now?: Date
  presetsDir: string
  registryPath?: null | string
  sections?: null | string
  sourceId: string
}

export interface ClonePresetResult {
  cloned: Preset
  newId: string
  presetPath: string
}

export interface PresetSummary {
  clonedFrom?: string
  icon: string
  id: string
  name: string
  sections: number
}

// ── Pure Helpers (testbar) ────────────────────────────────────────────────────

const UMLAUT_MAP: Record<string, string> = {
  'ä': 'ae',
  'Ä': 'ae',
  'ö': 'oe',
  'Ö': 'oe',
  'ß': 'ss',
  'ü': 'ue',
  'Ü': 'ue',
}

/**
 * Konvertiert einen Namen in einen Slug (kebab-case, ASCII).
 * Umlaute werden transliteriert (ä → ae). Sonstige Sonderzeichen → "-".
 * Mehrfache Bindestriche werden kollabiert, leading/trailing entfernt.
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[äöüÄÖÜß]/g, (c) => UMLAUT_MAP[c] ?? c)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

/**
 * Konvertiert kebab/snake → Title Case.
 * `recode-blog` → `Recode Blog`.
 */
export function toTitleCase(input: string): string {
  return input
    .replaceAll(/[-_]+/g, ' ')
    .replaceAll(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Validiert Hex-Farben: #RGB oder #RRGGBB.
 */
export function isValidHex(color: string): boolean {
  return /^#([\da-f]{3}|[\da-f]{6})$/i.test(color)
}

/**
 * Hex-Farbe um einen Faktor abdunkeln.
 *
 * @param hex `#RRGGBB` oder `#RGB` (wird auf `#RRGGBB` expandiert)
 * @param amount 0.0–1.0 (z.B. 0.15 = 15% dunkler)
 */
export function darken(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? [...clean].map((c) => c + c).join('')
    : clean

  const channel = (start: number): string => {
    const value = Number.parseInt(full.slice(start, start + 2), 16)
    const dim = Math.max(0, Math.round(value * (1 - amount)))
    return dim.toString(16).padStart(2, '0')
  }

  return `#${channel(0)}${channel(2)}${channel(4)}`
}

/**
 * Tiefes Klonen. Reicht für Preset-YAMLs (kein Date, keine Functions, keine Symbols).
 */
export function deepClone<T>(value: T): T {
  return structuredClone(value)
}

/**
 * Wendet die optionalen Override-Flags auf ein Preset an (mutiert das übergebene
 * Objekt — Caller sollte zuerst deepClone aufrufen).
 *
 * @throws PresetError bei ungültigem Hex.
 */
export function applyTokenOverrides(preset: Preset, opts: {
  color?: null | string
  description?: null | string
  fontBody?: null | string
  fontDisplay?: null | string
}): void {
  if (!preset.tokens) preset.tokens = {}
  if (!preset.tokens.color) preset.tokens.color = {}
  if (!preset.tokens.font) preset.tokens.font = {}

  if (opts.color) {
    if (!isValidHex(opts.color)) {
      throw new PresetError(`Ungültige Farbe: "${opts.color}" — erwartet #RRGGBB oder #RGB`)
    }

    preset.tokens.color.primary = opts.color
    preset.tokens.color.primary_hover = darken(opts.color, 0.15)
    preset.tokens.color.primary_active = darken(opts.color, 0.3)
  }

  if (opts.fontDisplay) preset.tokens.font.display = opts.fontDisplay
  if (opts.fontBody) preset.tokens.font.body = opts.fontBody
  if (opts.description) preset.description = opts.description
}

/**
 * Parst eine Comma-Liste von Section-IDs und validiert gegen die Registry.
 *
 * @throws PresetError wenn unbekannte Section-IDs vorhanden sind.
 */
export function validateSectionList(input: string, registryPath?: null | string): string[] {
  const sectionList = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  if (sectionList.length === 0) {
    throw new PresetError('--sections leer oder nur Whitespace')
  }

  if (registryPath && existsSync(registryPath)) {
    let registry: {sections?: Array<{id: string}>}
    try {
      registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {sections?: Array<{id: string}>}
    } catch (error) {
      throw new PresetError(`registry.json konnte nicht geparst werden: ${(error as Error).message}`)
    }

    const knownIds = new Set((registry.sections ?? []).map((s) => s.id))
    const unknown = sectionList.filter((id) => !knownIds.has(id))
    if (unknown.length > 0) {
      throw new PresetError(
        `Unbekannte Section-IDs: ${unknown.join(', ')}\n  Verfügbar: ${[...knownIds].join(', ')}`,
      )
    }
  }

  return sectionList
}

/**
 * Listet Preset-IDs (Dateinamen ohne Extension) im Verzeichnis.
 * Sortiert alphabetisch. Leeres Array wenn Verzeichnis fehlt.
 */
export function listPresetIds(presetsDir: string): string[] {
  if (!existsSync(presetsDir)) return []
  return readdirSync(presetsDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => f.replace(/\.ya?ml$/, ''))
    .sort()
}

// ── Pipeline-Funktionen ───────────────────────────────────────────────────────

/**
 * Klont ein Preset mit optionalen Overrides.
 *
 * @throws PresetError bei fehlender Source, Konflikt mit existierendem
 *         Ziel oder ungültigen Overrides (Farbe, Sections).
 */
export function clonePreset(opts: ClonePresetOptions): ClonePresetResult {
  const {name, presetsDir, sourceId} = opts

  if (!sourceId) {
    throw new PresetError('Quell-Preset fehlt. Beispiel: infactory preset clone blog --name=mein-blog')
  }

  if (!name) {
    throw new PresetError('--name fehlt. Beispiel: infactory preset clone blog --name=mein-blog')
  }

  const newId = toSlug(name)
  if (!newId) throw new PresetError(`Ungültiger Name: "${name}" — Slug wäre leer`)

  const srcPath = join(presetsDir, `${sourceId}.yaml`)
  if (!existsSync(srcPath)) {
    const available = listPresetIds(presetsDir)
    const hint = available.length > 0
      ? `\n  Verfügbar: ${available.join(', ')}`
      : '\n  Keine Presets im Verzeichnis.'
    throw new PresetError(`Quell-Preset "${sourceId}" nicht gefunden.${hint}`)
  }

  const dstPath = join(presetsDir, `${newId}.yaml`)
  if (existsSync(dstPath)) {
    throw new PresetError(`Preset "${newId}" existiert bereits: ${dstPath}\n  Wähle einen anderen Namen.`)
  }

  // Source laden + tief kopieren + Overrides
  const source = loadYaml(readFileSync(srcPath, 'utf8')) as Preset
  const cloned = deepClone(source)
  cloned.id = newId
  cloned.name = toTitleCase(name)

  applyTokenOverrides(cloned, {
    color: opts.color,
    description: opts.description,
    fontBody: opts.fontBody,
    fontDisplay: opts.fontDisplay,
  })

  if (opts.sections) {
    const sectionList = validateSectionList(opts.sections, opts.registryPath)
    if (!cloned.layout) cloned.layout = {}
    cloned.layout.home = sectionList
  }

  // Herkunft dokumentieren
  cloned._cloned_from = sourceId
  cloned._cloned_at = (opts.now ?? new Date()).toISOString()

  // Schreiben
  const output = dumpYaml(cloned, {
    forceQuotes: false,
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
  })
  writeFileSync(dstPath, output, 'utf8')

  return {cloned, newId, presetPath: dstPath}
}

/**
 * Listet alle Presets mit Metadaten (Name, Sections-Zähler, Klon-Origin).
 * Robust gegen kaputte YAML-Dateien — die werden mit minimaler Info gezeigt.
 */
export function listPresetDetails(presetsDir: string): PresetSummary[] {
  return listPresetIds(presetsDir).map((id) => {
    try {
      const data = loadYaml(readFileSync(join(presetsDir, `${id}.yaml`), 'utf8')) as Preset
      return {
        clonedFrom: data._cloned_from,
        icon: data.icon ?? '•',
        id,
        name: data.name ?? id,
        sections: data.layout?.home?.length ?? 0,
      }
    } catch {
      return {icon: '•', id, name: id, sections: 0}
    }
  })
}

export interface RemovePresetOptions {
  force?: boolean
  presetId: string
  presetsDir: string
}

export interface RemovePresetResult {
  ok: boolean
  presetPath: string
  reason?: 'needs_force' | 'removed'
}

/**
 * Löscht ein Preset.
 *
 * **WICHTIG (Sicherheit):** Ohne `force=true` wird NICHT gelöscht — stattdessen
 * Hinweis zurückgegeben. Der DevOps-Caller bestätigt explizit mit `--force`.
 * Diese Mechanik gibt es genau weil die Workstation eine harte No-Deletion-
 * Regel für AI-Agenten hat (siehe ~/.claude/CLAUDE.md): die CLI-Funktion
 * darf existieren und vom Human DevOps explizit ausgelöst werden.
 *
 * @throws PresetError wenn das Preset nicht existiert.
 */
export function removePreset(opts: RemovePresetOptions): RemovePresetResult {
  const {force = false, presetId, presetsDir} = opts
  const presetPath = join(presetsDir, `${presetId}.yaml`)

  if (!existsSync(presetPath)) {
    throw new PresetError(`Preset "${presetId}" nicht gefunden: ${presetPath}`)
  }

  if (!force) {
    return {ok: false, presetPath, reason: 'needs_force'}
  }

  unlinkSync(presetPath)
  return {ok: true, presetPath, reason: 'removed'}
}
