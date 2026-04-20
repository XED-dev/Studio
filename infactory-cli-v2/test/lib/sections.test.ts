/**
 * test/lib/sections.test.ts — Tests für Section-Composer
 *
 * Scope:
 *   - generateHomeHbs + generatePlaceholderPartial + indexRegistry (pure)
 *   - composeSections (I/O) gegen echte Fixture-Verzeichnisse
 *
 * camelcase ESLint: `ghost_helpers` ist Feld in der Section-Registry (snake_case Schema).
 */
/* eslint-disable camelcase */

import {expect} from 'chai'
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {
  composeSections,
  generateHomeHbs,
  generatePlaceholderPartial,
  indexRegistry,
  type Section,
} from '../../src/lib/sections.js'

const FIXED_NOW = new Date('2026-04-20T12:00:00Z')
const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/m5-2/', import.meta.url))

describe('lib/sections', () => {
  describe('generateHomeHbs (pure)', () => {
    const sections: Section[] = [
      {category: 'hero', id: 'hero_mini', label: 'Hero Mini', partial: 'sections/hero/hero-mini.hbs'},
      {category: 'cta', id: 'cta_mini', label: 'CTA Mini', partial: 'sections/cta/cta-mini.hbs'},
    ]

    it('enthält Header mit Preset-Info + Datum', () => {
      const hbs = generateHomeHbs({id: 'testmini', name: 'Test Mini'}, sections, FIXED_NOW)
      expect(hbs).to.contain('Preset:    Test Mini (testmini)')
      expect(hbs).to.contain('2026-04-20')
    })

    it('enthält {{!< default}} Layout-Direktive', () => {
      const hbs = generateHomeHbs({id: 'x'}, sections, FIXED_NOW)
      expect(hbs).to.contain('{{!< default}}')
    })

    it('rendert Partial-Includes ohne .hbs Extension', () => {
      const hbs = generateHomeHbs({id: 'x'}, sections, FIXED_NOW)
      expect(hbs).to.contain('{{> "sections/hero/hero-mini"}}')
      expect(hbs).to.contain('{{> "sections/cta/cta-mini"}}')
    })

    it('Section-Kommentare enthalten Labels', () => {
      const hbs = generateHomeHbs({id: 'x'}, sections, FIXED_NOW)
      expect(hbs).to.contain('Hero Mini')
      expect(hbs).to.contain('CTA Mini')
    })

    it('deterministisch bei fixem now', () => {
      const a = generateHomeHbs({id: 'x'}, sections, FIXED_NOW)
      const b = generateHomeHbs({id: 'x'}, sections, FIXED_NOW)
      expect(a).to.equal(b)
    })
  })

  describe('generatePlaceholderPartial (pure)', () => {
    const section: Section = {
      category: 'hero',
      description: 'Ein minimaler Hero',
      ghost_helpers: ['site', 'posts'],
      id: 'hero_mini',
      label: 'Hero Mini',
      partial: 'sections/hero/hero-mini.hbs',
    }

    it('enthält section.id + label + description', () => {
      const hbs = generatePlaceholderPartial(section)
      expect(hbs).to.contain('hero_mini')
      expect(hbs).to.contain('Hero Mini')
      expect(hbs).to.contain('Ein minimaler Hero')
    })

    it('listet ghost_helpers', () => {
      const hbs = generatePlaceholderPartial(section)
      expect(hbs).to.contain('Ghost Helpers: site, posts')
    })

    it('zeigt "keine" bei fehlenden ghost_helpers', () => {
      const s: Section = {...section, ghost_helpers: undefined}
      const hbs = generatePlaceholderPartial(s)
      expect(hbs).to.contain('Ghost Helpers: keine')
    })

    it('rendert <section> mit s-placeholder Klasse', () => {
      const hbs = generatePlaceholderPartial(section)
      expect(hbs).to.contain('class="s-placeholder"')
    })
  })

  describe('indexRegistry (pure)', () => {
    it('baut id → section Map', () => {
      const reg = {
        sections: [
          {category: 'hero', id: 'a', label: 'A', partial: 'x.hbs'},
          {category: 'cta', id: 'b', label: 'B', partial: 'y.hbs'},
        ],
      }
      const map = indexRegistry(reg)
      expect(map.a.label).to.equal('A')
      expect(map.b.label).to.equal('B')
    })

    it('leere Sections → leere Map', () => {
      expect(indexRegistry({sections: []})).to.deep.equal({})
    })
  })

  describe('composeSections (I/O via Fixtures)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-compose-test-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('komponiert home.hbs + kopiert echten Partial + schreibt Placeholder + listet Unknown', () => {
      const result = composeSections({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        now: FIXED_NOW,
        outputDir: tmp,
        presetPath: join(FIXTURE_DIR, 'presets', 'testmini.yaml'),
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
      })

      // home.hbs existiert
      expect(existsSync(join(tmp, 'home.hbs'))).to.be.true
      // index.hbs Fallback
      expect(existsSync(join(tmp, 'index.hbs'))).to.be.true

      // hero-mini wurde echt kopiert
      const heroPath = join(tmp, 'partials', 'sections', 'hero', 'hero-mini.hbs')
      expect(existsSync(heroPath)).to.be.true
      expect(readFileSync(heroPath, 'utf8')).to.contain('s-hero-mini')

      // cta-mini als Placeholder
      const ctaPath = join(tmp, 'partials', 'sections', 'cta', 'cta-mini.hbs')
      expect(existsSync(ctaPath)).to.be.true
      expect(readFileSync(ctaPath, 'utf8')).to.contain('s-placeholder')

      // unknown_section erzeugt Warning, aber keinen File
      expect(result.sections).to.deep.equal(['hero_mini', 'cta_mini'])
      expect(result.warnings).to.have.length(2)
      expect(result.warnings).to.include('Unbekannte Section: unknown_section')
      expect(result.warnings.some((w) => w.startsWith('Placeholder: cta_mini'))).to.be.true
      expect(result.ok).to.be.false  // wegen Warnings
    })

    it('wirft BuildError bei fehlendem Preset', () => {
      expect(() => composeSections({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        outputDir: tmp,
        presetPath: '/nonexistent/p.yaml',
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
      })).to.throw(/Preset nicht gefunden/)
    })

    it('wirft BuildError bei fehlender Registry', () => {
      expect(() => composeSections({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        outputDir: tmp,
        presetPath: join(FIXTURE_DIR, 'presets', 'testmini.yaml'),
        registryPath: '/nonexistent/r.json',
      })).to.throw(/Registry nicht gefunden/)
    })
  })
})
