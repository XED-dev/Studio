/**
 * test/commands/server/restart.test.ts — Smoke-Tests für `server restart`
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('server restart', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('server restart --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Infactory-Service(s) neustarten')
  })

  it('meldet "Keine konfigurierten Sites" bei leerem /var/xed/', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-server-restart-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {stdout} = await runCommand('server restart', undefined, {stripAnsi: true})
      expect(stdout).to.contain('Keine konfigurierten Sites')
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
