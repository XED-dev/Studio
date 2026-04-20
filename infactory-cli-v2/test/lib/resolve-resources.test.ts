/**
 * test/lib/resolve-resources.test.ts — Tests für Default-Lookup.
 *
 * Testet via DI (`cwd` + `legacyCliDir` als Optionen), kein process.chdir.
 */

import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {resolveRegistryPath, resolveResourcePath} from '../../src/lib/resolve-resources.js'

describe('lib/resolve-resources', () => {
  let cwd: string
  let legacyCliDir: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'infactory-resolve-cwd-'))
    legacyCliDir = mkdtempSync(join(tmpdir(), 'infactory-resolve-legacy-'))
  })

  afterEach(() => {
    rmSync(cwd, {force: true, recursive: true})
    rmSync(legacyCliDir, {force: true, recursive: true})
  })

  describe('resolveResourcePath', () => {
    it('explicit Pfad wird direkt zurückgegeben, auch wenn er nicht existiert', () => {
      const result = resolveResourcePath('/foo/does-not-exist/presets', 'presets', {cwd, legacyCliDir})
      expect(result).to.equal('/foo/does-not-exist/presets')
    })

    it('CWD hat Vorrang vor legacyCliDir (beide befüllt — echter Präzedenz-Test)', () => {
      mkdirSync(join(cwd, 'presets'))
      mkdirSync(join(legacyCliDir, 'presets'))

      const result = resolveResourcePath(undefined, 'presets', {cwd, legacyCliDir})
      expect(result).to.equal(join(cwd, 'presets'))
    })

    it('legacyCliDir als Fallback wenn CWD leer', () => {
      mkdirSync(join(legacyCliDir, 'base-theme'))

      const result = resolveResourcePath(undefined, 'base-theme', {cwd, legacyCliDir})
      expect(result).to.equal(join(legacyCliDir, 'base-theme'))
    })

    it('wirft BuildError mit beiden Pfaden in der Message wenn nichts gefunden', () => {
      expect(() => resolveResourcePath(undefined, 'sections', {cwd, legacyCliDir}))
        .to.throw(/Kein sections\/-Verzeichnis gefunden/)

      try {
        resolveResourcePath(undefined, 'sections', {cwd, legacyCliDir})
        expect.fail('Sollte geworfen haben')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.contain(join(cwd, 'sections'))
        expect(message).to.contain(join(legacyCliDir, 'sections'))
        expect(message).to.contain('--sections=')
      }
    })
  })

  describe('resolveRegistryPath', () => {
    it('explicit Pfad wird direkt zurückgegeben', () => {
      const result = resolveRegistryPath('/foo/custom-registry.json', {cwd, legacyCliDir})
      expect(result).to.equal('/foo/custom-registry.json')
    })

    it('hängt registry.json an aufgelöstes sections/ an', () => {
      mkdirSync(join(cwd, 'sections'))
      const result = resolveRegistryPath(undefined, {cwd, legacyCliDir})
      expect(result).to.equal(join(cwd, 'sections', 'registry.json'))
    })

    it('wirft BuildError wenn sections/ nirgendwo gefunden wird', () => {
      expect(() => resolveRegistryPath(undefined, {cwd, legacyCliDir}))
        .to.throw(/Kein sections\/-Verzeichnis gefunden/)
    })
  })
})
