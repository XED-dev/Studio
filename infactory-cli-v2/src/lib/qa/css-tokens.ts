/**
 * lib/qa/css-tokens.ts — Sensor 2: CSS-Token-Vergleich via getComputedStyle
 *
 * Extrahiert für eine kurze Liste wichtiger Elemente die sichtbaren
 * CSS-Properties (font, color, background, …) und vergleicht Source vs. Target.
 *
 * Arbeitet rein pure (Vergleich) + mit shot-scraper JS (Extraktion).
 * Die Extraktions-Funktion wirft QaError wenn shot-scraper nicht antwortet.
 */

import type {ResolvedVenv, ResolveVenvOptions} from '../resolve-venv.js'

import {runShotScraperJs} from './screenshots.js'

export interface CssSelector {
  /** Human-lesbarer Name (z.B. "H1", "Hero/Header"). */
  name: string
  /** CSS-Properties die geprüft werden (camelCase wie in getComputedStyle). */
  props: string[]
  /** CSS-Selector (erster Match via querySelector). */
  selector: string
}

export interface CssDiff {
  /** True wenn Source und Target nach Normalisierung gleich sind. */
  match: boolean
  /** Selector-Name (z.B. "H1"). */
  name: string
  /** CSS-Property-Name (z.B. "fontSize"). `'*'` bei komplett fehlendem Element. */
  prop: string
  /** Value aus Source. */
  source: string
  /** Value aus Target. */
  target: string
}

/** Selektoren + Properties die verglichen werden. Auszug aus Legacy qa.js. */
export const DEFAULT_CSS_SELECTORS: CssSelector[] = [
  {name: 'Body',        props: ['fontFamily', 'fontSize', 'color', 'backgroundColor'],           selector: 'body'},
  {name: 'H1',          props: ['fontFamily', 'fontSize', 'fontWeight', 'color'],                selector: 'h1'},
  {name: 'H2',          props: ['fontFamily', 'fontSize', 'fontWeight', 'color'],                selector: 'h2'},
  {name: 'H3',          props: ['fontFamily', 'fontSize', 'fontWeight', 'color'],                selector: 'h3'},
  {name: 'Paragraph',   props: ['fontFamily', 'fontSize', 'lineHeight', 'color'],                selector: 'p'},
  {name: 'Link',        props: ['color', 'textDecoration'],                                      selector: 'a'},
  {name: 'Nav',         props: ['backgroundColor', 'fontFamily', 'fontSize'],                    selector: 'nav, [class*="nav"]'},
  {name: 'Hero/Header', props: ['backgroundColor', 'backgroundImage', 'minHeight'],              selector: '[class*="hero"], [class*="header"], .gh-page-head'},
  {name: 'Card',        props: ['backgroundColor', 'borderRadius', 'boxShadow', 'padding'],      selector: '[class*="card"], [class*="feature"]'},
  {name: 'Footer',      props: ['backgroundColor', 'color', 'padding'],                          selector: 'footer, [class*="footer"]'},
  {name: 'Image',       props: ['width', 'height', 'objectFit'],                                 selector: 'img'},
  {name: 'Button',      props: ['backgroundColor', 'color', 'borderRadius', 'padding', 'fontFamily'], selector: 'button, .button, [class*="btn"]'},
]

export type CssTokens = Record<string, null | Record<string, string>>

/**
 * Normalisiert einen CSS-Value für Vergleichszwecke: Whitespace collapsed,
 * lowercased, trimmed. So bleiben `"Satoshi", sans-serif` und `"Satoshi",
 * sans-serif` als gleich erkennbar, aber subtile Farbunterschiede bleiben
 * sichtbar.
 */
export function normalizeCssValue(value: string | undefined): string {
  if (!value) return ''
  return value.replaceAll(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Vergleicht zwei Token-Maps (Output von `extractCssTokens`) und liefert
 * eine Liste aller geprüften Property-Paare mit Match-Flag.
 */
export function compareCssTokens(
  source: CssTokens,
  target: CssTokens,
  selectors: CssSelector[] = DEFAULT_CSS_SELECTORS,
): CssDiff[] {
  const diffs: CssDiff[] = []

  for (const {name, props} of selectors) {
    const src = source[name]
    const tgt = target[name]

    if (!src && !tgt) continue
    if (!src) {
      diffs.push({match: false, name, prop: '*', source: 'NOT FOUND', target: 'exists'})
      continue
    }

    if (!tgt) {
      diffs.push({match: false, name, prop: '*', source: 'exists', target: 'NOT FOUND'})
      continue
    }

    for (const prop of props) {
      const srcVal = src[prop] ?? ''
      const tgtVal = tgt[prop] ?? ''
      diffs.push({
        match: normalizeCssValue(srcVal) === normalizeCssValue(tgtVal),
        name,
        prop,
        source: srcVal,
        target: tgtVal,
      })
    }
  }

  return diffs
}

/**
 * Baut das JS-Snippet für shot-scraper javascript, das
 * `getComputedStyle()` auf alle Selektoren anwendet.
 */
export function buildExtractionJs(selectors: CssSelector[] = DEFAULT_CSS_SELECTORS): string {
  const jsCode = `(() => {
    const results = {};
    const selectors = ${JSON.stringify(selectors)};
    for (const s of selectors) {
      const el = document.querySelector(s.selector);
      if (!el) { results[s.name] = null; continue; }
      const cs = getComputedStyle(el);
      const vals = {};
      for (const p of s.props) vals[p] = cs[p] || '';
      results[s.name] = vals;
    }
    return JSON.stringify(results);
  })()`
  return `new Promise(done => setTimeout(() => done(${jsCode}), 2000))`
}

/**
 * CSS-Tokens einer URL extrahieren (via shot-scraper → Chromium).
 */
export function extractCssTokens(
  url: string,
  venv: ResolvedVenv,
  opts: ResolveVenvOptions = {},
): CssTokens {
  const js = buildExtractionJs()
  const output = runShotScraperJs(url, js, venv, opts)
  return JSON.parse(output) as CssTokens
}

/**
 * Score-Berechnung für CSS-Sensor: Prozent identischer Properties.
 */
export function cssMatchScore(diffs: CssDiff[]): number {
  if (diffs.length === 0) return 0
  const matches = diffs.filter((d) => d.match).length
  return Math.round((matches / diffs.length) * 100)
}
