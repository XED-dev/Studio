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

export interface CompareReport {
  /** Sensor 2 Ergebnisse oder null wenn fehlgeschlagen. */
  css: CssSummary | null
  /** File-Pfade zu den drei PNGs (source, target, diff). */
  files: {diff: string; source: string; target: string}
  /** Gewichteter Gesamt-Score (0–100). */
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
 * Gewichteter Gesamt-Score. Fehlende Sensoren zählen als 0.
 */
export function computeOverallScore(
  pixelScore: number,
  cssScore: number,
  structScore: number,
  weights = WEIGHTS,
): number {
  return Math.round(
    structScore * weights.structure
    + pixelScore * weights.pixel
    + cssScore * weights.css,
  )
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

  // ── Sensor 1: Pixel ────────────────────────────────────────────────────────
  let pixel: null | (PixelResult & PixelSummary) = null
  try {
    takeScreenshot(sourceUrl, srcPng, {venv, width})
    takeScreenshot(targetUrl, tgtPng, {venv, width})
    const result = await comparePixels(srcPng, tgtPng, diffPng)
    pixel = result
  } catch {
    // non-fatal — pixel bleibt null
  }

  // ── Sensor 2: CSS ──────────────────────────────────────────────────────────
  let css: CssSummary | null = null
  try {
    const srcTokens = extractCssTokens(sourceUrl, venv)
    const tgtTokens = extractCssTokens(targetUrl, venv)
    const diffs = compareCssTokens(srcTokens, tgtTokens)
    const matches = diffs.filter((d) => d.match).length
    css = {
      diffs: diffs.filter((d) => !d.match),
      matches,
      score: cssMatchScore(diffs),
      total: diffs.length,
    }
  } catch {
    // non-fatal
  }

  // ── Sensor 3: Struktur ─────────────────────────────────────────────────────
  let structure: null | StructureReport = null
  try {
    const srcStruct = extractStructure(sourceUrl, venv, opts)
    const tgtStruct = extractStructure(targetUrl, venv, opts)
    structure = compareStructure(srcStruct, tgtStruct)
  } catch {
    // non-fatal
  }

  // ── Score-Aggregation ──────────────────────────────────────────────────────
  const pixelScore = pixel?.similarity ?? 0
  const cssScore = css?.score ?? 0
  const structScore = structure?.percentage ?? 0
  const overall = computeOverallScore(pixelScore, cssScore, structScore)

  // ── Report schreiben ───────────────────────────────────────────────────────
  const report: CompareReport = {
    css,
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
