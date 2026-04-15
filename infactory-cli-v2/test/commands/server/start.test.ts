/**
 * test/commands/server/start.test.ts — Smoke-Tests für `server start`
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('server start', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('server start --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Infactory-Service(s) starten')
    expect(stdout).to.contain('USAGE')
  })

  it('meldet "Keine konfigurierten Sites" bei leerem /var/xed/', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-server-start-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {stdout} = await runCommand('server start', undefined, {stripAnsi: true})
      expect(stdout).to.contain('Keine konfigurierten Sites')
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })

  it('exited mit Fehler bei unbekannter TLD', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-server-start-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {error, stdout} = await runCommand(
        'server start does-not-exist.at', undefined, {stripAnsi: true},
      )
      expect(stdout).to.contain('nicht gefunden')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
