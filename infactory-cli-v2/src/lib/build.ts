/**
 * lib/build.ts — Ghost-Theme-Build-Pipeline für inFactory CLI
 *
 * TypeScript-Port von infactory-cli/src/build.js (CLI-M5.2).
 *
 * Pipeline-Schritte:
 *   1. Preset-YAML laden (`presetsDir/<preset>.yaml`)
 *   2. Output-Theme-Verzeichnis anlegen
 *   3. base-theme kopieren (ohne home.hbs/package.json/ai-analysis.json)
 *   4. tokens.css generieren (lib/tokens.ts)
 *   5. Sections composieren → home.hbs (lib/sections.ts)
 *   6. package.json schreiben
 *   7. ai-analysis.json Metadaten
 *   8. Optional: ZIP-Archiv (archiver)
 *
 * Error-Semantik: throws BuildError bei Fehler; BuildResult ist implizit
 * `ok: true` wenn die Funktion non-throw zurückkehrt. warnings[] enthält
 * non-fatale Meldungen (Placeholder-Partials, unbekannte Section-IDs).
 */

import archiver from 'archiver'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {join, resolve} from 'node:path'

import {BuildError} from './build-error.js'
import {resolveRegistryPath, resolveResourcePath} from './resolve-resources.js'
import {composeSections} from './sections.js'
import {generateTokens} from './tokens.js'
import {type GhostCustomItem, loadYamlFile, type Preset} from './yaml.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuildOptions {
  /** Pfad zu `base-theme/`. Wenn nicht gesetzt → Resolver (CWD → /opt/infactory/infactory-cli). */
  baseThemeDir?: string
  /** CWD-Override für Resolver (Tests). Default: process.cwd(). */
  cwd?: string
  /** Für deterministische Snapshots in Tests. Default: new Date(). */
  now?: Date
  /** Ausgabe-Basisverzeichnis. Theme-Dir wird `<outputDir>/infactory-<preset>/`. Default: `./dist`. */
  outputDir?: string
  /** Preset-ID (z.B. "agency", "saas"). Muss Datei `<presetsDir>/<preset>.yaml` haben. */
  preset: string
  /** Pfad zu `presets/`. Wenn nicht gesetzt → Resolver. */
  presetsDir?: string
  /** Pfad zu `sections/registry.json`. Wenn nicht gesetzt → Resolver. */
  registryPath?: string
  /** Nicht-strukturierte stdout-Meldungen ausgeben (statt nur strukturierte Events). */
  verbose?: boolean
  /** ZIP neben dem Theme-Verzeichnis erzeugen. */
  zip?: boolean
}

export interface BuildResult {
  /** Build-Dauer in Millisekunden (Command formatiert beim Logging). */
  elapsed: number
  /** Section-IDs in Reihenfolge des Preset-Layouts. */
  sections: string[]
  /** Pfad zum Theme-Verzeichnis. */
  themeDir: string
  /** Anzahl aufgelöster Design-Tokens (Light-Mode-Map). */
  tokensCount: number
  /** Non-fatale Warnungen aus der Compose-Phase. */
  warnings: string[]
  /** Pfad zum ZIP wenn `zip: true`, sonst null. */
  zipPath: null | string
}

// ── Pure Functions (testbar) ──────────────────────────────────────────────────

/**
 * Erzeugt `package.json` eines Ghost-Themes aus den Preset-Daten.
 *
 * image_sizes + card_assets sind Ghost-weite Defaults; custom wird aus
 * `preset.ghost.custom` abgeleitet.
 */
export function buildPackageJson(preset: Preset): Record<string, unknown> {
  const ghost = preset.ghost ?? {}
  return {
    author: {
      email: 'hello@infactory.com',
      name: 'inFactory CLI',
      url: 'https://infactory.com',
    },
    config: {
      // eslint-disable-next-line camelcase -- Ghost theme schema uses snake_case (external API).
      card_assets: true,
      custom: buildCustomSettings(ghost.custom ?? []),
      // eslint-disable-next-line camelcase -- Ghost theme schema uses snake_case (external API).
      image_sizes: {
        l:   {width: 1000},
        m:   {width: 600},
        s:   {width: 300},
        xl:  {width: 2000},
        xs:  {width: 100},
        xxs: {width: 30},
      },
      // eslint-disable-next-line camelcase -- Ghost theme schema uses snake_case (external API).
      posts_per_page: ghost.posts_per_page ?? 9,
    },
    description: preset.description ?? `inFactory Theme — ${preset.name ?? preset.id}`,
    engines: {ghost: '>=5.0.0'},
    license: 'MIT',
    name: `infactory-${preset.id}`,
    version: '1.0.0',
  }
}

/**
 * Mappt `preset.ghost.custom[]` → `package.json.config.custom` Record.
 * Ghost erwartet jedes Custom-Setting als Objekt mit type/default/description.
 */
export function buildCustomSettings(items: GhostCustomItem[]): Record<string, Record<string, unknown>> {
  const obj: Record<string, Record<string, unknown>> = {}
  for (const item of items) {
    if (!item.key) continue
    const entry: Record<string, unknown> = {
      default: item.default ?? '',
      description: item.description ?? item.key,
      type: item.type ?? 'text',
    }
    if (item.options) entry.options = item.options
    obj[item.key] = entry
  }

  return obj
}

/**
 * Listet verfügbare Preset-IDs (Dateinamen ohne Extension) im Presets-Verzeichnis.
 * Gibt leeres Array zurück wenn Verzeichnis fehlt.
 */
export function listPresets(presetsDir: string): string[] {
  if (!existsSync(presetsDir)) return []
  return readdirSync(presetsDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => f.replace(/\.ya?ml$/, ''))
    .sort()
}

// ── I/O-Helper ────────────────────────────────────────────────────────────────

const COPY_EXCLUDES = new Set(['ai-analysis.json', 'home.hbs', 'package.json'])

function copyDirRecursive(src: string, dst: string, excludes: Set<string>): void {
  mkdirSync(dst, {recursive: true})
  for (const entry of readdirSync(src)) {
    if (excludes.has(entry)) continue
    const srcPath = join(src, entry)
    const dstPath = join(dst, entry)
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, dstPath, excludes)
    } else {
      copyFileSync(srcPath, dstPath)
    }
  }
}

function createZip(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((done, fail) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', {zlib: {level: 9}})
    output.on('close', () => {
      done()
    })
    archive.on('error', (err) => {
      fail(err)
    })
    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Baut ein Ghost-Theme aus dem angegebenen Preset.
 *
 * @throws BuildError bei fehlender Preset/Registry/Layout-Problemen.
 */
export async function buildTheme(opts: BuildOptions): Promise<BuildResult> {
  const {
    cwd = process.cwd(),
    outputDir = resolve('./dist'),
    preset,
    verbose = false,
    zip = false,
  } = opts
  const log = verbose ? (m: string) => console.log(m) : () => {}

  const startTime = Date.now()

  // Ressourcen-Resolver: CLI-Flags gewinnen, sonst CWD → /opt/infactory/infactory-cli.
  const presetsDir = resolveResourcePath(opts.presetsDir, 'presets', {cwd})
  const baseThemeDir = resolveResourcePath(opts.baseThemeDir, 'base-theme', {cwd})
  const registryPath = resolveRegistryPath(opts.registryPath, {cwd})

  // 1. Preset-Datei finden
  const presetPath = join(presetsDir, `${preset}.yaml`)
  if (!existsSync(presetPath)) {
    const available = listPresets(presetsDir)
    const hint = available.length > 0 ? `\n  Verfügbar: ${available.join(', ')}` : ''
    throw new BuildError(`Preset nicht gefunden: ${presetPath}${hint}`)
  }

  const presetData = loadYamlFile<Preset>(presetPath)
  log(`  ✔ Preset geladen: ${presetData.name ?? presetData.id}`)

  // 2. Output-Verzeichnis
  const themeDir = join(outputDir, `infactory-${preset}`)
  mkdirSync(themeDir, {recursive: true})
  log(`  ✔ Output: ${themeDir}`)

  // 3. base-theme kopieren
  if (existsSync(baseThemeDir)) {
    copyDirRecursive(baseThemeDir, themeDir, COPY_EXCLUDES)
    log(`  ✔ base-theme kopiert`)
  } else {
    log(`  ⚠  base-theme nicht gefunden: ${baseThemeDir} — übersprungen`)
  }

  // 4. tokens.css
  const tokensResult = generateTokens({
    now: opts.now,
    outputCssPath: join(themeDir, 'assets', 'css', 'tokens.css'),
    presetPath,
    verbose,
  })

  // 5. Sections → home.hbs
  const composeResult = composeSections({
    baseThemeDir,
    now: opts.now,
    outputDir: themeDir,
    presetPath,
    registryPath,
    verbose,
  })

  // 6. package.json
  const pkg = buildPackageJson(presetData)
  writeFileSync(join(themeDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')

  // 7. ai-analysis.json Metadaten
  const analysisTimestamp = (opts.now ?? new Date()).toISOString()
  const analysis = {
    // eslint-disable-next-line camelcase -- ai-analysis.json is an external ghost-theme consumer contract (snake_case).
    generated_by: 'inFactory CLI v2 (CLI-M5.2)',
    ok: composeResult.ok,
    preset,
    sections: composeResult.sections,
    theme: themeDir,
    timestamp: analysisTimestamp,
    tokens: tokensResult.tokensCount,
    warnings: composeResult.warnings,
  }
  writeFileSync(join(themeDir, 'ai-analysis.json'), JSON.stringify(analysis, null, 2), 'utf8')

  // 8. ZIP (optional)
  let zipPath: null | string = null
  if (zip) {
    zipPath = join(outputDir, `infactory-${preset}.zip`)
    await createZip(themeDir, zipPath)
    log(`  ✔ ZIP erstellt: ${zipPath}`)
  }

  const elapsed = Date.now() - startTime

  return {
    elapsed,
    sections: composeResult.sections,
    themeDir,
    tokensCount: tokensResult.tokensCount,
    warnings: composeResult.warnings,
    zipPath,
  }
}
