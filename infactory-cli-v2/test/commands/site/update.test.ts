/**
 * test/commands/site/update.test.ts — Smoke-Tests für `site update`
 *
 * Der Command ruft intern pnpm/git/systemctl auf — Happy-Path ist auf Dev-Workstation
 * nicht testbar. Hier nur Help + unbemockbare Early-Exits.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('site update', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('site update --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('installieren oder aktualisieren')
    expect(stdout).to.contain('USAGE')
  })
})
