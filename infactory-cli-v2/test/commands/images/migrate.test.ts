/**
 * test/commands/images/migrate.test.ts — Smoke-Tests für `infactory images migrate`.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('images migrate (M5.5)', () => {
  it('rendert Help mit Safety-Flags', async () => {
    const {stdout} = await runCommand('images migrate --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Image-Migration')
    expect(stdout).to.contain('--dry-run')
    expect(stdout).to.contain('--archive')
    expect(stdout).to.contain('--hostname')
    expect(stdout).to.contain('--slug')
  })

  it('exited bei fehlendem --hostname oder --archive', async () => {
    const {error} = await runCommand('images migrate', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/hostname.+required|archive.+required|Missing required/i)
  })
})
