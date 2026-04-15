/**
 * test/commands/site/create.test.ts — Smoke-Tests für `site create`
 *
 * Core-Logik ist in lib/site.test.ts getestet. Hier nur oclif-Integration.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('site create', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('site create --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Per-Site Setup')
    expect(stdout).to.contain('TLD  TLD der Site')
  })

  it('exited mit Fehler bei fehlender TLD', async () => {
    const {error} = await runCommand('site create', undefined, {stripAnsi: true})
    expect(error).to.not.be.undefined
    expect(error?.message).to.match(/missing|required/i)
  })

  it('exited mit "nicht installiert" wenn /opt/studio-payload fehlt', async () => {
    const {error, stdout} = await runCommand(
      'site create example.at', undefined, {stripAnsi: true},
    )
    expect(stdout).to.contain('Studio-Payload nicht installiert')
    expect(error?.oclif?.exit).to.equal(1)
  })
})
