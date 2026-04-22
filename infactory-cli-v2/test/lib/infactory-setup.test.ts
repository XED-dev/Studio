import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  detectWordOpsSites,
  generateApiKey,
  generateInfactoryConfig,
  readExistingApiKey,
  renderInfactoryUnit,
} from '../../src/lib/infactory-setup.js'

// ── Helpers ────────────────────────────────────────────────────────────────

function mkTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'infactory-setup-test-'))
}

function createWordOpsSite(base: string, hostname: string): void {
  mkdirSync(join(base, hostname, 'htdocs'), {recursive: true})
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('lib/infactory-setup', () => {
  describe('detectWordOpsSites', () => {
    let wwwBase: string

    beforeEach(() => {
      wwwBase = mkTmpDir()
    })

    afterEach(() => {
      rmSync(wwwBase, {force: true, recursive: true})
    })

    it('gibt leeres Array zurück wenn wwwBase nicht existiert', () => {
      rmSync(wwwBase, {force: true, recursive: true})
      expect(detectWordOpsSites('example.at', wwwBase)).to.deep.equal([])
    })

    it('gibt leeres Array zurück wenn keine passenden Sites', () => {
      createWordOpsSite(wwwBase, 'other.com')
      expect(detectWordOpsSites('example.at', wwwBase)).to.deep.equal([])
    })

    it('erkennt Root-Domain', () => {
      createWordOpsSite(wwwBase, 'example.at')
      const sites = detectWordOpsSites('example.at', wwwBase)
      expect(sites).to.have.length(1)
      expect(sites[0].name).to.equal('root')
      expect(sites[0].webroot).to.equal(join(wwwBase, 'example.at', 'htdocs') + '/')
    })

    it('erkennt Subdomains', () => {
      createWordOpsSite(wwwBase, 'jam.example.at')
      const sites = detectWordOpsSites('example.at', wwwBase)
      expect(sites).to.have.length(1)
      expect(sites[0].name).to.equal('jam')
    })

    it('konvertiert Punkte in Subdomain-Namen zu Unterstrichen', () => {
      createWordOpsSite(wwwBase, 'dev.sub.example.at')
      const sites = detectWordOpsSites('example.at', wwwBase)
      expect(sites).to.have.length(1)
      expect(sites[0].name).to.equal('dev_sub')
    })

    it('findet mehrere Sites alphabetisch sortiert', () => {
      createWordOpsSite(wwwBase, 'xed.example.at')
      createWordOpsSite(wwwBase, 'arv.example.at')
      createWordOpsSite(wwwBase, 'example.at')
      const names = detectWordOpsSites('example.at', wwwBase).map((s) => s.name)
      expect(names).to.deep.equal(['arv', 'root', 'xed'])
    })

    it('ignoriert Verzeichnisse ohne htdocs/', () => {
      mkdirSync(join(wwwBase, 'jam.example.at'))
      expect(detectWordOpsSites('example.at', wwwBase)).to.deep.equal([])
    })
  })

  describe('generateApiKey', () => {
    it('erzeugt 64-hex-char String', () => {
      const key = generateApiKey()
      expect(key).to.match(/^[\da-f]{64}$/)
    })

    it('erzeugt unterschiedliche Keys bei jedem Aufruf', () => {
      expect(generateApiKey()).to.not.equal(generateApiKey())
    })
  })

  describe('readExistingApiKey', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = mkTmpDir()
    })

    afterEach(() => {
      rmSync(tmpDir, {force: true, recursive: true})
    })

    it('gibt null zurück wenn Datei fehlt', () => {
      expect(readExistingApiKey(join(tmpDir, 'nope.json'))).to.be.null
    })

    it('gibt null zurück bei kaputtem JSON', () => {
      const p = join(tmpDir, 'bad.json')
      writeFileSync(p, '{ not valid')
      expect(readExistingApiKey(p)).to.be.null
    })

    it('gibt null zurück wenn api_key kein 64-hex ist', () => {
      const p = join(tmpDir, 'short.json')
      writeFileSync(p, '{"api_key": "too-short"}')
      expect(readExistingApiKey(p)).to.be.null
    })

    it('gibt gültigen 64-hex Key zurück', () => {
      const p = join(tmpDir, 'valid.json')
      const key = 'a'.repeat(64)
      writeFileSync(p, `{"api_key": "${key}"}`)
      expect(readExistingApiKey(p)).to.equal(key)
    })
  })

  describe('generateInfactoryConfig', () => {
    it('erzeugt Config mit allen Pflicht-Feldern', () => {
      const config = generateInfactoryConfig({
        existingApiKey: 'b'.repeat(64),
        installDir: '/opt/infactory',
        port: 4368,
        sites: [{name: 'jam', webroot: '/var/www/jam.example.at/htdocs/'}],
        tld: 'example.at',
      })
      expect(config.domain).to.equal('example.at')
      expect(config.infactory_port).to.equal(4368)
      expect(config.api_key).to.equal('b'.repeat(64))
      expect(config.nginx_sites).to.have.property('jam')
      expect(config.nginx_sites.jam.webroot).to.equal('/var/www/jam.example.at/htdocs/')
      expect(config.version).to.equal('1.3.0')
      expect(config.auto_sleep_minutes).to.equal(360)
    })

    it('generiert neuen API-Key wenn kein bestehender übergeben', () => {
      const config = generateInfactoryConfig({
        installDir: '/opt/infactory',
        port: 4368,
        sites: [],
        tld: 'example.at',
      })
      expect(config.api_key).to.match(/^[\da-f]{64}$/)
    })

    it('mapped mehrere Sites korrekt in nginx_sites', () => {
      const config = generateInfactoryConfig({
        installDir: '/opt/infactory',
        port: 4368,
        sites: [
          {name: 'root', webroot: '/var/www/example.at/htdocs/'},
          {name: 'jam', webroot: '/var/www/jam.example.at/htdocs/'},
        ],
        tld: 'example.at',
      })
      expect(Object.keys(config.nginx_sites)).to.have.length(2)
      expect(config.nginx_sites).to.have.all.keys('root', 'jam')
    })
  })

  describe('renderInfactoryUnit', () => {
    const fixture = {
      cfgFile: '/var/xed/example.at/infactory.json',
      installDir: '/opt/infactory',
      siteDir: '/var/xed/example.at',
      tld: 'example.at',
    }

    it('enthält alle drei systemd-Sektionen', () => {
      const unit = renderInfactoryUnit(fixture)
      expect(unit).to.contain('[Unit]')
      expect(unit).to.contain('[Service]')
      expect(unit).to.contain('[Install]')
    })

    it('setzt TLD in Description', () => {
      const unit = renderInfactoryUnit(fixture)
      expect(unit).to.contain('Description=inFactory Server — Track A (example.at)')
    })

    it('setzt ExecStart auf infactory-server/src/index.js', () => {
      const unit = renderInfactoryUnit(fixture)
      expect(unit).to.contain('ExecStart=/usr/bin/node /opt/infactory/infactory-server/src/index.js')
    })

    it('setzt INFACTORY_CONFIG Env', () => {
      const unit = renderInfactoryUnit(fixture)
      expect(unit).to.contain('Environment=INFACTORY_CONFIG=/var/xed/example.at/infactory.json')
    })

    it('setzt PLAYWRIGHT_BROWSERS_PATH', () => {
      const unit = renderInfactoryUnit(fixture)
      expect(unit).to.contain('Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/infactory/browsers')
    })

    it('läuft als g-host', () => {
      const unit = renderInfactoryUnit(fixture)
      expect(unit).to.contain('User=g-host')
      expect(unit).to.contain('Group=g-host')
    })

    it('Snapshot — Full Unit-File', () => {
      const expected = `[Unit]
Description=inFactory Server — Track A (example.at)
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=/var/xed/example.at
ExecStart=/usr/bin/node /opt/infactory/infactory-server/src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=INFACTORY_CONFIG=/var/xed/example.at/infactory.json
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/infactory/browsers

[Install]
WantedBy=multi-user.target
`
      expect(renderInfactoryUnit(fixture)).to.equal(expected)
    })
  })
})
