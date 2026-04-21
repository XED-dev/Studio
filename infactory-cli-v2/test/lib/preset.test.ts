/**
 * test/lib/preset.test.ts — Tests für Preset-Verwaltung (CLI-M5.6).
 *
 * Pure Helpers + I/O via tmp-dirs. removePreset wird mit --force getestet
 * (auf isolierten tmp-Dateien — kein produktiver Pfad).
 */
/* eslint-disable camelcase -- Preset-Schema nutzt _cloned_from etc. */

import {expect} from 'chai'
import {dump as dumpYaml} from 'js-yaml'
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  applyTokenOverrides,
  clonePreset,
  darken,
  isValidHex,
  listPresetDetails,
  listPresetIds,
  type Preset,
  removePreset,
  toSlug,
  toTitleCase,
  validateSectionList,
} from '../../src/lib/preset.js'

const FIXED_NOW = new Date('2026-04-21T12:00:00Z')

describe('lib/preset', () => {
  describe('toSlug (pure)', () => {
    it('lowercased + Bindestriche', () => {
      expect(toSlug('Mein Cooles Preset')).to.equal('mein-cooles-preset')
    })

    it('Umlaute werden transliteriert', () => {
      expect(toSlug('Süßer Müßiggang')).to.equal('suesser-muessiggang')
    })

    it('Sonderzeichen → Bindestrich', () => {
      expect(toSlug('a@b#c')).to.equal('a-b-c')
    })

    it('mehrfache Bindestriche kollabieren', () => {
      expect(toSlug('a---b')).to.equal('a-b')
    })

    it('leading/trailing Bindestriche entfernt', () => {
      expect(toSlug('---abc---')).to.equal('abc')
    })

    it('nur Sonderzeichen → leer-String', () => {
      expect(toSlug('!@#$')).to.equal('')
    })
  })

  describe('toTitleCase (pure)', () => {
    it('kebab → Title Case', () => {
      expect(toTitleCase('recode-blog')).to.equal('Recode Blog')
    })

    it('snake → Title Case', () => {
      expect(toTitleCase('my_cool_preset')).to.equal('My Cool Preset')
    })

    it('einzelnes Wort wird capitalized', () => {
      expect(toTitleCase('blog')).to.equal('Blog')
    })
  })

  describe('isValidHex (pure)', () => {
    it('akzeptiert #RRGGBB', () => {
      expect(isValidHex('#1a2b3c')).to.be.true
      expect(isValidHex('#FFFFFF')).to.be.true
    })

    it('akzeptiert #RGB', () => {
      expect(isValidHex('#abc')).to.be.true
    })

    it('lehnt ohne # ab', () => {
      expect(isValidHex('1a2b3c')).to.be.false
    })

    it('lehnt zu kurze ab', () => {
      expect(isValidHex('#12')).to.be.false
    })

    it('lehnt zu lange ab', () => {
      expect(isValidHex('#1234567')).to.be.false
    })

    it('lehnt nicht-Hex-Zeichen ab', () => {
      expect(isValidHex('#xxx')).to.be.false
    })
  })

  describe('darken (pure)', () => {
    it('15% Abdunkelung', () => {
      expect(darken('#ffffff', 0.15)).to.equal('#d9d9d9')
    })

    it('Vollabdunkelung → schwarz', () => {
      expect(darken('#ffffff', 1)).to.equal('#000000')
    })

    it('keine Abdunkelung', () => {
      expect(darken('#abcdef', 0)).to.equal('#abcdef')
    })

    it('expandiert #RGB → #RRGGBB', () => {
      expect(darken('#fff', 0.5)).to.equal('#808080')
    })
  })

  describe('applyTokenOverrides (pure)', () => {
    it('color setzt primary + auto-darken hover/active', () => {
      const p: Preset = {id: 'x'}
      applyTokenOverrides(p, {color: '#ff0000'})
      expect(p.tokens?.color?.primary).to.equal('#ff0000')
      expect(p.tokens?.color?.primary_hover).to.equal('#d90000')
      expect(p.tokens?.color?.primary_active).to.equal('#b30000')
    })

    it('wirft PresetError bei invalid hex', () => {
      const p: Preset = {id: 'x'}
      expect(() => applyTokenOverrides(p, {color: 'red'})).to.throw(/Ungültige Farbe/)
    })

    it('font-display + font-body werden gesetzt', () => {
      const p: Preset = {id: 'x'}
      applyTokenOverrides(p, {fontBody: "'Inter'", fontDisplay: "'Boska'"})
      expect(p.tokens?.font?.display).to.equal("'Boska'")
      expect(p.tokens?.font?.body).to.equal("'Inter'")
    })

    it('description wird gesetzt', () => {
      const p: Preset = {id: 'x'}
      applyTokenOverrides(p, {description: 'New desc'})
      expect(p.description).to.equal('New desc')
    })

    it('keine Overrides → keine Mutation außer leeren tokens', () => {
      const p: Preset = {id: 'x'}
      applyTokenOverrides(p, {})
      expect(p.tokens).to.deep.equal({color: {}, font: {}})
    })
  })

  describe('validateSectionList (pure)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-preset-validate-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('parst Comma-Liste, trimmt', () => {
      const result = validateSectionList('a, b, c')
      expect(result).to.deep.equal(['a', 'b', 'c'])
    })

    it('wirft bei leerer Liste', () => {
      expect(() => validateSectionList('  ,  ,  ')).to.throw(/leer oder nur Whitespace/)
    })

    it('akzeptiert wenn Registry alle IDs kennt', () => {
      const reg = join(tmp, 'registry.json')
      writeFileSync(reg, JSON.stringify({sections: [{id: 'hero_x'}, {id: 'cta_y'}]}))
      const result = validateSectionList('hero_x, cta_y', reg)
      expect(result).to.deep.equal(['hero_x', 'cta_y'])
    })

    it('wirft bei unbekannter ID gegen Registry', () => {
      const reg = join(tmp, 'registry.json')
      writeFileSync(reg, JSON.stringify({sections: [{id: 'hero_x'}]}))
      expect(() => validateSectionList('hero_x, fake_z', reg))
        .to.throw(/Unbekannte Section-IDs: fake_z/)
    })

    it('ohne Registry: keine Validation, IDs durch', () => {
      const result = validateSectionList('a, b', null)
      expect(result).to.deep.equal(['a', 'b'])
    })
  })

  describe('listPresetIds + listPresetDetails (I/O)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-preset-list-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('leeres Verzeichnis → leere Liste', () => {
      expect(listPresetIds(tmp)).to.deep.equal([])
      expect(listPresetDetails(tmp)).to.deep.equal([])
    })

    it('listPresetIds findet *.yaml + *.yml, sortiert', () => {
      writeFileSync(join(tmp, 'zeta.yaml'), 'id: z')
      writeFileSync(join(tmp, 'alpha.yml'), 'id: a')
      expect(listPresetIds(tmp)).to.deep.equal(['alpha', 'zeta'])
    })

    it('listPresetDetails parst YAML + zeigt Sections-Count + Klon-Origin', () => {
      writeFileSync(join(tmp, 'a.yaml'), dumpYaml({
        _cloned_from: 'blog',
        icon: '◈',
        id: 'a',
        layout: {home: ['s1', 's2', 's3']},
        name: 'Alpha',
      }))
      const details = listPresetDetails(tmp)
      expect(details).to.have.length(1)
      expect(details[0].name).to.equal('Alpha')
      expect(details[0].sections).to.equal(3)
      expect(details[0].clonedFrom).to.equal('blog')
      expect(details[0].icon).to.equal('◈')
    })

    it('listPresetDetails robust gegen kaputte YAML', () => {
      writeFileSync(join(tmp, 'broken.yaml'), '{ not valid')
      const details = listPresetDetails(tmp)
      expect(details).to.have.length(1)
      expect(details[0].id).to.equal('broken')
      expect(details[0].sections).to.equal(0)
    })
  })

  describe('clonePreset (I/O)', () => {
    let presetsDir: string

    beforeEach(() => {
      presetsDir = mkdtempSync(join(tmpdir(), 'infactory-preset-clone-'))
      writeFileSync(join(presetsDir, 'blog.yaml'), dumpYaml({
        description: 'Blog Preset',
        id: 'blog',
        layout: {home: ['hero_centered', 'posts_grid_3col']},
        name: 'Blog',
        tokens: {color: {primary: '#01696f'}, font: {display: "'Inst'"}},
      }))
    })

    afterEach(() => {
      rmSync(presetsDir, {force: true, recursive: true})
    })

    it('Happy-Path: klont mit neuer ID + Name', () => {
      const result = clonePreset({
        name: 'My Blog',
        now: FIXED_NOW,
        presetsDir,
        sourceId: 'blog',
      })
      expect(result.newId).to.equal('my-blog')
      expect(result.cloned.name).to.equal('My Blog')
      expect(result.cloned._cloned_from).to.equal('blog')
      expect(result.cloned._cloned_at).to.equal(FIXED_NOW.toISOString())
      expect(existsSync(result.presetPath)).to.be.true

      const writtenContent = readFileSync(result.presetPath, 'utf8')
      expect(writtenContent).to.contain('id: my-blog')
    })

    it('color-Override wird angewendet', () => {
      const result = clonePreset({
        color: '#e11d48',
        name: 'Red Blog',
        now: FIXED_NOW,
        presetsDir,
        sourceId: 'blog',
      })
      expect(result.cloned.tokens?.color?.primary).to.equal('#e11d48')
      expect(result.cloned.tokens?.color?.primary_hover).to.exist
    })

    it('wirft bei fehlender Source', () => {
      expect(() => clonePreset({
        name: 'x',
        presetsDir,
        sourceId: 'nonexistent',
      })).to.throw(/Quell-Preset "nonexistent" nicht gefunden/)
    })

    it('wirft bei existierendem Ziel', () => {
      writeFileSync(join(presetsDir, 'my-blog.yaml'), 'id: my-blog')
      expect(() => clonePreset({
        name: 'My Blog',
        presetsDir,
        sourceId: 'blog',
      })).to.throw(/existiert bereits/)
    })

    it('wirft bei leerem Slug-Resultat', () => {
      expect(() => clonePreset({
        name: '!@#',
        presetsDir,
        sourceId: 'blog',
      })).to.throw(/Slug wäre leer/)
    })
  })

  describe('removePreset (I/O — bewusst tmp-only)', () => {
    let presetsDir: string

    beforeEach(() => {
      presetsDir = mkdtempSync(join(tmpdir(), 'infactory-preset-remove-'))
      writeFileSync(join(presetsDir, 'old.yaml'), 'id: old')
    })

    afterEach(() => {
      rmSync(presetsDir, {force: true, recursive: true})
    })

    it('ohne --force: needs_force, Datei bleibt', () => {
      const result = removePreset({presetId: 'old', presetsDir})
      expect(result.reason).to.equal('needs_force')
      expect(result.ok).to.be.false
      expect(existsSync(join(presetsDir, 'old.yaml'))).to.be.true
    })

    it('mit --force: löscht Datei', () => {
      const result = removePreset({force: true, presetId: 'old', presetsDir})
      expect(result.reason).to.equal('removed')
      expect(result.ok).to.be.true
      expect(existsSync(join(presetsDir, 'old.yaml'))).to.be.false
    })

    it('wirft PresetError bei nicht-existierendem Preset', () => {
      expect(() => removePreset({force: true, presetId: 'ghost', presetsDir}))
        .to.throw(/Preset "ghost" nicht gefunden/)
    })
  })
})
