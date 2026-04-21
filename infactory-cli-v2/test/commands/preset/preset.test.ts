/**
 * test/commands/preset/preset.test.ts — Smoke-Tests für preset clone/list/remove.
 *
 * Help + Required-Args. Echte Library-Logik ist in test/lib/preset.test.ts.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('preset commands (M5.6)', () => {

describe('preset clone', () => {
  it('rendert Help mit allen Override-Flags', async () => {
    const {stdout} = await runCommand('preset clone --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Preset forken')
    expect(stdout).to.contain('--name')
    expect(stdout).to.contain('--color')
    expect(stdout).to.contain('--font-display')
    expect(stdout).to.contain('--sections')
  })

  it('USAGE zeigt SOURCE als positional + --name als Flag', async () => {
    const {stdout} = await runCommand('preset clone --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/preset clone\s+SOURCE/)
  })

  it('exited bei fehlendem source-Arg + --name', async () => {
    const {error} = await runCommand('preset clone', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/source.+required|name.+required|Missing/i)
  })
})

describe('preset list', () => {
  it('rendert Help', async () => {
    const {stdout} = await runCommand('preset list --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Presets mit Details auflisten')
    expect(stdout).to.contain('--presets')
  })

  it('zeigt "Keine Presets" bei leerem Verzeichnis (gegen tmp)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-preset-list-cmd-'))
    try {
      const {stdout} = await runCommand(`preset list --presets=${tmp}`, undefined, {stripAnsi: true})
      expect(stdout).to.contain('Keine Presets')
    } finally {
      rmSync(tmp, {force: true, recursive: true})
    }
  })

  it('listet vorhandene Presets', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-preset-list-cmd2-'))
    try {
      writeFileSync(join(tmp, 'sample.yaml'), 'id: sample\nname: Sample\nlayout:\n  home: [a, b]\n')
      const {stdout} = await runCommand(`preset list --presets=${tmp}`, undefined, {stripAnsi: true})
      expect(stdout).to.contain('Presets')
      expect(stdout).to.contain('sample')
      expect(stdout).to.contain('Sample')
    } finally {
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})

describe('preset remove', () => {
  it('rendert Help mit --force-Hinweis', async () => {
    const {stdout} = await runCommand('preset remove --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Preset löschen')
    expect(stdout).to.contain('--force')
  })

  it('exited bei fehlendem id-Arg', async () => {
    const {error} = await runCommand('preset remove', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/id.+required|Missing/i)
  })

  it('SAFETY: ohne --force zeigt nur Hinweis, löscht nicht', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-preset-rm-cmd-'))
    try {
      writeFileSync(join(tmp, 'doomed.yaml'), 'id: doomed')
      const {stdout} = await runCommand(`preset remove doomed --presets=${tmp}`, undefined, {stripAnsi: true})
      expect(stdout).to.contain('würde gelöscht')
      expect(stdout).to.contain('--force')
    } finally {
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})

})  // preset commands (M5.6)
