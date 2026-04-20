/**
 * lib/sections.ts — Section-Composer für inFactory CLI
 *
 * TypeScript-Port von infactory-cli/src/compose-sections.js (CLI-M5.2).
 *
 * Scope:
 *   - Registry laden + als ID-Map aufbauen
 *   - Preset-Layout validieren (home[])
 *   - Section-Partials aus base-theme kopieren (inkl. Placeholder-Fallback)
 *   - home.hbs generieren
 *   - index.hbs Fallback sicherstellen
 *
 * Error-Semantik:
 *   - fatal (throw BuildError): fehlende/kaputte Preset/Registry, leeres Layout
 *   - non-fatal (warnings[]): unbekannte Section-ID, fehlender Partial → Placeholder
 */

import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

import {BuildError} from './build-error.js'
import {loadYamlFile, type Preset} from './yaml.js'

function warnUser(message: string): void {
  console.warn(`  ⚠  ${message}`)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Section {
  category: string
  description?: string
  ghost_helpers?: string[]
  id: string
  implemented?: boolean
  label: string
  partial: string
  presets?: string[]
  schema?: string
}

export interface SectionsRegistry {
  categories?: Record<string, {icon?: string; label?: string}>
  sections: Section[]
  version?: string
}

export interface ComposeSectionsOptions {
  baseThemeDir: string
  /** Für deterministische Snapshots (Tests). Default: new Date(). */
  now?: Date
  outputDir: string
  presetPath: string
  registryPath: string
  verbose?: boolean
}

export interface ComposeSectionsResult {
  homePath: string
  ok: boolean
  /** Section-IDs in Layout-Reihenfolge, Placeholder inklusive. */
  sections: string[]
  warnings: string[]
}

// ── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Erzeugt den home.hbs Inhalt aus Preset + geordneten Sections.
 */
export function generateHomeHbs(
  preset: {id: string; name?: string},
  sections: Section[],
  now: Date = new Date(),
): string {
  const today = now.toISOString().split('T')[0]

  const sectionIncludes = sections
    .map((s) => {
      const partialPath = s.partial.replace(/\.hbs$/, '')
      return [
        `  {{!-- ── ${s.label} ─────────────────────────── --}}`,
        `  {{> "${partialPath}"}}`,
      ].join('\n')
    })
    .join('\n\n')

  return `{{!--
  home.hbs — inFactory Generated
  ─────────────────────────────────────────────────
  Preset:    ${preset.name ?? preset.id} (${preset.id})
  Sections:  ${sections.map((s) => s.id).join(', ')}
  Generated: ${today} by inFactory CLI v2 (CLI-M5.2)

  ⚠  NICHT MANUELL BEARBEITEN.
     Änderungen am Layout → preset.yaml → infactory build
  ─────────────────────────────────────────────────
--}}

{{!< default}}

${sectionIncludes}
`
}

/**
 * Erzeugt einen Placeholder-HBS für noch nicht implementierte Sections.
 * Wird geschrieben wenn der Section-Partial im base-theme fehlt.
 */
export function generatePlaceholderPartial(section: Section): string {
  const helpers = (section.ghost_helpers ?? []).join(', ') || 'keine'
  const description = section.description ?? ''
  return `{{!--
  ${section.partial} — PLACEHOLDER
  Section: ${section.label}
  Beschreibung: ${description}
  TODO: Diesen Placeholder mit echtem .hbs ersetzen.
  Ghost Helpers: ${helpers}
--}}
<section class="s-placeholder" aria-label="${section.label} (Placeholder)" style="padding:4rem 1rem;text-align:center;background:var(--color-surface-offset);color:var(--color-text-muted);">
  <p style="font-family:monospace;font-size:0.875rem;">
    [inFactory] Section Placeholder: <strong>${section.id}</strong><br>
    ${description}
  </p>
</section>
`
}

/**
 * Baut eine ID-Map aus der Sections-Registry für O(1) Lookup.
 */
export function indexRegistry(registry: SectionsRegistry): Record<string, Section> {
  const map: Record<string, Section> = {}
  for (const s of registry.sections) map[s.id] = s
  return map
}

// ── I/O-Wrapper ───────────────────────────────────────────────────────────────

function loadRegistry(registryPath: string): SectionsRegistry {
  if (!existsSync(registryPath)) {
    throw new BuildError(`Registry nicht gefunden: ${registryPath}`)
  }

  try {
    return JSON.parse(readFileSync(registryPath, 'utf8')) as SectionsRegistry
  } catch (error) {
    throw new BuildError(`Registry-JSON-Parse-Fehler in ${registryPath}: ${(error as Error).message}`)
  }
}

/**
 * Setzt home.hbs + Section-Partials aus Preset-Layout zusammen.
 *
 * @throws BuildError bei fehlender Preset/Registry oder leerem Layout.
 */
export function composeSections(opts: ComposeSectionsOptions): ComposeSectionsResult {
  const {baseThemeDir, outputDir, presetPath, registryPath, verbose = false} = opts
  const log = verbose ? (m: string) => console.log(`  ${m}`) : () => {}

  if (!existsSync(presetPath)) {
    throw new BuildError(`Preset nicht gefunden: ${presetPath}`)
  }

  const preset = loadYamlFile<Preset>(presetPath)
  const registry = loadRegistry(registryPath)
  const sectionMap = indexRegistry(registry)

  log(`Preset:   ${preset.name ?? ''} (${preset.id})`)
  log(`Registry: ${registry.sections.length} Sections verfügbar`)

  const layout = preset.layout?.home
  if (!Array.isArray(layout) || layout.length === 0) {
    throw new BuildError(`preset.yaml enthält kein gültiges layout.home Array`)
  }

  const warnings: string[] = []
  const validSections: Section[] = []

  for (const sectionId of layout) {
    const section = sectionMap[sectionId]
    if (!section) {
      warnUser(`Section '${sectionId}' nicht in Registry — wird übersprungen`)
      warnings.push(`Unbekannte Section: ${sectionId}`)
      continue
    }

    validSections.push(section)
    log(`✔ Section: ${sectionId}`)
  }

  if (validSections.length === 0) {
    throw new BuildError('Keine gültigen Sections im Preset-Layout gefunden')
  }

  // Output-Struktur anlegen
  const partialsRoot = join(outputDir, 'partials', 'sections')
  mkdirSync(partialsRoot, {recursive: true})

  const categories = [...new Set(validSections.map((s) => s.category))]
  for (const cat of categories) {
    mkdirSync(join(partialsRoot, cat), {recursive: true})
  }

  // Partials kopieren (oder Placeholder schreiben)
  const composedSections: Section[] = []

  for (const section of validSections) {
    const srcFile = join(baseThemeDir, section.partial)
    const dstFile = join(outputDir, 'partials', section.partial)

    mkdirSync(dirname(dstFile), {recursive: true})

    if (existsSync(srcFile)) {
      copyFileSync(srcFile, dstFile)
      log(`  → kopiert: ${section.partial}`)
    } else {
      writeFileSync(dstFile, generatePlaceholderPartial(section), 'utf8')
      warnUser(`Placeholder erzeugt für: ${section.id} (${srcFile} nicht gefunden)`)
      warnings.push(`Placeholder: ${section.id}`)
    }

    composedSections.push(section)
  }

  // home.hbs generieren
  const homePath = join(outputDir, 'home.hbs')
  writeFileSync(homePath, generateHomeHbs(preset, composedSections, opts.now), 'utf8')
  log(`✔ home.hbs generiert (${composedSections.length} Sections)`)

  // index.hbs Fallback
  const indexPath = join(outputDir, 'index.hbs')
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, '{{!> home}}\n', 'utf8')
    log(`✔ index.hbs Fallback erzeugt`)
  }

  return {
    homePath,
    ok: warnings.length === 0,
    sections: composedSections.map((s) => s.id),
    warnings,
  }
}
