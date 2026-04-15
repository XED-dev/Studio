/**
 * test/commands/admin/delete.test.ts — Smoke-Tests für `admin delete`
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('admin delete', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('admin delete --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('User löschen')
    expect(stdout).to.contain('Sessions und Accounts')
  })

  it('USAGE zeigt Args in Reihenfolge TLD EMAIL (Regression-Schutz)', async () => {
    const {stdout} = await runCommand('admin delete --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/admin delete\s+TLD\s+EMAIL/)
  })

  it('exited mit Fehler bei fehlenden Args', async () => {
    const {error} = await runCommand('admin delete', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/missing|required/i)
  })

  it('exited mit "nicht gefunden" bei unbekannter TLD', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-admin-delete-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {error, stdout} = await runCommand(
        'admin delete unknown.at user@test.com',
        undefined, {stripAnsi: true},
      )
      expect(stdout).to.contain('nicht gefunden')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
