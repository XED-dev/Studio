/**
 * test/lib/qa.test.ts — Tests für qa.ts-Orchestration (pure Helpers).
 *
 * compareQa() selbst (mit shot-scraper + odiff) wird NICHT getestet —
 * das ist Shell-Out + externes Binary. Server-Smoke-Test deckt das ab.
 */

import {expect} from 'chai'

import {computeOverallScore, slugFromUrl} from '../../src/lib/qa.js'

describe('lib/qa (pure Helpers)', () => {
  describe('slugFromUrl', () => {
    it('simpler Pfad → slug ohne Slashes', () => {
      expect(slugFromUrl('https://a.test/feiern-geniessen/')).to.equal('feiern-geniessen')
    })

    it('mehrstufiger Pfad → slug mit Bindestrichen', () => {
      expect(slugFromUrl('https://a.test/news/2024/10/')).to.equal('news-2024-10')
    })

    it('Root-URL → "home"', () => {
      expect(slugFromUrl('https://a.test/')).to.equal('home')
    })

    it('ohne trailing slash → slug', () => {
      expect(slugFromUrl('https://a.test/about')).to.equal('about')
    })
  })

  describe('computeOverallScore', () => {
    it('Default-Gewichtung: 100/100/100 → 100', () => {
      expect(computeOverallScore(100, 100, 100)).to.equal(100)
    })

    it('alle 0 → 0', () => {
      expect(computeOverallScore(0, 0, 0)).to.equal(0)
    })

    it('Struktur 40%, Pixel 35%, CSS 25% — Gewichtung korrekt', () => {
      // 80 * 0.40 + 70 * 0.35 + 60 * 0.25 = 32 + 24.5 + 15 = 71.5 → 72
      expect(computeOverallScore(70, 60, 80)).to.equal(72)
    })

    it('nur Struktur 100% → 40 (wegen Gewichtung)', () => {
      expect(computeOverallScore(0, 0, 100)).to.equal(40)
    })

    it('custom weights respektiert', () => {
      expect(computeOverallScore(100, 100, 100, {css: 0.5, pixel: 0.5, structure: 0})).to.equal(100)
    })
  })
})
