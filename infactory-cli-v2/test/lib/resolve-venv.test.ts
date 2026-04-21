/**
 * test/lib/resolve-venv.test.ts — Tests für venv- und Python-Script-Resolver.
 *
 * Testet via DI (`cwd`, `legacyCliDir`, `env`) — kein echter FS-venv nötig.
 */

import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {resolvePythonScript, resolveVenv} from '../../src/lib/resolve-venv.js'

function makeFakeVenv(root: string): void {
  mkdirSync(join(root, 'bin'), {recursive: true})
  writeFileSync(join(root, 'bin', 'python3'), '#!/bin/sh\n')
  writeFileSync(join(root, 'bin', 'shot-scraper'), '#!/bin/sh\n')
}

describe('lib/resolve-venv', () => {
  let cwd: string
  let serverVenvDir: string
  let legacyCliDir: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'infactory-venv-cwd-'))
    serverVenvDir = mkdtempSync(join(tmpdir(), 'infactory-venv-server-'))
    legacyCliDir = mkdtempSync(join(tmpdir(), 'infactory-venv-legacy-'))
  })

  afterEach(() => {
    rmSync(cwd, {force: true, recursive: true})
    rmSync(serverVenvDir, {force: true, recursive: true})
    rmSync(legacyCliDir, {force: true, recursive: true})
  })

  describe('resolveVenv', () => {
    it('ENV INFACTORY_VENV hat höchste Priorität', () => {
      const envVenv = mkdtempSync(join(tmpdir(), 'infactory-venv-env-'))
      try {
        makeFakeVenv(envVenv)
        makeFakeVenv(join(cwd, 'venv'))
        makeFakeVenv(serverVenvDir)

        const result = resolveVenv({cwd, env: {INFACTORY_VENV: envVenv}, serverVenvDir})
        expect(result.root).to.equal(envVenv)
        expect(result.python).to.equal(join(envVenv, 'bin', 'python3'))
      } finally {
        rmSync(envVenv, {force: true, recursive: true})
      }
    })

    it('CWD/venv vor serverVenvDir (Präzedenz-Test mit beiden befüllt)', () => {
      makeFakeVenv(join(cwd, 'venv'))
      makeFakeVenv(serverVenvDir)

      const result = resolveVenv({cwd, env: {}, serverVenvDir})
      expect(result.root).to.equal(join(cwd, 'venv'))
    })

    it('serverVenvDir als Fallback wenn CWD/venv leer', () => {
      makeFakeVenv(serverVenvDir)

      const result = resolveVenv({cwd, env: {}, serverVenvDir})
      expect(result.root).to.equal(serverVenvDir)
      expect(result.shotScraper).to.equal(join(serverVenvDir, 'bin', 'shot-scraper'))
    })

    it('wirft QaError wenn kein python3 gefunden — alle Pfade in Message', () => {
      try {
        resolveVenv({cwd, env: {}, serverVenvDir})
        expect.fail('Sollte geworfen haben')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.contain('Kein Python-venv')
        expect(message).to.contain(join(cwd, 'venv', 'bin', 'python3'))
        expect(message).to.contain(join(serverVenvDir, 'bin', 'python3'))
        expect(message).to.contain('INFACTORY_VENV')
      }
    })

    it('nacktes venv ohne python3-Binary wird übersprungen', () => {
      mkdirSync(join(cwd, 'venv', 'bin'), {recursive: true})  // leerer Stub ohne python3
      makeFakeVenv(serverVenvDir)

      const result = resolveVenv({cwd, env: {}, serverVenvDir})
      expect(result.root).to.equal(serverVenvDir)  // Fallback greift
    })
  })

  describe('resolvePythonScript', () => {
    it('findet Script im CWD/src/', () => {
      mkdirSync(join(cwd, 'src'), {recursive: true})
      writeFileSync(join(cwd, 'src', 'extract.py'), '# stub')

      const result = resolvePythonScript('extract.py', {cwd, legacyCliDir})
      expect(result).to.equal(join(cwd, 'src', 'extract.py'))
    })

    it('findet Script in legacyCliDir/src/ als Fallback', () => {
      mkdirSync(join(legacyCliDir, 'src'), {recursive: true})
      writeFileSync(join(legacyCliDir, 'src', 'extract.py'), '# stub')

      const result = resolvePythonScript('extract.py', {cwd, legacyCliDir})
      expect(result).to.equal(join(legacyCliDir, 'src', 'extract.py'))
    })

    it('wirft QaError mit beiden Pfaden wenn Script nirgendwo', () => {
      try {
        resolvePythonScript('missing.py', {cwd, legacyCliDir})
        expect.fail('Sollte geworfen haben')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.contain('Python-Helper-Script "missing.py" nicht gefunden')
        expect(message).to.contain(join(cwd, 'src', 'missing.py'))
        expect(message).to.contain(join(legacyCliDir, 'src', 'missing.py'))
      }
    })
  })
})
