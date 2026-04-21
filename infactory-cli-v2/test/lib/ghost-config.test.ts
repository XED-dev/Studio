/**
 * test/lib/ghost-config.test.ts — Tests für Geteilte Ghost-Credential-Resolution.
 *
 * Migration aus deploy.test.ts (M5.5 Refactor): die Resolve-Logik lebt jetzt
 * in lib/ghost-config.ts und wird von deploy + images genutzt.
 */

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {requireValidCredentials, resolveGhostConfig} from '../../src/lib/ghost-config.js'

const DUMMY_KEY = 'deadbeef:cafebabe12345678'

describe('lib/ghost-config', () => {
  describe('resolveGhostConfig', () => {
    let cwd: string

    beforeEach(() => {
      cwd = mkdtempSync(join(tmpdir(), 'infactory-ghost-cfg-'))
    })

    afterEach(() => {
      rmSync(cwd, {force: true, recursive: true})
    })

    it('CLI-Flag schlägt ENV und .infactory.json', () => {
      writeFileSync(
        join(cwd, '.infactory.json'),
        JSON.stringify({deploy: {key: 'fromcfg:xx', url: 'https://cfg.test'}}),
      )
      const env = {INFACTORY_GHOST_KEY: 'fromenv:yy', INFACTORY_GHOST_URL: 'https://env.test'}
      const result = resolveGhostConfig({adminKey: DUMMY_KEY, ghostUrl: 'https://cli.test'}, cwd, env)
      expect(result.ghostUrl).to.equal('https://cli.test')
      expect(result.adminKey).to.equal(DUMMY_KEY)
    })

    it('ENV als Fallback', () => {
      const env = {INFACTORY_GHOST_KEY: DUMMY_KEY, INFACTORY_GHOST_URL: 'https://env.test'}
      const result = resolveGhostConfig({}, cwd, env)
      expect(result.ghostUrl).to.equal('https://env.test')
    })

    it('.infactory.json als letzter Fallback', () => {
      writeFileSync(
        join(cwd, '.infactory.json'),
        JSON.stringify({deploy: {key: DUMMY_KEY, url: 'https://cfg.test'}}),
      )
      const result = resolveGhostConfig({}, cwd, {})
      expect(result.ghostUrl).to.equal('https://cfg.test')
    })

    it('alles leer → null/null', () => {
      const result = resolveGhostConfig({}, cwd, {})
      expect(result.ghostUrl).to.be.null
      expect(result.adminKey).to.be.null
    })

    it('kaputtes JSON wird ignoriert (kein Crash)', () => {
      writeFileSync(join(cwd, '.infactory.json'), '{not valid')
      expect(resolveGhostConfig({}, cwd, {}).ghostUrl).to.be.null
    })
  })

  describe('requireValidCredentials', () => {
    it('wirft generischen Error bei fehlender ghostUrl', () => {
      expect(() => requireValidCredentials({adminKey: DUMMY_KEY, ghostUrl: null}))
        .to.throw(/--ghost-url fehlt/)
    })

    it('wirft generischen Error bei fehlendem adminKey', () => {
      expect(() => requireValidCredentials({adminKey: null, ghostUrl: 'https://x.test'}))
        .to.throw(/--admin-key fehlt/)
    })

    it('wirft via errorFactory mit konkreter Klasse', () => {
      class TestError extends Error { name = 'TestError' }
      expect(() => requireValidCredentials({adminKey: null, ghostUrl: 'https://x.test'}, (m) => new TestError(m)))
        .to.throw(TestError, /--admin-key fehlt/)
    })

    it('Key wird NICHT in Error-Message geleakt', () => {
      try {
        requireValidCredentials({adminKey: 'invalidformat', ghostUrl: 'https://x.test'})
        expect.fail('sollte werfen')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.match(/Ungültiges Admin-Key-Format/)
        expect(message).to.not.contain('invalidformat')
      }
    })

    it('valid → normalisierte URL (trailing slash entfernt)', () => {
      const result = requireValidCredentials({adminKey: DUMMY_KEY, ghostUrl: 'https://x.test///'})
      expect(result.url).to.equal('https://x.test')
      expect(result.adminKey).to.equal(DUMMY_KEY)
    })
  })
})
