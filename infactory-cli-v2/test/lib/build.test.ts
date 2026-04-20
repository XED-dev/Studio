/**
 * test/lib/build.test.ts — Tests für Build-Pipeline
 *
 * Scope:
 *   - buildPackageJson + buildCustomSettings (pure)
 *   - listPresets (pure)
 *   - buildTheme (Happy-Path via Fixture + ZIP-Pfad)
 *
 * camelcase ESLint: `posts_per_page` folgt Ghost-theme-Schema (external).
 */
/* eslint-disable camelcase */

import {expect} from 'chai'
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {buildCustomSettings, buildPackageJson, buildTheme, listPresets} from '../../src/lib/build.js'

const FIXED_NOW = new Date('2026-04-20T12:00:00Z')
const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/m5-2/', import.meta.url))

describe('lib/build', () => {
  describe('buildCustomSettings (pure)', () => {
    it('mappt Array → Record mit type/default/description Defaults', () => {
      const result = buildCustomSettings([{key: 'foo'}])
      expect(result.foo).to.deep.equal({default: '', description: 'foo', type: 'text'})
    })

    it('übernimmt explizite Werte', () => {
      const result = buildCustomSettings([{
        default: true,
        description: 'Sticky Header',
        key: 'sticky',
        type: 'boolean',
      }])
      expect(result.sticky).to.deep.equal({
        default: true,
        description: 'Sticky Header',
        type: 'boolean',
      })
    })

    it('enthält options wenn gegeben', () => {
      const result = buildCustomSettings([{
        key: 'h',
        options: ['static', 'sticky'],
        type: 'select',
      }])
      expect(result.h.options).to.deep.equal(['static', 'sticky'])
    })

    it('ignoriert Items ohne key', () => {
      const result = buildCustomSettings([{description: 'oops'} as never])
      expect(Object.keys(result)).to.deep.equal([])
    })

    it('leeres Array → leeres Record', () => {
      expect(buildCustomSettings([])).to.deep.equal({})
    })
  })

  describe('buildPackageJson (pure)', () => {
    it('nutzt preset.id für name + custom-Objekt-Key', () => {
      const pkg = buildPackageJson({id: 'agency', name: 'Agency'})
      expect(pkg.name).to.equal('infactory-agency')
    })

    it('posts_per_page default 9', () => {
      const pkg = buildPackageJson({id: 'x'}) as {config: {posts_per_page: number}}
      expect(pkg.config.posts_per_page).to.equal(9)
    })

    it('posts_per_page aus preset.ghost', () => {
      const pkg = buildPackageJson({
        ghost: {posts_per_page: 6},
        id: 'x',
      }) as {config: {posts_per_page: number}}
      expect(pkg.config.posts_per_page).to.equal(6)
    })

    it('image_sizes enthält alle 6 Größen', () => {
      const pkg = buildPackageJson({id: 'x'}) as {config: {image_sizes: Record<string, unknown>}}
      expect(Object.keys(pkg.config.image_sizes).sort())
        .to.deep.equal(['l', 'm', 's', 'xl', 'xs', 'xxs'])
    })

    it('engines.ghost >=5.0.0', () => {
      const pkg = buildPackageJson({id: 'x'}) as {engines: {ghost: string}}
      expect(pkg.engines.ghost).to.equal('>=5.0.0')
    })
  })

  describe('listPresets (pure)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-listpresets-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('fehlendes Verzeichnis → []', () => {
      expect(listPresets(join(tmp, 'nope'))).to.deep.equal([])
    })

    it('listet *.yaml + *.yml ohne Extension, sortiert', () => {
      writeFileSync(join(tmp, 'zeta.yaml'), 'id: z')
      writeFileSync(join(tmp, 'alpha.yml'), 'id: a')
      writeFileSync(join(tmp, 'readme.md'), 'ignore')
      expect(listPresets(tmp)).to.deep.equal(['alpha', 'zeta'])
    })
  })

  describe('buildTheme (Happy-Path via Fixture)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-build-test-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('baut komplettes Theme: tokens.css + home.hbs + package.json + ai-analysis.json', async () => {
      const result = await buildTheme({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        now: FIXED_NOW,
        outputDir: tmp,
        preset: 'testmini',
        presetsDir: join(FIXTURE_DIR, 'presets'),
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
      })

      const themeDir = join(tmp, 'infactory-testmini')
      expect(result.themeDir).to.equal(themeDir)
      expect(existsSync(join(themeDir, 'home.hbs'))).to.be.true
      expect(existsSync(join(themeDir, 'package.json'))).to.be.true
      expect(existsSync(join(themeDir, 'ai-analysis.json'))).to.be.true
      expect(existsSync(join(themeDir, 'assets', 'css', 'tokens.css'))).to.be.true
      // base-theme/default.hbs wurde mitkopiert
      expect(existsSync(join(themeDir, 'default.hbs'))).to.be.true
      // base-theme/assets/css/base.css wurde mitkopiert
      expect(existsSync(join(themeDir, 'assets', 'css', 'base.css'))).to.be.true
    })

    it('elapsed ist number (ms), kein String', async () => {
      const result = await buildTheme({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        now: FIXED_NOW,
        outputDir: tmp,
        preset: 'testmini',
        presetsDir: join(FIXTURE_DIR, 'presets'),
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
      })
      expect(result.elapsed).to.be.a('number')
      expect(result.elapsed).to.be.lessThan(5000)
    })

    it('package.json hat korrekten Preset-Namen + posts_per_page aus YAML', async () => {
      const result = await buildTheme({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        now: FIXED_NOW,
        outputDir: tmp,
        preset: 'testmini',
        presetsDir: join(FIXTURE_DIR, 'presets'),
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
      })

      const pkg = JSON.parse(readFileSync(join(result.themeDir, 'package.json'), 'utf8'))
      expect(pkg.name).to.equal('infactory-testmini')
      expect(pkg.config.posts_per_page).to.equal(6)
      expect(pkg.config.custom.header_style.options).to.deep.equal(['static', 'sticky'])
    })

    it('warnings enthält unknown_section + placeholder für cta_mini', async () => {
      const result = await buildTheme({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        now: FIXED_NOW,
        outputDir: tmp,
        preset: 'testmini',
        presetsDir: join(FIXTURE_DIR, 'presets'),
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
      })
      expect(result.warnings).to.have.length(2)
      expect(result.sections).to.deep.equal(['hero_mini', 'cta_mini'])
    })

    it('zip: true → ZIP-Datei wird erzeugt', async () => {
      const result = await buildTheme({
        baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
        now: FIXED_NOW,
        outputDir: tmp,
        preset: 'testmini',
        presetsDir: join(FIXTURE_DIR, 'presets'),
        registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
        zip: true,
      })
      expect(result.zipPath).to.not.be.null
      expect(existsSync(result.zipPath!)).to.be.true
      expect(statSync(result.zipPath!).size).to.be.greaterThan(100)
    })

    it('wirft BuildError bei unbekanntem Preset', async () => {
      try {
        await buildTheme({
          baseThemeDir: join(FIXTURE_DIR, 'base-theme'),
          now: FIXED_NOW,
          outputDir: tmp,
          preset: 'nope',
          presetsDir: join(FIXTURE_DIR, 'presets'),
          registryPath: join(FIXTURE_DIR, 'sections', 'registry.json'),
        })
        expect.fail('Sollte geworfen haben')
      } catch (error) {
        expect((error as Error).message).to.match(/Preset nicht gefunden/)
        expect((error as Error).message).to.contain('Verfügbar: testmini')
      }
    })
  })
})
