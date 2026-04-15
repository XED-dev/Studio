/**
 * test/commands/site/status.test.ts — Smoke-Tests für `site status`
 *
 * Prüft oclif-Integration, nicht Core-Logik (die ist in lib/config.test.ts getestet).
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('site status', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('site status --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Status aller konfigurierten Sites')
    expect(stdout).to.contain('USAGE')
  })

  it('exited mit "Nicht installiert" wenn /opt/studio-payload fehlt', async () => {
    // Diese Assertion setzt voraus, dass die Tests NICHT auf dem Produktions-Server
    // laufen (wo /opt/studio-payload/ existiert). Auf Dev-Workstations ist dieser
    // Pfad nicht vorhanden → Command liefert den Early-Exit mit Exit-Code 1.
    const {error, stdout} = await runCommand('site status', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Nicht installiert')
    expect(error?.oclif?.exit).to.equal(1)
  })
})
