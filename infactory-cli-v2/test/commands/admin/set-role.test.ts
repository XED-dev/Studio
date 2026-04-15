/**
 * test/commands/admin/set-role.test.ts — Smoke-Tests für `admin set-role`
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('admin set-role', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('admin set-role --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Rolle eines Users')
    expect(stdout).to.contain('Neue Rolle (admin oder user)')
  })

  it('USAGE zeigt Args in Reihenfolge TLD EMAIL ROLE (Regression-Schutz)', async () => {
    const {stdout} = await runCommand('admin set-role --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/admin set-role\s+TLD\s+EMAIL\s+ROLE/)
  })

  it('exited mit Fehler bei fehlenden Args', async () => {
    const {error} = await runCommand('admin set-role', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/missing|required/i)
  })

  it('exited mit Fehler bei ungültiger Rolle', async () => {
    const {error} = await runCommand(
      'admin set-role example.at user@test.com superadmin',
      undefined, {stripAnsi: true},
    )
    // oclif Args.options validiert den Wert und wirft vor dem Command-Body
    expect(error?.message).to.match(/superadmin|expected|admin.*user/i)
  })

  it('exited mit "nicht gefunden" bei unbekannter TLD', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-admin-set-role-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {error, stdout} = await runCommand(
        'admin set-role unknown.at user@test.com admin',
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
