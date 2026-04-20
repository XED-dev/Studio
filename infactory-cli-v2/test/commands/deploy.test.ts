/**
 * test/commands/deploy.test.ts — Smoke-Tests für nativer `infactory deploy`
 *
 * Kern-Logik ist in lib/deploy.test.ts getestet. Hier nur oclif-Integration
 * + Flag-Alias-Regression-Schutz.
 *
 * Credential-Safety: nutzt nur Dummy-Keys und setzt ENV-Variablen nur für
 * den Scope einzelner Tests (delete im finally).
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('deploy (native command)', () => {
  it('rendert Help ohne Crash + zeigt neue Flag-Namen', async () => {
    const {stdout} = await runCommand('deploy --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Ghost-Theme deployen')
    expect(stdout).to.contain('--ghost-url')
    expect(stdout).to.contain('--admin-key')
  })

  it('exited bei fehlendem --preset', async () => {
    const {error} = await runCommand('deploy', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/preset.+required|Missing required flag/i)
  })

  it('exit 1 bei fehlenden Credentials (kein Key-Leak in Output)', async () => {
    // CWD auf tmp setzen + ENV leeren, damit keine externe Config greift.
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-deploy-creds-'))
    const savedUrl = process.env.INFACTORY_GHOST_URL
    const savedKey = process.env.INFACTORY_GHOST_KEY
    const savedCwd = process.cwd()
    delete process.env.INFACTORY_GHOST_URL
    delete process.env.INFACTORY_GHOST_KEY
    process.chdir(tmp)
    try {
      const {error, stdout} = await runCommand(
        'deploy --preset=testmini',
        undefined,
        {stripAnsi: true},
      )
      expect(stdout).to.contain('--ghost-url fehlt')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      process.chdir(savedCwd)
      if (savedUrl !== undefined) process.env.INFACTORY_GHOST_URL = savedUrl
      if (savedKey !== undefined) process.env.INFACTORY_GHOST_KEY = savedKey
      rmSync(tmp, {force: true, recursive: true})
    }
  })

  it('Alias --url wird akzeptiert (User-Continuity zur Legacy-CLI)', async () => {
    // Wir parsen nur, ohne echten Deploy. --admin-key fehlt absichtlich,
    // damit der Command nach der Parse früh exit mit Validate-Error —
    // das beweist dass --url erfolgreich geparst wurde (sonst wäre der
    // Fehler "--ghost-url fehlt" statt "--admin-key fehlt").
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-deploy-alias-'))
    const savedUrl = process.env.INFACTORY_GHOST_URL
    const savedKey = process.env.INFACTORY_GHOST_KEY
    const savedCwd = process.cwd()
    delete process.env.INFACTORY_GHOST_URL
    delete process.env.INFACTORY_GHOST_KEY
    process.chdir(tmp)
    try {
      const {error, stdout} = await runCommand(
        'deploy --preset=testmini --url=https://example.test',
        undefined,
        {stripAnsi: true},
      )
      expect(stdout).to.contain('--admin-key fehlt')
      expect(stdout).to.not.contain('--ghost-url fehlt')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      process.chdir(savedCwd)
      if (savedUrl !== undefined) process.env.INFACTORY_GHOST_URL = savedUrl
      if (savedKey !== undefined) process.env.INFACTORY_GHOST_KEY = savedKey
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
