import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  computePayloadPort,
  discoverSites,
  findSite,
  PORT_INFACTORY,
  PORT_PAYLOAD,
  readInfactoryConfig,
  SERVICE_PREFIX_INFACTORY,
  SERVICE_PREFIX_PAYLOAD,
  tldToServiceName,
} from '../../src/lib/config.js'

// ── Helper: tmp /var/xed/ mit Fixtures aufbauen ────────────────────────────

function setupTmpSiteBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'infactory-cli-test-'))
  process.env.INFACTORY_SITE_BASE = base
  return base
}

function teardownTmpSiteBase(base: string): void {
  delete process.env.INFACTORY_SITE_BASE
  rmSync(base, {force: true, recursive: true})
}

interface MockSiteOptions {
  infactory?: {apiKey?: string; port?: number;}
  payload?: boolean
}

function mockSite(base: string, tld: string, options: MockSiteOptions = {}): void {
  const dir = join(base, tld)
  mkdirSync(dir, {recursive: true})

  if (options.infactory) {
    writeFileSync(
      join(dir, 'infactory.json'),
      JSON.stringify({
        // eslint-disable-next-line camelcase -- matches real infactory.json schema (Python legacy)
        api_key: options.infactory.apiKey ?? 'test-key',
        port: options.infactory.port ?? PORT_INFACTORY,
      }),
    )
  }

  if (options.payload) {
    writeFileSync(join(dir, 'studio-payload.env'), 'PAYLOAD_SECRET=test\n')
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('lib/config', () => {
  describe('tldToServiceName (pure)', () => {
    it('ersetzt Punkte durch Bindestriche', () => {
      expect(tldToServiceName('infactory', 'example.com')).to.equal('infactory-example-com')
    })

    it('funktioniert mit mehrstufigen Subdomains', () => {
      expect(tldToServiceName('studio-payload', 'sub.example.co.uk'))
        .to.equal('studio-payload-sub-example-co-uk')
    })

    it('ohne Punkte bleibt unverändert (minus Prefix)', () => {
      expect(tldToServiceName('infactory', 'localhost')).to.equal('infactory-localhost')
    })
  })

  describe('discoverSites (mit tmp-dir)', () => {
    let base: string

    beforeEach(() => {
      base = setupTmpSiteBase()
    })

    afterEach(() => {
      teardownTmpSiteBase(base)
    })

    it('gibt leeres Array zurück wenn /var/xed/ nicht existiert', () => {
      rmSync(base, {force: true, recursive: true})
      const sites = discoverSites()
      expect(sites).to.deep.equal([])
    })

    it('gibt leeres Array zurück bei leerem Basis-Verzeichnis', () => {
      expect(discoverSites()).to.deep.equal([])
    })

    it('ignoriert Verzeichnisse ohne Config-Dateien', () => {
      mkdirSync(join(base, 'leer.com'))
      expect(discoverSites()).to.deep.equal([])
    })

    it('findet Site mit nur infactory.json', () => {
      mockSite(base, 'example.com', {infactory: {port: 4368}})
      const sites = discoverSites()
      expect(sites).to.have.length(1)
      expect(sites[0].tld).to.equal('example.com')
      expect(sites[0].hasInfactory).to.be.true
      expect(sites[0].hasPayload).to.be.false
      expect(sites[0].infactoryPort).to.equal(4368)
      expect(sites[0].infactoryService).to.equal('infactory-example-com')
    })

    it('findet Site mit nur studio-payload.env', () => {
      mockSite(base, 'example.com', {payload: true})
      const sites = discoverSites()
      expect(sites).to.have.length(1)
      expect(sites[0].hasInfactory).to.be.false
      expect(sites[0].hasPayload).to.be.true
      expect(sites[0].payloadService).to.equal('studio-payload-example-com')
    })

    it('findet mehrere Sites alphabetisch sortiert', () => {
      mockSite(base, 'zeta.at', {infactory: {}})
      mockSite(base, 'alpha.at', {infactory: {}})
      mockSite(base, 'mu.at', {infactory: {}})

      const sites = discoverSites()
      expect(sites.map((s) => s.tld)).to.deep.equal(['alpha.at', 'mu.at', 'zeta.at'])
    })

    it('liest infactory Port aus infactory.json statt Default', () => {
      mockSite(base, 'example.com', {infactory: {port: 9999}})
      const sites = discoverSites()
      expect(sites[0].infactoryPort).to.equal(9999)
    })

    it('fällt zurück auf PORT_INFACTORY wenn port-Feld fehlt', () => {
      mkdirSync(join(base, 'example.com'))
      writeFileSync(join(base, 'example.com', 'infactory.json'), '{}')
      const sites = discoverSites()
      expect(sites[0].infactoryPort).to.equal(PORT_INFACTORY)
    })
  })

  describe('findSite (mit tmp-dir)', () => {
    let base: string

    beforeEach(() => {
      base = setupTmpSiteBase()
    })

    afterEach(() => {
      teardownTmpSiteBase(base)
    })

    it('gibt null bei unbekannter TLD', () => {
      expect(findSite('ghost.at')).to.be.null
    })

    it('findet existierende Site', () => {
      mockSite(base, 'real.at', {infactory: {}})
      const site = findSite('real.at')
      expect(site).to.not.be.null
      expect(site?.tld).to.equal('real.at')
    })
  })

  describe('readInfactoryConfig (mit tmp-dir)', () => {
    let base: string

    beforeEach(() => {
      base = setupTmpSiteBase()
    })

    afterEach(() => {
      teardownTmpSiteBase(base)
    })

    it('gibt null bei fehlender Datei', () => {
      expect(readInfactoryConfig('ghost.at')).to.be.null
    })

    it('gibt null bei kaputtem JSON (kein Crash)', () => {
      mkdirSync(join(base, 'broken.at'))
      writeFileSync(join(base, 'broken.at', 'infactory.json'), '{ not valid json')
      expect(readInfactoryConfig('broken.at')).to.be.null
    })

    it('parsed gültige Config', () => {
      mockSite(base, 'example.com', {infactory: {apiKey: 'hex-key', port: 4368}})
      const config = readInfactoryConfig('example.com')
      expect(config).to.not.be.null
      expect(config?.port).to.equal(4368)
      expect(config?.api_key).to.equal('hex-key')
    })
  })

  describe('computePayloadPort (mit tmp-dir)', () => {
    let base: string

    beforeEach(() => {
      base = setupTmpSiteBase()
    })

    afterEach(() => {
      teardownTmpSiteBase(base)
    })

    it('gibt PORT_PAYLOAD zurück wenn /var/xed/ leer ist', () => {
      expect(computePayloadPort('new.at')).to.equal(PORT_PAYLOAD)
    })

    it('gibt PORT_PAYLOAD + 0 für erste Payload-Site (alphabetisch)', () => {
      mockSite(base, 'alpha.at', {payload: true})
      expect(computePayloadPort('alpha.at')).to.equal(PORT_PAYLOAD)
    })

    it('gibt PORT_PAYLOAD + n für n-te Payload-Site', () => {
      mockSite(base, 'alpha.at', {payload: true})
      mockSite(base, 'beta.at', {payload: true})
      mockSite(base, 'gamma.at', {payload: true})

      expect(computePayloadPort('alpha.at')).to.equal(PORT_PAYLOAD)
      expect(computePayloadPort('beta.at')).to.equal(PORT_PAYLOAD + 1)
      expect(computePayloadPort('gamma.at')).to.equal(PORT_PAYLOAD + 2)
    })

    it('neue TLD bekommt nächsten freien Port (alphabetischer Index)', () => {
      mockSite(base, 'alpha.at', {payload: true})
      mockSite(base, 'beta.at', {payload: true})
      // "neu.at" ist noch nicht angelegt → nächster freier = PORT_PAYLOAD + 2
      expect(computePayloadPort('neu.at')).to.equal(PORT_PAYLOAD + 2)
    })

    it('ignoriert Sites ohne studio-payload.env beim Zählen', () => {
      mockSite(base, 'alpha.at', {infactory: {}})  // kein payload
      mockSite(base, 'beta.at', {payload: true})
      expect(computePayloadPort('beta.at')).to.equal(PORT_PAYLOAD)
    })
  })

  describe('Konstanten', () => {
    it('PORT_INFACTORY = 4368 (Projekt-Standard)', () => {
      expect(PORT_INFACTORY).to.equal(4368)
    })

    it('PORT_PAYLOAD = 5368 (Track-A + 1000)', () => {
      expect(PORT_PAYLOAD).to.equal(5368)
    })

    it('SERVICE_PREFIX_INFACTORY = "infactory"', () => {
      expect(SERVICE_PREFIX_INFACTORY).to.equal('infactory')
    })

    it('SERVICE_PREFIX_PAYLOAD = "studio-payload"', () => {
      expect(SERVICE_PREFIX_PAYLOAD).to.equal('studio-payload')
    })
  })
})
