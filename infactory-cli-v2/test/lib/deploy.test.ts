/**
 * test/lib/deploy.test.ts — Tests für Deploy-Pipeline
 *
 * Scope:
 *   - resolveDeployConfig: CLI > ENV > .infactory.json
 *   - validateDeployOptions: preset/URL/Key, Key-Format via parseAdminKey
 *   - findZipPath: explicit, default, fail
 *   - extractThemeName: mit Response, ohne Response
 *
 * HTTP-Calls (uploadTheme/activateTheme) werden NICHT getestet — live-Test auf
 * Server, wie die übrige ghost-api-Strategie.
 *
 * Credential-Safety: Tests verwenden nur Dummy-Keys `deadbeef:cafebabe12345678`.
 */

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  extractThemeName,
  findZipPath,
  resolveDeployConfig,
  validateDeployOptions,
} from '../../src/lib/deploy.js'

const DUMMY_KEY = 'deadbeef:cafebabe12345678'

describe('lib/deploy', () => {
  describe('resolveDeployConfig', () => {
    let cwd: string

    beforeEach(() => {
      cwd = mkdtempSync(join(tmpdir(), 'infactory-deploy-cfg-'))
    })

    afterEach(() => {
      rmSync(cwd, {force: true, recursive: true})
    })

    it('CLI-Flag hat höchste Priorität (schlägt ENV und Config)', () => {
      writeFileSync(
        join(cwd, '.infactory.json'),
        JSON.stringify({deploy: {key: 'fromconfig:xxx', url: 'https://from-config.test'}}),
      )
      const env = {INFACTORY_GHOST_KEY: 'fromenv:yyy', INFACTORY_GHOST_URL: 'https://from-env.test'}
      const result = resolveDeployConfig(
        {adminKey: DUMMY_KEY, ghostUrl: 'https://from-cli.test'},
        cwd,
        env,
      )
      expect(result.ghostUrl).to.equal('https://from-cli.test')
      expect(result.adminKey).to.equal(DUMMY_KEY)
    })

    it('ENV als Fallback wenn CLI leer', () => {
      const env = {INFACTORY_GHOST_KEY: DUMMY_KEY, INFACTORY_GHOST_URL: 'https://from-env.test'}
      const result = resolveDeployConfig({}, cwd, env)
      expect(result.ghostUrl).to.equal('https://from-env.test')
      expect(result.adminKey).to.equal(DUMMY_KEY)
    })

    it('.infactory.json als letzter Fallback', () => {
      writeFileSync(
        join(cwd, '.infactory.json'),
        JSON.stringify({deploy: {key: DUMMY_KEY, url: 'https://from-config.test'}}),
      )
      const result = resolveDeployConfig({}, cwd, {})
      expect(result.ghostUrl).to.equal('https://from-config.test')
      expect(result.adminKey).to.equal(DUMMY_KEY)
    })

    it('nichts gefunden → beide null', () => {
      const result = resolveDeployConfig({}, cwd, {})
      expect(result.ghostUrl).to.be.null
      expect(result.adminKey).to.be.null
    })

    it('kaputtes .infactory.json → ignoriert, nicht crash', () => {
      writeFileSync(join(cwd, '.infactory.json'), '{ not valid json')
      const result = resolveDeployConfig({}, cwd, {})
      expect(result.ghostUrl).to.be.null
    })
  })

  describe('validateDeployOptions', () => {
    it('wirft bei fehlendem preset', () => {
      expect(() => validateDeployOptions(null, {adminKey: DUMMY_KEY, ghostUrl: 'https://x.test'}))
        .to.throw(/--preset fehlt/)
    })

    it('wirft bei fehlender ghostUrl', () => {
      expect(() => validateDeployOptions('agency', {adminKey: DUMMY_KEY, ghostUrl: null}))
        .to.throw(/--ghost-url fehlt/)
    })

    it('wirft bei fehlender adminKey', () => {
      expect(() => validateDeployOptions('agency', {adminKey: null, ghostUrl: 'https://x.test'}))
        .to.throw(/--admin-key fehlt/)
    })

    it('wirft bei invalid Key-Format (via parseAdminKey) — Key nicht in Message', () => {
      try {
        validateDeployOptions('agency', {adminKey: 'invalidformat', ghostUrl: 'https://x.test'})
        expect.fail('Sollte geworfen haben')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.match(/Ungültiges Admin-Key-Format/)
        expect(message).to.not.contain('invalidformat')  // Key-Leak-Schutz
      }
    })

    it('gibt normalisierte GhostConfig zurück bei validem Input', () => {
      const result = validateDeployOptions('agency', {
        adminKey: DUMMY_KEY,
        ghostUrl: 'https://mein.blog///',
      })
      expect(result.url).to.equal('https://mein.blog')  // trailing slash entfernt
      expect(result.adminKey).to.equal(DUMMY_KEY)
    })
  })

  describe('findZipPath', () => {
    let outputDir: string

    beforeEach(() => {
      outputDir = mkdtempSync(join(tmpdir(), 'infactory-deploy-zip-'))
    })

    afterEach(() => {
      rmSync(outputDir, {force: true, recursive: true})
    })

    it('explicit Pfad wird genutzt wenn existiert', () => {
      const explicit = join(outputDir, 'custom.zip')
      writeFileSync(explicit, 'fake zip')
      expect(findZipPath('agency', outputDir, explicit)).to.equal(explicit)
    })

    it('explicit Pfad fehlt → wirft klar', () => {
      expect(() => findZipPath('agency', outputDir, '/nope/x.zip'))
        .to.throw(/ZIP nicht gefunden: \/nope\/x\.zip/)
    })

    it('default location `<outputDir>/infactory-<preset>.zip` wird gefunden', () => {
      const expected = join(outputDir, 'infactory-agency.zip')
      writeFileSync(expected, 'fake zip')
      expect(findZipPath('agency', outputDir)).to.equal(expected)
    })

    it('weder explicit noch default → wirft mit Build-Hinweis', () => {
      expect(() => findZipPath('agency', outputDir))
        .to.throw(/infactory build --preset=agency --zip/)
    })
  })

  describe('extractThemeName', () => {
    it('nimmt themes[0].name aus Response', () => {
      expect(extractThemeName({themes: [{name: 'infactory-custom'}]}, 'agency'))
        .to.equal('infactory-custom')
    })

    it('fällt auf infactory-<preset> zurück bei fehlender Response', () => {
      expect(extractThemeName(null, 'agency')).to.equal('infactory-agency')
    })

    it('fällt zurück bei leerem themes-Array', () => {
      expect(extractThemeName({themes: []}, 'saas')).to.equal('infactory-saas')
    })

    it('fällt zurück bei fehlendem name-Feld', () => {
      expect(extractThemeName({themes: [{}]}, 'blog')).to.equal('infactory-blog')
    })
  })
})
