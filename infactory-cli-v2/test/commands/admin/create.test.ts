/**
 * test/commands/admin/create.test.ts — Smoke-Tests für `admin create`
 *
 * Enthält USAGE-Regex-Assertion als Regression-Test für die Arg-Reihenfolge.
 * Hintergrund: beef48a (AI25 Lint-Cleanup) hatte `perfectionist/sort-objects`
 * autofix laufen lassen, was die Args alphabetisch sortierte — TLD/Email
 * wurden dadurch vertauscht geparst. Fix + Test in CLI-M4(c).
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('admin create', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('admin create --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Admin-User')
  })

  it('USAGE zeigt TLD vor EMAIL (Regression-Schutz gegen Args-Reorder)', async () => {
    const {stdout} = await runCommand('admin create --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/admin create\s+TLD\s+EMAIL/)
  })

  it('exited mit Fehler bei fehlenden Args', async () => {
    const {error} = await runCommand('admin create', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/missing|required/i)
  })

  it('exited mit "nicht gefunden" bei unbekannter TLD', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-admin-create-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {error, stdout} = await runCommand(
        'admin create unknown.at admin@example.com',
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
