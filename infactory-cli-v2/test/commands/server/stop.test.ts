/**
 * test/commands/server/stop.test.ts — Smoke-Tests für `server stop`
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('server stop', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('server stop --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Infactory-Service(s) stoppen')
    expect(stdout).to.contain('--yes')
  })

  it('meldet "Keine konfigurierten Sites" bei leerem /var/xed/', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-server-stop-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {stdout} = await runCommand('server stop --yes', undefined, {stripAnsi: true})
      expect(stdout).to.contain('Keine konfigurierten Sites')
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
