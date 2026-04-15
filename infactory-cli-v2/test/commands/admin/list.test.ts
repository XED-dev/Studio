/**
 * test/commands/admin/list.test.ts — Smoke-Tests für `admin list`
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('admin list', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('admin list --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('User einer Studio-Payload Site')
    expect(stdout).to.contain('TLD  TLD der Site')
  })

  it('USAGE zeigt TLD als einziges Arg (Regression-Schutz)', async () => {
    const {stdout} = await runCommand('admin list --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/admin list\s+TLD/)
  })

  it('exited mit Fehler bei fehlender TLD', async () => {
    const {error} = await runCommand('admin list', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/missing|required/i)
  })

  it('exited mit "nicht gefunden" bei unbekannter TLD', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-admin-list-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {error, stdout} = await runCommand(
        'admin list unknown.at', undefined, {stripAnsi: true},
      )
      expect(stdout).to.contain('nicht gefunden')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
