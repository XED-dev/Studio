/**
 * test/commands/images/audit.test.ts — Smoke-Tests für `infactory images audit`.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('images audit (M5.5)', () => {
  it('rendert Help mit allen Flags', async () => {
    const {stdout} = await runCommand('images audit --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Image-Audit')
    expect(stdout).to.contain('--ghost-url')
    expect(stdout).to.contain('--admin-key')
    expect(stdout).to.contain('--hostname')
    expect(stdout).to.contain('--archive')
  })

  it('exited bei fehlendem --hostname', async () => {
    const {error} = await runCommand('images audit', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/hostname.+required|Missing required/i)
  })

  it('exit 1 bei fehlenden Credentials (kein Key-Leak)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-img-audit-'))
    const savedUrl = process.env.INFACTORY_GHOST_URL
    const savedKey = process.env.INFACTORY_GHOST_KEY
    const savedCwd = process.cwd()
    delete process.env.INFACTORY_GHOST_URL
    delete process.env.INFACTORY_GHOST_KEY
    process.chdir(tmp)
    try {
      const {error, stdout} = await runCommand('images audit --hostname=alt.at', undefined, {stripAnsi: true})
      expect(stdout).to.contain('--ghost-url fehlt')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      process.chdir(savedCwd)
      if (savedUrl !== undefined) process.env.INFACTORY_GHOST_URL = savedUrl
      if (savedKey !== undefined) process.env.INFACTORY_GHOST_KEY = savedKey
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
