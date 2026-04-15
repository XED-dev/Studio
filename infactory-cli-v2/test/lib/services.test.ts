/**
 * test/lib/services.test.ts — Tests für Multi-Site Service-Orchestrierung
 *
 * Scope:
 *   - resolveInfactoryTargets: Pfade "alle Sites" + "eine Site" + "nicht gefunden"
 *
 * NICHT hier: performServerAction — das ist execSync-Wrapper (systemctl), laut
 * Test-Strategie kein Mocking (Wartungshölle). Live-Test via `infactory server *`.
 * NICHT hier: listTargets — reine Output-Funktion, Wert eines Tests gering.
 */

import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {resolveInfactoryTargets} from '../../src/lib/services.js'

// ── Helper (Pattern aus test/lib/config.test.ts) ───────────────────────────

function setupTmpSiteBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'infactory-services-test-'))
  process.env.INFACTORY_SITE_BASE = base
  return base
}

function teardownTmpSiteBase(base: string): void {
  delete process.env.INFACTORY_SITE_BASE
  rmSync(base, {force: true, recursive: true})
}

interface MockSiteOptions {
  infactory?: boolean
  payload?: boolean
}

function mockSite(base: string, tld: string, options: MockSiteOptions = {}): void {
  const dir = join(base, tld)
  mkdirSync(dir, {recursive: true})

  if (options.infactory) {
    // api_key ist das reale JSON-Feld im Track-A infactory.json-Schema
    // eslint-disable-next-line camelcase
    writeFileSync(join(dir, 'infactory.json'), JSON.stringify({api_key: 'test', port: 4368}))
  }

  if (options.payload) {
    writeFileSync(join(dir, 'studio-payload.env'), 'PAYLOAD_SECRET=test\n')
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('lib/services', () => {
  describe('resolveInfactoryTargets', () => {
    let base: string

    beforeEach(() => {
      base = setupTmpSiteBase()
    })

    afterEach(() => {
      teardownTmpSiteBase(base)
    })

    it('ohne TLD: gibt leeres Array wenn keine Sites konfiguriert', () => {
      const targets = resolveInfactoryTargets()
      expect(targets).to.deep.equal([])
    })

    it('ohne TLD: listet alle infactory-Sites alphabetisch', () => {
      mockSite(base, 'zeta.at', {infactory: true})
      mockSite(base, 'alpha.at', {infactory: true})
      mockSite(base, 'mu.at', {infactory: true})

      const targets = resolveInfactoryTargets()
      expect(targets).to.not.be.null
      expect(targets?.map((s) => s.tld)).to.deep.equal(['alpha.at', 'mu.at', 'zeta.at'])
    })

    it('ohne TLD: ignoriert Payload-only Sites (ohne infactory.json)', () => {
      mockSite(base, 'payload-only.at', {payload: true})
      mockSite(base, 'both.at', {infactory: true, payload: true})
      mockSite(base, 'infactory-only.at', {infactory: true})

      const targets = resolveInfactoryTargets()
      expect(targets?.map((s) => s.tld)).to.deep.equal(['both.at', 'infactory-only.at'])
    })

    it('mit TLD: gibt genau eine Site wenn infactory.json existiert', () => {
      mockSite(base, 'example.at', {infactory: true})
      mockSite(base, 'other.at', {infactory: true})

      const targets = resolveInfactoryTargets('example.at')
      expect(targets).to.have.length(1)
      expect(targets?.[0].tld).to.equal('example.at')
      expect(targets?.[0].infactoryService).to.equal('infactory-example-at')
    })

    it('mit TLD: gibt null bei unbekannter TLD', () => {
      mockSite(base, 'exists.at', {infactory: true})

      expect(resolveInfactoryTargets('does-not-exist.at')).to.be.null
    })

    it('mit TLD: gibt null bei TLD ohne infactory.json (nur Payload konfiguriert)', () => {
      mockSite(base, 'payload-only.at', {payload: true})

      expect(resolveInfactoryTargets('payload-only.at')).to.be.null
    })

    it('mit TLD: gibt null bei leerem String (wird als "keine TLD" behandelt)', () => {
      // Bewusstes Verhalten: tld = "" wird als falsy gewertet → discoverSites()
      // Wenn keine Sites konfiguriert, leeres Array (nicht null)
      const targets = resolveInfactoryTargets('')
      expect(targets).to.deep.equal([])
    })
  })
})
