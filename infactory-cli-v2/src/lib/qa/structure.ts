/**
 * lib/qa/structure.ts — Sensor 3: Struktur-Vergleich (DOM + crawl4ai)
 *
 * Zwei Datenquellen werden gemerged:
 *
 *   A. shot-scraper-JS im Chromium: Section-Detection, Element-Inventory,
 *      Multi-Column-Layout, Page-Height, ContentBlocks.
 *   B. Python-Helper `extract-structure.py` (crawl4ai): Content-Länge
 *      (Markdown), Medien-Inventar, strukturelle Content-Analyse.
 *
 * DOM-Daten sind primary (direkter aus dem Rendering). crawl4ai liefert
 * Content-Metriken die DOM alleine nicht hergibt (Wort-Anzahl etc).
 *
 * `extract-structure.py` lebt bis M6 in der Legacy-CLI — wird via
 * `resolvePythonScript()` gefunden.
 */

import {spawnSync} from 'node:child_process'

import {type ResolvedVenv, resolvePythonScript, type ResolveVenvOptions} from '../resolve-venv.js'
import {buildShotScraperEnv, runShotScraperJs} from './screenshots.js'

export interface Section {
  classes: string
  height: number
  type: string
}

export interface ContentBlock {
  classes: string
  columns: number
  hasHeadings: number
  hasImages: number
  height: number
  tag: string
  width: number
}

export interface StructureMetrics {
  maxColumns?: number
  multiColumnBlocks?: number
  totalBlocks?: number
  totalHeight?: number
}

export interface PageStructure {
  content: Record<string, unknown> & {markdown_length?: number}
  contentBlocks: ContentBlock[]
  elements: Record<string, number>
  links: Record<string, unknown>
  media: Record<string, unknown> & {images?: number}
  metrics: StructureMetrics
  sections: Section[]
}

export interface StructureReport {
  diffs: Array<{detail?: string; element?: string; source?: number | string; target?: number | string; type: string}>
  maxScore: number
  percentage: number
  score: number
  summary: Record<string, number | string[] | undefined>
}

const DOM_ANALYSIS_JS = `new Promise(done => setTimeout(() => done((() => {
  const r = { sections: [], elements: {}, contentBlocks: [], metrics: {} };
  const tags = ['h1','h2','h3','h4','p','img','a','ul','ol','table','figure','section','nav'];
  for (const t of tags) r.elements[t] = document.querySelectorAll(t).length;
  const content = document.querySelector('.gh-content, .sections_group, main, article, #Content') || document.body;
  const blocks = Array.from(content.children).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.height > 10 && rect.width > 100;
  });
  blocks.forEach(el => {
    const rect = el.getBoundingClientRect();
    const kids = Array.from(el.children).filter(c => c.getBoundingClientRect().width > 50 && c.getBoundingClientRect().height > 10);
    let cols = 1;
    if (kids.length >= 2) {
      const top1 = kids[0].getBoundingClientRect().top;
      cols = kids.filter(c => Math.abs(c.getBoundingClientRect().top - top1) < 20).length;
    }
    r.contentBlocks.push({
      tag: el.tagName.toLowerCase(),
      classes: (el.className||'').toString().substring(0,100),
      height: Math.round(rect.height), width: Math.round(rect.width),
      columns: cols,
      hasImages: el.querySelectorAll('img').length,
      hasHeadings: el.querySelectorAll('h1,h2,h3,h4').length,
    });
  });
  document.querySelectorAll('section,[class*="section"],[class*="hero"],[class*="feature"],[class*="grid"],[class*="card"],[class*="cta"],.mcb-section').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.height < 20) return;
    const cls = (el.className||'').toString().toLowerCase();
    let type = 'unknown';
    if (/hero|slider/.test(cls)) type = 'hero';
    else if (/feature|card/.test(cls)) type = 'cards';
    else if (/grid|gallery|venue/.test(cls)) type = 'grid';
    else if (/cta/.test(cls)) type = 'cta';
    else if (/mcb-section|section/.test(cls)) type = 'section';
    r.sections.push({ type, height: Math.round(rect.height), classes: cls.substring(0,80) });
  });
  r.metrics = {
    totalHeight: document.documentElement.scrollHeight,
    totalBlocks: r.contentBlocks.length,
    multiColumnBlocks: r.contentBlocks.filter(b => b.columns > 1).length,
    maxColumns: Math.max(...r.contentBlocks.map(b => b.columns), 1),
  };
  return JSON.stringify(r);
})()), 2000))`

interface Crawl4AiData {
  content?: Record<string, unknown>
  elements?: Record<string, number>
  links?: Record<string, unknown>
  media?: Record<string, unknown>
  metrics?: StructureMetrics
}

interface DomData {
  contentBlocks: ContentBlock[]
  elements: Record<string, number>
  metrics: StructureMetrics
  sections: Section[]
}

/**
 * crawl4ai-Helper aufrufen. Bei Fehler (Python nicht installiert, venv kaputt)
 * wird ein leeres Objekt zurückgegeben — der DOM-Sensor kompensiert.
 */
function callCrawl4ai(url: string, venv: ResolvedVenv, opts: ResolveVenvOptions): Crawl4AiData {
  let scriptPath: string
  try {
    scriptPath = resolvePythonScript('extract-structure.py', opts)
  } catch {
    return {}  // Script nirgendwo gefunden — DOM-Sensor reicht
  }

  const result = spawnSync(
    venv.python,
    [scriptPath, url],
    {
      encoding: 'utf8',
      env: buildShotScraperEnv(venv, opts),
      timeout: 45_000,
    },
  )

  if (result.status !== 0) return {}

  const stdout = result.stdout ?? ''
  const marker = '###JSON_START###'
  const idx = stdout.indexOf(marker)
  if (idx === -1) return {}

  try {
    return JSON.parse(stdout.slice(idx + marker.length).trim()) as Crawl4AiData
  } catch {
    return {}
  }
}

/**
 * Ruft den shot-scraper-DOM-Analyzer auf. Gibt bei Fehler leeres Objekt zurück
 * — der crawl4ai-Sensor kompensiert teilweise.
 */
interface DomCallResult {
  data: DomData
  /** Null bei Success, Error-Message bei Failure. */
  error: null | string
}

function callDomAnalyzer(
  url: string,
  venv: ResolvedVenv,
  opts: ResolveVenvOptions = {},
): DomCallResult {
  try {
    const output = runShotScraperJs(url, DOM_ANALYSIS_JS, venv, opts)
    return {data: JSON.parse(output) as DomData, error: null}
  } catch (error) {
    return {
      data: {contentBlocks: [], elements: {}, metrics: {}, sections: []},
      error: (error as Error).message,
    }
  }
}

/**
 * Ergebnis von extractStructure — `domError` ist gesetzt wenn der DOM-Analyzer
 * fehlgeschlagen ist. Caller (qa.ts) nutzt das, um Sensor 3 als null zu
 * melden anstatt einen False-Positive-Score aus leeren Daten zu berechnen.
 */
export interface StructureExtractionResult {
  domError: null | string
  structure: PageStructure
}

/**
 * Komplette Seitenstruktur extrahieren. Merged DOM-Daten (primary) + crawl4ai
 * (Content-Analyse). Bei DOM-Analyzer-Fehler: domError gesetzt, Caller muss
 * das als "Sensor 3 fehlgeschlagen" behandeln (nicht silent-Fallback).
 */
export function extractStructure(
  url: string,
  venv: ResolvedVenv,
  opts: ResolveVenvOptions = {},
): StructureExtractionResult {
  const crawl4ai = callCrawl4ai(url, venv, opts)
  const domResult = callDomAnalyzer(url, venv, opts)
  const dom = domResult.data

  return {
    domError: domResult.error,
    structure: {
      content: crawl4ai.content ?? {},
      contentBlocks: dom.contentBlocks,
      elements: Object.keys(dom.elements).length > 0 ? dom.elements : (crawl4ai.elements ?? {}),
      links: crawl4ai.links ?? {},
      media: crawl4ai.media ?? {},
      metrics: Object.keys(dom.metrics).length > 0 ? dom.metrics : (crawl4ai.metrics ?? {}),
      sections: dom.sections,
    },
  }
}

// ── Pure Vergleichs-Logik ─────────────────────────────────────────────────────

/**
 * Vergleicht Section-Typ-Coverage. 10 Punkte pro Source-Typ wenn im Target
 * auch vorhanden.
 */
export function scoreSectionTypes(
  source: Section[],
  target: Section[],
): {diffs: StructureReport['diffs']; maxScore: number; score: number; sourceTypes: string[]; targetTypes: string[]} {
  const srcTypes = source.map((s) => s.type).filter((t) => t !== 'unknown')
  const tgtTypes = target.map((s) => s.type).filter((t) => t !== 'unknown')
  const srcSet = new Set(srcTypes)
  const tgtSet = new Set(tgtTypes)

  const diffs: StructureReport['diffs'] = []
  let score = 0
  let maxScore = 0

  for (const type of srcSet) {
    maxScore += 10
    if (tgtSet.has(type)) {
      score += 10
    } else {
      diffs.push({detail: `Section-Typ "${type}" fehlt im Target`, source: type, type: 'missing-section-type'})
    }
  }

  return {diffs, maxScore, score, sourceTypes: [...srcSet], targetTypes: [...tgtSet]}
}

const IMPORTANT_ELEMENTS = ['h1', 'h2', 'h3', 'img', 'p', 'ul', 'ol']

/**
 * Vergleicht Element-Counts. 5 Punkte pro exakter Match, 3 wenn Diff ≤ 2,
 * 0 wenn komplett fehlt.
 */
export function scoreElementCounts(
  source: Record<string, number>,
  target: Record<string, number>,
): {diffs: StructureReport['diffs']; maxScore: number; score: number} {
  const diffs: StructureReport['diffs'] = []
  let score = 0
  let maxScore = 0

  for (const tag of IMPORTANT_ELEMENTS) {
    maxScore += 5
    const srcCount = source[tag] ?? 0
    const tgtCount = target[tag] ?? 0

    if (srcCount === tgtCount) {
      score += 5
    } else if (srcCount > 0 && tgtCount > 0 && Math.abs(srcCount - tgtCount) <= 2) {
      score += 3
      diffs.push({element: tag, source: srcCount, target: tgtCount, type: 'element-count'})
    } else if (srcCount > 0 && tgtCount === 0) {
      diffs.push({detail: `<${tag}> fehlt komplett`, element: tag, source: srcCount, target: 0, type: 'missing-element'})
    } else {
      diffs.push({element: tag, source: srcCount, target: tgtCount, type: 'element-count'})
    }
  }

  return {diffs, maxScore, score}
}

/**
 * Vergleicht Multi-Column-Layout. 20 Punkte wenn gleich viele Multi-Column-
 * Blöcke, sonst anteiliger Score nach Ratio.
 */
export function scoreLayout(
  source: StructureMetrics,
  target: StructureMetrics,
): {diffs: StructureReport['diffs']; maxScore: number; score: number} {
  const diffs: StructureReport['diffs'] = []
  const maxScore = 20
  let score = 0

  const srcCols = source.multiColumnBlocks ?? 0
  const tgtCols = target.multiColumnBlocks ?? 0

  if (srcCols > 0 && tgtCols === 0) {
    diffs.push({
      detail: `Source hat ${srcCols} Multi-Column-Blöcke (max ${source.maxColumns ?? 1} Spalten), Target hat 0`,
      type: 'layout-critical',
    })
  } else if (srcCols === tgtCols) {
    score = 20
  } else {
    const ratio = Math.min(srcCols, tgtCols) / Math.max(srcCols, tgtCols)
    score = Math.round(20 * ratio)
    diffs.push({detail: `Multi-Column: Source ${srcCols}, Target ${tgtCols}`, type: 'layout-mismatch'})
  }

  return {diffs, maxScore, score}
}

/**
 * Vergleicht Seitenhöhe. Max 10 Punkte nach Ratio (kleiner/größer).
 * Threshold: Abweichung > 30% → Diff-Eintrag.
 */
export function scorePageHeight(
  source: StructureMetrics,
  target: StructureMetrics,
): {diffs: StructureReport['diffs']; heightRatio: number; maxScore: number; score: number} {
  const maxScore = 10
  const diffs: StructureReport['diffs'] = []

  if (!source.totalHeight || !target.totalHeight) {
    return {diffs, heightRatio: 0, maxScore, score: 0}
  }

  const ratio = Math.min(source.totalHeight, target.totalHeight)
    / Math.max(source.totalHeight, target.totalHeight)
  const score = Math.round(maxScore * ratio)

  if (ratio < 0.7) {
    diffs.push({
      detail: `Seitenhöhe weicht ${Math.round((1 - ratio) * 100)}% ab `
        + `(Source: ${source.totalHeight}px, Target: ${target.totalHeight}px)`,
      type: 'height-critical',
    })
  }

  return {diffs, heightRatio: Math.round(ratio * 100), maxScore, score}
}

/**
 * Gesamtvergleich der Struktur — führt alle Sub-Scores zusammen.
 */
export function compareStructure(source: PageStructure, target: PageStructure): StructureReport {
  const typeResult = scoreSectionTypes(source.sections, target.sections)
  const elResult = scoreElementCounts(source.elements, target.elements)
  const layoutResult = scoreLayout(source.metrics, target.metrics)
  const heightResult = scorePageHeight(source.metrics, target.metrics)

  const score = typeResult.score + elResult.score + layoutResult.score + heightResult.score
  const maxScore = typeResult.maxScore + elResult.maxScore + layoutResult.maxScore + heightResult.maxScore

  return {
    diffs: [...typeResult.diffs, ...elResult.diffs, ...layoutResult.diffs, ...heightResult.diffs],
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    score,
    summary: {
      heightRatio: heightResult.heightRatio,
      sourceHeight: source.metrics.totalHeight,
      sourceMaxCols: source.metrics.maxColumns ?? 1,
      sourceMultiCol: source.metrics.multiColumnBlocks ?? 0,
      sourceSections: source.sections.length,
      sourceTypes: typeResult.sourceTypes,
      targetHeight: target.metrics.totalHeight,
      targetMaxCols: target.metrics.maxColumns ?? 1,
      targetMultiCol: target.metrics.multiColumnBlocks ?? 0,
      targetSections: target.sections.length,
      targetTypes: typeResult.targetTypes,
    },
  }
}
