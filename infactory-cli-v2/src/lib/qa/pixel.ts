/**
 * lib/qa/pixel.ts — Sensor 1: Pixel-Diff via odiff-bin (CIE76 Lab ΔE)
 *
 * Nutzt odiff-bin (etablierter Sensor in der Legacy-CLI). Kein pixelmatch.
 *
 * odiff gibt einen discriminated union zurück (match: true | pixel-diff |
 * layout-diff | file-not-exists). Dieser Wrapper normalisiert das auf eine
 * flache PixelResult-Shape für den Report.
 */

import {compare as odiffCompare} from 'odiff-bin'

export interface PixelResult {
  /** Pfad zum erzeugten Diff-PNG. */
  diffImagePath: string
  /** Anteil abweichender Pixel in Prozent (0–100). */
  diffPercentage: number
  /** Anzahl abweichender Pixel. */
  diffPixels: number
  /** True wenn Bilder unterschiedliche Dimensionen haben (odiff `layout-diff`). */
  layoutDiff: boolean
  /** True wenn odiff match: true. */
  match: boolean
  /** odiff-Reason ('pixel-diff' | 'layout-diff' | null bei match). */
  reason: null | string
  /** Similarity in Prozent (100 - diffPercentage, auf 2 Stellen gerundet). */
  similarity: number
}

/**
 * Zwei PNG-Screenshots vergleichen und Diff-Bild erzeugen.
 *
 * Threshold 0.1 (CIE76) + antialiasing: true sind die Legacy-Defaults und
 * haben sich bewährt — kleine Abweichungen (Font-Hinting, Subpixel-Aliasing)
 * werden ignoriert.
 */
export async function comparePixels(
  sourcePng: string,
  targetPng: string,
  diffPng: string,
): Promise<PixelResult> {
  const result = await odiffCompare(sourcePng, targetPng, diffPng, {
    antialiasing: true,
    outputDiffMask: false,
    threshold: 0.1,
  })

  // odiff returns discriminated union — normalize to flat shape
  if (result.match) {
    return {
      diffImagePath: diffPng,
      diffPercentage: 0,
      diffPixels: 0,
      layoutDiff: false,
      match: true,
      reason: null,
      similarity: 100,
    }
  }

  if (result.reason === 'layout-diff') {
    return {
      diffImagePath: diffPng,
      diffPercentage: 100,
      diffPixels: 0,
      layoutDiff: true,
      match: false,
      reason: 'layout-diff',
      similarity: 0,
    }
  }

  if (result.reason === 'pixel-diff') {
    const {diffPercentage} = result
    return {
      diffImagePath: diffPng,
      diffPercentage,
      diffPixels: result.diffCount,
      layoutDiff: false,
      match: false,
      reason: 'pixel-diff',
      similarity: Math.round((100 - diffPercentage) * 100) / 100,
    }
  }

  // reason === 'file-not-exists' — should not happen if caller ensures files exist
  return {
    diffImagePath: diffPng,
    diffPercentage: 100,
    diffPixels: 0,
    layoutDiff: false,
    match: false,
    reason: result.reason,
    similarity: 0,
  }
}
