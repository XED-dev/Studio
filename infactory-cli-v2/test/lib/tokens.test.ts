/**
 * test/lib/tokens.test.ts — Tests für Design-Token-Pipeline
 *
 * Scope:
 *   - flattenTokens: flache/verschachtelte/null/array-Inputs
 *   - extractFontName: Parse-Varianten
 *   - deriveFontLinks: Fontshare/Google-Matching + Fallback
 *   - buildTokensCss: deterministisch mit fixem `now`
 *   - resolveTokens: Preset-Priorität
 *   - generateTokens (I/O): tmp-dir + generate → Datei existiert + enthält Marker
 *
 * camelcase ESLint: snake_case Token-Keys sind external contract (CSS).
 */
/* eslint-disable camelcase */
/* eslint-disable perfectionist/sort-objects */

import {expect} from 'chai'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  buildTokensCss,
  deriveFontLinks,
  extractFontName,
  flattenTokens,
  generateTokens,
  resolveTokens,
} from '../../src/lib/tokens.js'

const FIXED_NOW = new Date('2026-04-20T12:00:00Z')

describe('lib/tokens', () => {
  describe('flattenTokens (pure)', () => {
    it('flacht flache Objekte unverändert', () => {
      expect(flattenTokens({a: '1', b: '2'})).to.deep.equal({a: '1', b: '2'})
    })

    it('verkettet verschachtelte Keys mit underscore', () => {
      expect(flattenTokens({color: {primary: '#f00'}}))
        .to.deep.equal({color_primary: '#f00'})
    })

    it('geht rekursiv in tiefere Ebenen', () => {
      expect(flattenTokens({a: {b: {c: 'x'}}}))
        .to.deep.equal({a_b_c: 'x'})
    })

    it('konvertiert Number/Boolean zu String', () => {
      expect(flattenTokens({n: 42, b: true})).to.deep.equal({b: 'true', n: '42'})
    })

    it('behält null-Werte als "null" (via String())', () => {
      expect(flattenTokens({x: null})).to.deep.equal({x: 'null'})
    })

    it('Arrays werden zu String-Casting (kein Recurse)', () => {
      // Preset-Autoren nutzen keine Arrays in tokens — Behavior-Sicherung.
      expect(flattenTokens({arr: ['a', 'b']})).to.deep.equal({arr: 'a,b'})
    })
  })

  describe('extractFontName (pure)', () => {
    it('extrahiert aus single-quoted Font-Name', () => {
      expect(extractFontName("'Satoshi', 'Inter', sans-serif")).to.equal('Satoshi')
    })

    it('extrahiert aus double-quoted Font-Name', () => {
      expect(extractFontName('"Zodiak", serif')).to.equal('Zodiak')
    })

    it('liefert leeren String bei nur-Fallback', () => {
      expect(extractFontName('sans-serif')).to.equal('')
    })

    it('liefert leeren String bei leerem Input', () => {
      expect(extractFontName('')).to.equal('')
    })
  })

  describe('deriveFontLinks (pure)', () => {
    it('Fontshare: erkennt Cabinet Grotesk + Satoshi', () => {
      const links = deriveFontLinks("'Cabinet Grotesk', serif", "'Satoshi', sans-serif")
      expect(links).to.have.length(1)
      expect(links[0].type).to.equal('fontshare')
      expect(links[0].href).to.contain('api.fontshare.com')
      expect(links[0].href).to.contain('cabinet-grotesk@400,500,700')
      expect(links[0].href).to.contain('satoshi@')
    })

    it('Google: erkennt Work Sans', () => {
      const links = deriveFontLinks("'Work Sans', sans-serif", "'Work Sans', sans-serif")
      expect(links).to.have.length(1)
      expect(links[0].type).to.equal('google')
      expect(links[0].href).to.contain('fonts.googleapis.com')
    })

    it('gemischt: Fontshare + Google in separaten Links', () => {
      const links = deriveFontLinks("'Cabinet Grotesk', serif", "'Work Sans', sans-serif")
      expect(links).to.have.length(2)
      expect(links.map((l) => l.type).sort()).to.deep.equal(['fontshare', 'google'])
    })

    it('unbekannte Fonts: leere Liste', () => {
      expect(deriveFontLinks("'Helvetica', sans-serif", "'Arial', sans-serif"))
        .to.deep.equal([])
    })
  })

  describe('buildTokensCss (pure)', () => {
    const light = {color_primary: '#f00', font_body: "'Satoshi'", shadow_sm: '0 1px 2px'}
    const dark = {color_primary: '#0ff', font_body: "'Satoshi'", shadow_sm: '0 1px 3px'}

    it('deterministisch bei fixem `now`', () => {
      const a = buildTokensCss({dark, fontLinks: [], light, now: FIXED_NOW, preset: {id: 'x'}})
      const b = buildTokensCss({dark, fontLinks: [], light, now: FIXED_NOW, preset: {id: 'x'}})
      expect(a).to.equal(b)
    })

    it('Light-Block enthält :root + [data-theme="light"] + primary-Prop', () => {
      const css = buildTokensCss({dark, fontLinks: [], light, now: FIXED_NOW, preset: {id: 'x', name: 'X'}})
      expect(css).to.contain(':root,')
      expect(css).to.contain('[data-theme="light"]')
      expect(css).to.contain('--color-primary: #f00')
    })

    it('Dark-Block enthält nur color_/shadow_ (kein font_)', () => {
      const css = buildTokensCss({dark, fontLinks: [], light, now: FIXED_NOW, preset: {id: 'x'}})
      const darkBlock = css.split('[data-theme="dark"]')[1].split('}')[0]
      expect(darkBlock).to.contain('--color-primary: #0ff')
      expect(darkBlock).to.contain('--shadow-sm: 0 1px 3px')
      expect(darkBlock).to.not.contain('--font-body')
    })

    it('Preset-Header enthält id + name + Datum', () => {
      const css = buildTokensCss({dark, fontLinks: [], light, now: FIXED_NOW, preset: {id: 'agency', name: 'Agency'}})
      expect(css).to.contain('Preset:    Agency (agency)')
      expect(css).to.contain('2026-04-20')
    })

    it('@media prefers-color-scheme: dark enthält dark Tokens mit 4sp Indent', () => {
      const css = buildTokensCss({dark, fontLinks: [], light, now: FIXED_NOW, preset: {id: 'x'}})
      expect(css).to.contain('@media (prefers-color-scheme: dark)')
      expect(css).to.match(/@media[\s\S]+?--color-primary: #0ff/)
    })

    it('Fontshare-Links werden als @import emittiert', () => {
      const fontLinks = [{href: 'https://api.fontshare.com/v2/css?x', name: 'X', type: 'fontshare' as const}]
      const css = buildTokensCss({dark, fontLinks, light, now: FIXED_NOW, preset: {id: 'x'}})
      expect(css).to.contain(`@import url('https://api.fontshare.com/v2/css?x');`)
    })
  })

  describe('resolveTokens (pure)', () => {
    it('base preset: nur BASE_TOKENS', () => {
      const {light} = resolveTokens({id: 'base'})
      expect(light.color_primary).to.equal('#01696f')  // BASE_TOKENS default
    })

    it('agency preset: PRESET_DEFAULTS überschreibt BASE', () => {
      const {light} = resolveTokens({id: 'agency'})
      expect(light.color_primary).to.equal('#1a1a2e')  // PRESET_DEFAULTS
    })

    it('preset.tokens überschreibt PRESET_DEFAULTS', () => {
      const {light} = resolveTokens({
        id: 'agency',
        tokens: {color: {primary: '#abcdef'}},
      })
      expect(light.color_primary).to.equal('#abcdef')
    })

    it('dark primary wird aus PRESET_DARK_PRIMARY_MAP gesetzt', () => {
      const {dark} = resolveTokens({id: 'agency'})
      expect(dark.color_primary).to.equal('#7ec4cc')
    })

    it('fontLinks wird aus aufgelösten Fonts abgeleitet', () => {
      const {fontLinks} = resolveTokens({id: 'saas'})
      // saas nutzt Cabinet Grotesk + Satoshi → Fontshare
      expect(fontLinks.some((f) => f.type === 'fontshare')).to.be.true
    })
  })

  describe('generateTokens (I/O)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-tokens-test-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('schreibt CSS-Datei in outputCssPath', () => {
      const presetPath = join(tmp, 'preset.yaml')
      writeFileSync(presetPath, 'id: blog\nname: Blog\n', 'utf8')
      const outPath = join(tmp, 'out', 'tokens.css')

      const result = generateTokens({now: FIXED_NOW, outputCssPath: outPath, presetPath, verbose: false})

      expect(existsSync(outPath)).to.be.true
      expect(readFileSync(outPath, 'utf8')).to.contain('Preset:    Blog (blog)')
      expect(result.tokensCount).to.be.greaterThan(40)
    })

    it('ohne outputCssPath: kein File, aber CSS im Result', () => {
      const presetPath = join(tmp, 'p.yaml')
      writeFileSync(presetPath, 'id: saas\n', 'utf8')

      const result = generateTokens({now: FIXED_NOW, outputCssPath: null, presetPath, verbose: false})
      expect(result.css).to.contain('--color-primary')
    })

    it('wirft BuildError bei fehlendem Preset', () => {
      expect(() =>
        generateTokens({now: FIXED_NOW, outputCssPath: null, presetPath: '/nonexistent/p.yaml'}),
      ).to.throw(/Preset nicht gefunden/)
    })

    it('erstellt Output-Verzeichnis rekursiv wenn nötig', () => {
      const presetPath = join(tmp, 'p.yaml')
      writeFileSync(presetPath, 'id: blog\n', 'utf8')
      const outPath = join(tmp, 'nested', 'deep', 'tokens.css')
      mkdirSync(join(tmp, 'nested'))  // nur eine Ebene vorhanden

      generateTokens({now: FIXED_NOW, outputCssPath: outPath, presetPath, verbose: false})
      expect(existsSync(outPath)).to.be.true
    })
  })
})
