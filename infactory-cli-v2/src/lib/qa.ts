/**
 * lib/qa.ts — Visual QA Orchestration (CLI-M5.4)
 *
 * TypeScript-Port von infactory-cli/src/qa.js (die `compare`-Funktion).
 *
 * Three-Sensor-Architecture mit gewichtetem Gesamt-Score:
 *   Sensor 1: odiff-bin (Pixel-Diff, CIE76 Lab ΔE)     — 35% Gewicht
 *   Sensor 2: shot-scraper → getComputedStyle (CSS)    — 25% Gewicht
 *   Sensor 3: shot-scraper + crawl4ai (Struktur)       — 40% Gewicht
 *
 * Jeder Sensor ist unabhängig non-fatal: wenn Sensor 1 fehlschlägt, laufen
 * 2 und 3 weiter. Infrastruktur-Fehler (kein venv) sind fatal (QaError).
 *
 * Ziel ist 99% Gesamt-Score — die Gewichtung priorisiert Struktur über
 * Pixel, weil visuelle Nachbauten mit leicht anderer Pixel-Fidelität OK
 * sind solange die Seiten-Struktur 1:1 abgebildet ist.
 *
 * Scope in M5.4 (CLI-Migration):
 *   ✅ compare() — single page, alle drei Sensoren
 *   ⏳ batch() — bleibt Legacy-Delegation bis zur nächsten Session
 *
 * Pure Hilfsfunktionen (computeOverallScore, slugFromUrl) sind exportiert
 * für Tests und für spätere Reuse in batch.ts.
 */

import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {QaError} from './qa-error.js'
import {
  compareCssTokens,
  type CssDiff,
  cssMatchScore,
  extractCssTokens,
} from './qa/css-tokens.js'
import {
  comparePixels,
  type PixelResult,
} from './qa/pixel.js'
import {takeScreenshot} from './qa/screenshots.js'
import {
  compareStructure,
  extractStructure,
  type StructureReport,
} from './qa/structure.js'
import {resolveVenv, type ResolveVenvOptions} from './resolve-venv.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompareOptions extends ResolveVenvOptions {
  /** Deterministischer Timestamp für Reports (Tests). Default: new Date(). */
  now?: Date
  /** Ausgabe-Verzeichnis für PNGs + JSON. Default: /tmp/infactory-qa. */
  outputDir?: string
  /** Quellseite (Original). */
  sourceUrl: string
  /** Zielseite (Ghost-Nachbau). */
  targetUrl: string
  /** Viewport-Breite in px. Default 1440. */
  width?: number
}

export interface SensorError {
  /** Actionable Fehler-Message (enthält Fix-Hinweis falls bekannt). */
  message: string
  /** Mapping auf Sensor-Nummern: pixel=1, css=2, structure=3. */
  sensor: 'css' | 'pixel' | 'structure'
}

export interface CompareReport {
  /** Sensor 2 Ergebnisse oder null wenn fehlgeschlagen. */
  css: CssSummary | null
  /** Sammlung aller Sensor-Fehler mit actionable messages. */
  errors: SensorError[]
  /** File-Pfade zu den drei PNGs (source, target, diff). */
  files: {diff: string; source: string; target: string}
  /** Gewichteter Gesamt-Score (0–100). Berücksichtigt nur erfolgreiche Sensoren. */
  overall: number
  /** Sensor 1 Ergebnisse oder null wenn fehlgeschlagen. */
  pixel: null | PixelSummary
  slug: string
  sourceUrl: string
  /** Sensor 3 Ergebnisse oder null wenn fehlgeschlagen. */
  structure: null | StructureReport
  targetUrl: string
  /** ISO-Timestamp der Erstellung. */
  timestamp: string
  /** Gewichte für die drei Sensoren. */
  weights: {css: number; pixel: number; structure: number}
}

export interface CssSummary {
  /** Rohe Diffs — wird in Report geschrieben (nur Mismatches). */
  diffs: CssDiff[]
  /** Anzahl Property-Paare die identisch sind. */
  matches: number
  /** CSS-Score in Prozent. */
  score: number
  /** Gesamt geprüfte Property-Paare. */
  total: number
}

export interface PixelSummary {
  /** Anteil abweichender Pixel in Prozent. */
  diffPercentage: number
  /** True wenn Bilder unterschiedliche Dimensionen haben. */
  layoutDiff: boolean
  /** Similarity in Prozent (100 - diffPercentage). */
  similarity: number
}

// Default-Gewichtung
const WEIGHTS = {css: 0.25, pixel: 0.35, structure: 0.4}

// ── Pure Functions ────────────────────────────────────────────────────────────

/**
 * URL → Slug für File-Namen. `/feiern-geniessen/` → `feiern-geniessen`.
 * Fallback `home` bei leerem Pfad.
 */
export function slugFromUrl(url: string): string {
  const pathname = new URL(url).pathname
    .replaceAll('/', '-')
    .replaceAll(/^-|-$/g, '')
  return pathname || 'home'
}

/**
 * Gewichteter Gesamt-Score. Null-Sensoren werden aus der Gewichtung
 * herausgerechnet (statt als 0 zu werten) — sonst würde ein einzelner
 * Sensor-Ausfall den Score künstlich drücken UND ein False-Positive auf
 * leeren Daten würde trotzdem durchgehen. Bei allen-null-Sensoren: return 0.
 *
 * M5.4.1-Verbesserung: Vorher haben null-Sensoren als 0 im Gesamt-Score
 * gezählt (aber auch Struktur-0 bei empty-DOM hat zu False-Positive 85%
 * geführt). Jetzt sind beide Fälle korrekt behandelt.
 */
export function computeOverallScore(
  pixelScore: null | number,
  cssScore: null | number,
  structScore: null | number,
  weights = WEIGHTS,
): number {
  let sum = 0
  let weightTotal = 0
  if (pixelScore !== null) {
    sum += pixelScore * weights.pixel
    weightTotal += weights.pixel
  }

  if (cssScore !== null) {
    sum += cssScore * weights.css
    weightTotal += weights.css
  }

  if (structScore !== null) {
    sum += structScore * weights.structure
    weightTotal += weights.structure
  }

  if (weightTotal === 0) return 0
  return Math.round(sum / weightTotal)
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Drei-Sensoren-Compare einer Quell- vs. Ziel-URL.
 *
 * @throws QaError bei Infrastruktur-Fehlern (kein venv, outputDir nicht
 *         erstellbar). Sensor-Fehler sind non-fatal und führen nur zu
 *         null im jeweiligen Report-Feld.
 */
export async function compareQa(opts: CompareOptions): Promise<CompareReport> {
  const {outputDir = '/tmp/infactory-qa', sourceUrl, targetUrl, width = 1440} = opts
  const venv = resolveVenv(opts)
  const now = opts.now ?? new Date()

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, {recursive: true})
  }

  const slug = slugFromUrl(targetUrl)
  const srcPng = join(outputDir, `${slug}-source.png`)
  const tgtPng = join(outputDir, `${slug}-target.png`)
  const diffPng = join(outputDir, `${slug}-diff.png`)

  const errors: SensorError[] = []

  // ── Sensor 1: Pixel ────────────────────────────────────────────────────────
  let pixel: null | (PixelResult & PixelSummary) = null
  try {
    takeScreenshot(sourceUrl, srcPng, {resolveOpts: opts, venv, width})
    takeScreenshot(targetUrl, tgtPng, {resolveOpts: opts, venv, width})
    const result = await comparePixels(srcPng, tgtPng, diffPng)
    pixel = result
  } catch (error) {
    errors.push({message: (error as Error).message, sensor: 'pixel'})
  }

  // ── Sensor 2: CSS ──────────────────────────────────────────────────────────
  let css: CssSummary | null = null
  try {
    const srcTokens = extractCssTokens(sourceUrl, venv, opts)
    const tgtTokens = extractCssTokens(targetUrl, venv, opts)
    const diffs = compareCssTokens(srcTokens, tgtTokens)
    const matches = diffs.filter((d) => d.match).length
    css = {
      diffs: diffs.filter((d) => !d.match),
      matches,
      score: cssMatchScore(diffs),
      total: diffs.length,
    }
  } catch (error) {
    errors.push({message: (error as Error).message, sensor: 'css'})
  }

  // ── Sensor 3: Struktur ─────────────────────────────────────────────────────
  // False-Positive-Schutz (M5.4.1): wenn der DOM-Analyzer an Source ODER Target
  // fehlschlägt, sind die Vergleichsdaten unbrauchbar → structure = null statt
  // auf leeren Counts zu scoren (vorher 85% bei zwei leeren Seiten).
  let structure: null | StructureReport = null
  try {
    const src = extractStructure(sourceUrl, venv, opts)
    const tgt = extractStructure(targetUrl, venv, opts)
    if (src.domError || tgt.domError) {
      const combined = [src.domError, tgt.domError].filter(Boolean).join(' | ')
      errors.push({
        message: `DOM-Analyzer fehlgeschlagen: ${combined}`,
        sensor: 'structure',
      })
    } else {
      structure = compareStructure(src.structure, tgt.structure)
    }
  } catch (error) {
    errors.push({message: (error as Error).message, sensor: 'structure'})
  }

  // ── Score-Aggregation ──────────────────────────────────────────────────────
  // null = Sensor fehlgeschlagen → aus Gewichtung rausgerechnet, nicht als 0 gewertet.
  const overall = computeOverallScore(
    pixel?.similarity ?? null,
    css?.score ?? null,
    structure?.percentage ?? null,
  )

  // ── Report schreiben ───────────────────────────────────────────────────────
  const report: CompareReport = {
    css,
    errors,
    files: {diff: diffPng, source: srcPng, target: tgtPng},
    overall,
    pixel: pixel ? {
      diffPercentage: pixel.diffPercentage,
      layoutDiff: pixel.layoutDiff,
      similarity: pixel.similarity,
    } : null,
    slug,
    sourceUrl,
    structure,
    targetUrl,
    timestamp: now.toISOString(),
    weights: WEIGHTS,
  }

  const reportPath = join(outputDir, `${slug}-report.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

  return report
}

/**
 * Wirft wenn outputDir nicht existiert und nicht angelegt werden kann.
 * Explizite Validierung — der QaError-Pfad ist sauber vom compareQa-Flow
 * getrennt, damit Commands früh failen können.
 */
export function ensureOutputDir(outputDir: string): void {
  if (existsSync(outputDir)) return
  try {
    mkdirSync(outputDir, {recursive: true})
  } catch (error) {
    throw new QaError(`Output-Verzeichnis nicht erstellbar: ${outputDir} — ${(error as Error).message}`)
  }
}

// ── Batch-Support (M5.4.1) ────────────────────────────────────────────────────

export interface BatchCompareOptions extends ResolveVenvOptions {
  now?: Date
  outputDir?: string
  /** Slug-Liste — z.B. `['home', 'feiern-geniessen', 'team']`. */
  slugs: string[]
  /** Base-URL der Quellseite (wird mit `<base>/<slug>/` kombiniert). */
  sourceBase: string
  /** Base-URL der Zielseite. */
  targetBase: string
  width?: number
}

export interface BatchEntry {
  /** Null wenn der Compare-Aufruf geworfen hat. */
  error: null | string
  /** Gesamtscore (0-100) oder null bei Fehler. */
  overall: null | number
  report: CompareReport | null
  slug: string
}

export interface BatchReport {
  /** Durchschnittlicher Overall-Score über erfolgreiche Vergleiche. */
  avgScore: number
  entries: BatchEntry[]
  /** Anzahl erfolgreicher Einträge. */
  successCount: number
  timestamp: string
  /** Gesamtzahl der Slugs. */
  totalSlugs: number
}

/**
 * Zerlegt eine comma-separierte Slug-Liste in ein Array. Whitespace + leere
 * Einträge werden entfernt. Idempotent gegen "a,b,c", "a, b, c" und "a,,b".
 */
export function parseSlugsList(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Baut eine Full-URL aus Base + Slug. Slashes werden normalisiert:
 * `https://a.at/` + `home` → `https://a.at/home/`.
 */
export function buildSlugUrl(base: string, slug: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  const cleanSlug = slug.replaceAll(/^\/+|\/+$/g, '')
  return `${cleanBase}/${cleanSlug}/`
}

/**
 * Führt compareQa für jeden Slug aus, sammelt Ergebnisse in BatchReport.
 * Fehler einzelner Slugs sind non-fatal — sie landen als error-Entry.
 *
 * @throws QaError bei Infrastruktur-Fehlern (kein venv, outputDir unzugänglich).
 *         Einzelne Compare-Fehler sind non-fatal und werden in `entries[].error`
 *         dokumentiert.
 */
export async function batchCompareQa(opts: BatchCompareOptions): Promise<BatchReport> {
  const {outputDir = '/tmp/infactory-qa', slugs, sourceBase, targetBase, width = 1440} = opts
  ensureOutputDir(outputDir)

  const entries: BatchEntry[] = []

  for (const slug of slugs) {
    try {
      // eslint-disable-next-line no-await-in-loop -- screenshots sind ressourcenintensiv (Browser+Network), sequentiell ist hier gewollt
      const report = await compareQa({
        cwd: opts.cwd,
        env: opts.env,
        legacyCliDir: opts.legacyCliDir,
        now: opts.now,
        outputDir,
        serverVenvDir: opts.serverVenvDir,
        sourceUrl: buildSlugUrl(sourceBase, slug),
        targetUrl: buildSlugUrl(targetBase, slug),
        width,
      })
      entries.push({error: null, overall: report.overall, report, slug})
    } catch (error) {
      entries.push({error: (error as Error).message, overall: null, report: null, slug})
    }
  }

  const successes = entries.filter((e) => e.error === null && e.overall !== null)
  const avgScore = successes.length > 0
    ? Math.round(successes.reduce((sum, e) => sum + (e.overall ?? 0), 0) / successes.length)
    : 0

  const now = opts.now ?? new Date()
  const batchReport: BatchReport = {
    avgScore,
    entries,
    successCount: successes.length,
    timestamp: now.toISOString(),
    totalSlugs: slugs.length,
  }

  writeFileSync(join(outputDir, 'batch-report.json'), JSON.stringify(batchReport, null, 2), 'utf8')
  return batchReport
}
