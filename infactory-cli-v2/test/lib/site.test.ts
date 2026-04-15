/**
 * test/lib/site.test.ts — Tests für pure Funktionen und File-I/O in lib/site.ts
 *
 * Scope:
 *   - genSecret: Länge, Hex-Format, Einzigartigkeit
 *   - defaultSiteEnv: vollständiger Key-Set, korrekte URLs
 *   - readEnv/writeEnv: Roundtrip über tmp-Dateien
 *   - patchMissingEnvVars: Non-Overwrite-Verhalten, Counter
 *
 * NICHT hier: setDbPermissions — ruft chown/chmod auf, braucht Live-Server.
 */

import {expect} from 'chai'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  defaultSiteEnv,
  genSecret,
  patchMissingEnvVars,
  readEnv,
  writeEnv,
} from '../../src/lib/site.js'

describe('lib/site', () => {
  describe('genSecret', () => {
    it('erzeugt 64-hex-char Default-Secret', () => {
      const s = genSecret()
      expect(s).to.have.lengthOf(64)
      expect(s).to.match(/^[\da-f]{64}$/)
    })

    it('respektiert bytes-Parameter', () => {
      expect(genSecret(16)).to.have.lengthOf(32)
      expect(genSecret(8)).to.have.lengthOf(16)
    })

    it('erzeugt unterschiedliche Secrets bei jedem Aufruf', () => {
      const a = genSecret()
      const b = genSecret()
      expect(a).to.not.equal(b)
    })
  })

  describe('defaultSiteEnv', () => {
    const env = defaultSiteEnv('example.at', '/var/xed/example.at')

    it('enthält alle sechs Pflicht-Keys', () => {
      expect(env).to.have.all.keys(
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'DATABASE_URI',
        'NEXT_PUBLIC_BASE_PATH',
        'NEXT_PUBLIC_SERVER_URL',
        'PAYLOAD_SECRET',
      )
    })

    it('URLs werden aus TLD konstruiert', () => {
      expect(env.BETTER_AUTH_URL).to.equal('https://jam.example.at/studio')
      expect(env.NEXT_PUBLIC_SERVER_URL).to.equal('https://jam.example.at/studio')
    })

    it('basePath ist /studio', () => {
      expect(env.NEXT_PUBLIC_BASE_PATH).to.equal('/studio')
    })

    it('DATABASE_URI nutzt siteDir', () => {
      expect(env.DATABASE_URI).to.equal('file:///var/xed/example.at/payload.db')
    })

    it('Secrets sind 64-hex', () => {
      expect(env.PAYLOAD_SECRET).to.match(/^[\da-f]{64}$/)
      expect(env.BETTER_AUTH_SECRET).to.match(/^[\da-f]{64}$/)
    })
  })

  describe('readEnv / writeEnv', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-env-'))
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('Roundtrip: writeEnv → readEnv ergibt identisches Objekt', () => {
      const file = join(tmp, '.env')
      const input = {FOO: 'bar', PORT: '5368', URL: 'https://example.com/'}
      writeEnv(file, input)
      expect(readEnv(file)).to.deep.equal(input)
    })

    it('writeEnv sortiert Keys alphabetisch (stabile Diffs)', () => {
      const file = join(tmp, '.env')
      writeEnv(file, {AAA: '2', MMM: '3', ZZZ: '1'})
      const content = readFileSync(file, 'utf8')
      expect(content).to.equal('AAA=2\nMMM=3\nZZZ=1\n')
    })

    it('readEnv ignoriert Kommentare und Leerzeilen', () => {
      const file = join(tmp, '.env')
      writeFileSync(file, '# Kommentar\nFOO=bar\n\n# noch einer\nBAZ=qux\n')
      expect(readEnv(file)).to.deep.equal({BAZ: 'qux', FOO: 'bar'})
    })

    it('readEnv gibt leeres Objekt bei nicht-existenter Datei', () => {
      expect(readEnv(join(tmp, 'fehlt.env'))).to.deep.equal({})
    })

    it('readEnv behandelt Werte mit =-Zeichen korrekt (nur am ersten = splitten)', () => {
      const file = join(tmp, '.env')
      writeFileSync(file, 'URI=file:///path?key=value&other=x\n')
      expect(readEnv(file).URI).to.equal('file:///path?key=value&other=x')
    })
  })

  describe('patchMissingEnvVars', () => {
    let tmp: string
    let file: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'infactory-patch-'))
      file = join(tmp, 'studio-payload.env')
    })

    afterEach(() => {
      rmSync(tmp, {force: true, recursive: true})
    })

    it('fügt alle drei Keys hinzu wenn keiner existiert', () => {
      writeFileSync(file, 'PAYLOAD_SECRET=xyz\n')
      const count = patchMissingEnvVars(file, 'example.at')
      expect(count).to.equal(3)

      const env = readEnv(file)
      expect(env.NEXT_PUBLIC_BASE_PATH).to.equal('/studio')
      expect(env.BETTER_AUTH_URL).to.equal('https://jam.example.at/studio')
      expect(env.NEXT_PUBLIC_SERVER_URL).to.equal('https://jam.example.at/studio')
      expect(env.PAYLOAD_SECRET).to.equal('xyz') // unverändert
    })

    it('überschreibt existierende Werte nicht', () => {
      writeFileSync(file, 'NEXT_PUBLIC_BASE_PATH=/custom\nBETTER_AUTH_URL=https://other.test/\n')
      const count = patchMissingEnvVars(file, 'example.at')
      expect(count).to.equal(1) // nur NEXT_PUBLIC_SERVER_URL fehlte

      const env = readEnv(file)
      expect(env.NEXT_PUBLIC_BASE_PATH).to.equal('/custom') // unverändert!
      expect(env.BETTER_AUTH_URL).to.equal('https://other.test/') // unverändert!
      expect(env.NEXT_PUBLIC_SERVER_URL).to.equal('https://jam.example.at/studio')
    })

    it('gibt 0 zurück wenn alle Keys bereits da sind', () => {
      writeEnv(file, defaultSiteEnv('example.at', tmp))
      const count = patchMissingEnvVars(file, 'example.at')
      expect(count).to.equal(0)
    })

    it('gibt 0 zurück bei nicht-existenter Datei', () => {
      expect(patchMissingEnvVars(join(tmp, 'fehlt.env'), 'example.at')).to.equal(0)
    })
  })
})
