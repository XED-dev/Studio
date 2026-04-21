/**
 * test/lib/qa-structure.test.ts — Tests für Struktur-Vergleich (Sensor 3, pure).
 *
 * Fokus: scoreSectionTypes, scoreElementCounts, scoreLayout, scorePageHeight,
 * compareStructure. shot-scraper-/crawl4ai-Aufrufe werden NICHT getestet.
 */

import {expect} from 'chai'

import {
  compareStructure,
  type PageStructure,
  scoreElementCounts,
  scoreLayout,
  scorePageHeight,
  scoreSectionTypes,
} from '../../src/lib/qa/structure.js'

function page(overrides: Partial<PageStructure> = {}): PageStructure {
  return {
    content: {},
    contentBlocks: [],
    elements: {},
    links: {},
    media: {},
    metrics: {},
    sections: [],
    ...overrides,
  }
}

describe('lib/qa/structure (pure)', () => {
  describe('scoreSectionTypes', () => {
    it('alle Typen vorhanden → voller Score', () => {
      const src = [{classes: '', height: 100, type: 'hero'}, {classes: '', height: 100, type: 'cta'}]
      const tgt = [{classes: '', height: 100, type: 'hero'}, {classes: '', height: 100, type: 'cta'}]
      const r = scoreSectionTypes(src, tgt)
      expect(r.score).to.equal(r.maxScore)
      expect(r.diffs).to.have.length(0)
    })

    it('fehlender Typ → Diff-Eintrag', () => {
      const src = [{classes: '', height: 100, type: 'hero'}, {classes: '', height: 100, type: 'cta'}]
      const tgt = [{classes: '', height: 100, type: 'hero'}]
      const r = scoreSectionTypes(src, tgt)
      expect(r.score).to.equal(10)
      expect(r.maxScore).to.equal(20)
      expect(r.diffs).to.have.length(1)
      expect(r.diffs[0].source).to.equal('cta')
    })

    it('unknown-Typen werden ignoriert', () => {
      const src = [{classes: '', height: 100, type: 'unknown'}]
      const tgt: PageStructure['sections'] = []
      const r = scoreSectionTypes(src, tgt)
      expect(r.maxScore).to.equal(0)
      expect(r.sourceTypes).to.deep.equal([])
    })
  })

  describe('scoreElementCounts', () => {
    it('exakter Match → 5 pro Element', () => {
      const r = scoreElementCounts({h1: 1, h2: 3, p: 10}, {h1: 1, h2: 3, p: 10})
      expect(r.score).to.equal(r.maxScore)
    })

    it('Diff ≤ 2 → 3 Punkte + element-count diff', () => {
      const r = scoreElementCounts({p: 10}, {p: 8})
      expect(r.diffs.find((d) => d.element === 'p')?.type).to.equal('element-count')
    })

    it('Tag komplett fehlt → 0 + missing-element Diff', () => {
      const r = scoreElementCounts({img: 5}, {img: 0})
      expect(r.diffs.find((d) => d.element === 'img')?.type).to.equal('missing-element')
    })
  })

  describe('scoreLayout', () => {
    it('beide gleich viel Multi-Column → 20', () => {
      const r = scoreLayout({multiColumnBlocks: 3}, {multiColumnBlocks: 3})
      expect(r.score).to.equal(20)
    })

    it('Source multi, Target 0 → layout-critical + 0 Score', () => {
      const r = scoreLayout({maxColumns: 3, multiColumnBlocks: 3}, {multiColumnBlocks: 0})
      expect(r.score).to.equal(0)
      expect(r.diffs[0].type).to.equal('layout-critical')
    })

    it('partial match (2 vs 3) → anteiliger Score + layout-mismatch', () => {
      const r = scoreLayout({multiColumnBlocks: 3}, {multiColumnBlocks: 2})
      expect(r.score).to.equal(13)  // round(20 * 2/3)
      expect(r.diffs[0].type).to.equal('layout-mismatch')
    })
  })

  describe('scorePageHeight', () => {
    it('gleiche Höhe → voller Score', () => {
      const r = scorePageHeight({totalHeight: 1000}, {totalHeight: 1000})
      expect(r.score).to.equal(10)
      expect(r.heightRatio).to.equal(100)
    })

    it('50% Abweichung → height-critical Diff', () => {
      const r = scorePageHeight({totalHeight: 1000}, {totalHeight: 500})
      expect(r.diffs[0].type).to.equal('height-critical')
      expect(r.heightRatio).to.equal(50)
    })

    it('fehlende height → 0 Score, keine Diffs', () => {
      const r = scorePageHeight({}, {totalHeight: 500})
      expect(r.score).to.equal(0)
      expect(r.diffs).to.have.length(0)
    })
  })

  describe('compareStructure', () => {
    it('identische Strukturen → 100%', () => {
      const src = page({
        elements: {h1: 1, img: 2},
        metrics: {multiColumnBlocks: 1, totalHeight: 1000},
        sections: [{classes: '', height: 100, type: 'hero'}],
      })
      const report = compareStructure(src, src)
      expect(report.percentage).to.equal(100)
      expect(report.diffs).to.have.length(0)
    })

    it('Sections fehlen komplett → drückt prozent unter 50', () => {
      const src = page({
        elements: {h1: 3, img: 5},
        metrics: {multiColumnBlocks: 3, totalHeight: 2000},
        sections: [
          {classes: '', height: 100, type: 'hero'},
          {classes: '', height: 100, type: 'cta'},
          {classes: '', height: 100, type: 'cards'},
        ],
      })
      const tgt = page({elements: {}, metrics: {}, sections: []})
      const report = compareStructure(src, tgt)
      expect(report.percentage).to.be.lessThan(50)
      expect(report.diffs.length).to.be.greaterThan(0)
    })

    it('summary enthält sourceSections + sourceTypes', () => {
      const src = page({sections: [{classes: '', height: 100, type: 'hero'}]})
      const report = compareStructure(src, page())
      expect(report.summary.sourceSections).to.equal(1)
      expect(report.summary.sourceTypes).to.deep.equal(['hero'])
    })
  })
})
