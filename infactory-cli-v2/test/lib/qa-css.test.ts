/**
 * test/lib/qa-css.test.ts — Tests für CSS-Token-Vergleich (Sensor 2, pure).
 *
 * Testet normalizeCssValue, compareCssTokens, cssMatchScore und
 * buildExtractionJs. shot-scraper-Aufrufe werden NICHT getestet (Shell-Out).
 */

import {expect} from 'chai'

import {
  buildExtractionJs,
  compareCssTokens,
  cssMatchScore,
  type CssSelector,
  type CssTokens,
  DEFAULT_CSS_SELECTORS,
  normalizeCssValue,
} from '../../src/lib/qa/css-tokens.js'

describe('lib/qa/css-tokens', () => {
  describe('normalizeCssValue (pure)', () => {
    it('collapst Whitespace', () => {
      expect(normalizeCssValue('  foo   bar  ')).to.equal('foo bar')
    })

    it('lowercased', () => {
      expect(normalizeCssValue('Arial, SANS-SERIF')).to.equal('arial, sans-serif')
    })

    it('leerer Input → leerer String', () => {
      expect(normalizeCssValue('')).to.equal('')
    })

    it('undefined Input → leerer String', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined -- explicitly testing undefined handling
      expect(normalizeCssValue(undefined)).to.equal('')
    })
  })

  describe('compareCssTokens (pure)', () => {
    const selectors: CssSelector[] = [
      {name: 'H1', props: ['color', 'fontSize'], selector: 'h1'},
    ]

    it('identische Tokens → alle match=true', () => {
      const src: CssTokens = {H1: {color: 'rgb(0, 0, 0)', fontSize: '48px'}}
      const tgt: CssTokens = {H1: {color: 'rgb(0, 0, 0)', fontSize: '48px'}}
      const diffs = compareCssTokens(src, tgt, selectors)
      expect(diffs).to.have.length(2)
      expect(diffs.every((d) => d.match)).to.be.true
    })

    it('unterschiedliche Tokens → match=false für Diff-Felder', () => {
      const src: CssTokens = {H1: {color: 'red', fontSize: '48px'}}
      const tgt: CssTokens = {H1: {color: 'blue', fontSize: '48px'}}
      const diffs = compareCssTokens(src, tgt, selectors)
      expect(diffs.find((d) => d.prop === 'color')?.match).to.be.false
      expect(diffs.find((d) => d.prop === 'fontSize')?.match).to.be.true
    })

    it('fehlendes Source-Element → Wildcard-Diff mit prop="*"', () => {
      const src: CssTokens = {H1: null}
      const tgt: CssTokens = {H1: {color: 'red', fontSize: '48px'}}
      const diffs = compareCssTokens(src, tgt, selectors)
      expect(diffs).to.have.length(1)
      expect(diffs[0].prop).to.equal('*')
      expect(diffs[0].source).to.equal('NOT FOUND')
      expect(diffs[0].match).to.be.false
    })

    it('beide null → keine Diffs (continue)', () => {
      const src: CssTokens = {H1: null}
      const tgt: CssTokens = {H1: null}
      expect(compareCssTokens(src, tgt, selectors)).to.have.length(0)
    })

    it('Whitespace-Unterschiede werden durch Normalisierung ignoriert', () => {
      const src: CssTokens = {H1: {color: 'rgb(0, 0, 0)', fontSize: '48px'}}
      const tgt: CssTokens = {H1: {color: 'RGB(0,   0,  0)', fontSize: '48px'}}
      const diffs = compareCssTokens(src, tgt, selectors)
      expect(diffs.every((d) => d.match)).to.be.true
    })
  })

  describe('cssMatchScore (pure)', () => {
    it('50% match → 50', () => {
      const diffs = [
        {match: true,  name: 'H1', prop: 'color',    source: '', target: ''},
        {match: false, name: 'H1', prop: 'fontSize', source: '', target: ''},
      ]
      expect(cssMatchScore(diffs)).to.equal(50)
    })

    it('alle match → 100', () => {
      const diffs = [{match: true, name: 'H1', prop: 'color', source: '', target: ''}]
      expect(cssMatchScore(diffs)).to.equal(100)
    })

    it('leere Liste → 0', () => {
      expect(cssMatchScore([])).to.equal(0)
    })
  })

  describe('buildExtractionJs (pure)', () => {
    it('enthält document.querySelector + getComputedStyle', () => {
      const js = buildExtractionJs()
      expect(js).to.contain('document.querySelector')
      expect(js).to.contain('getComputedStyle')
    })

    it('enthält alle DEFAULT_CSS_SELECTORS (Selector-JSON eingebettet)', () => {
      const js = buildExtractionJs()
      for (const sel of DEFAULT_CSS_SELECTORS) {
        expect(js).to.contain(sel.name)
      }
    })

    it('wrappt in Promise für shot-scraper 2000ms Wait', () => {
      const js = buildExtractionJs()
      expect(js).to.contain('new Promise')
      expect(js).to.contain('2000')
    })
  })
})
