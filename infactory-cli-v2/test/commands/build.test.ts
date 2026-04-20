/**
 * test/commands/build.test.ts — Smoke-Tests für nativer `infactory build`
 *
 * Kern-Logik ist in lib/build.test.ts getestet. Hier nur oclif-Integration.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/m5-2/', import.meta.url))

describe('build (native command)', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('build --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Ghost-Theme aus Preset')
    expect(stdout).to.contain('USAGE')
  })

  it('USAGE enthält --preset=<value> Flag', async () => {
    const {stdout} = await runCommand('build --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/--preset=<value>/)
  })

  it('exited mit Fehler bei fehlendem --preset', async () => {
    const {error} = await runCommand('build', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/preset.+required|Missing required flag/i)
  })

  it('exit 1 + Fehlertext bei unbekanntem Preset', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-build-cmd-'))
    try {
      const {error, stdout} = await runCommand(
        [
          'build',
          '--preset=doesnotexist',
          `--presets=${join(FIXTURE_DIR, 'presets')}`,
          `--registry=${join(FIXTURE_DIR, 'sections', 'registry.json')}`,
          `--base-theme=${join(FIXTURE_DIR, 'base-theme')}`,
          `--out=${tmp}`,
        ],
        undefined,
        {stripAnsi: true},
      )
      expect(stdout).to.contain('Preset nicht gefunden')
      expect(stdout).to.contain('Verfügbare Presets: testmini')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      rmSync(tmp, {force: true, recursive: true})
    }
  })

  it('baut echtes Theme gegen Fixture', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-build-cmd-ok-'))
    try {
      const {stdout} = await runCommand(
        [
          'build',
          '--preset=testmini',
          `--presets=${join(FIXTURE_DIR, 'presets')}`,
          `--registry=${join(FIXTURE_DIR, 'sections', 'registry.json')}`,
          `--base-theme=${join(FIXTURE_DIR, 'base-theme')}`,
          `--out=${tmp}`,
        ],
        undefined,
        {stripAnsi: true},
      )
      expect(stdout).to.contain('Build fertig')
      expect(stdout).to.contain('Sections: 2')
      expect(existsSync(join(tmp, 'infactory-testmini', 'home.hbs'))).to.be.true
    } finally {
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
