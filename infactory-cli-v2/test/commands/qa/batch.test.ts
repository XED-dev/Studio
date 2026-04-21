/**
 * test/commands/qa/batch.test.ts — Smoke-Tests für `infactory qa batch`.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('qa batch (native command, M5.4.1)', () => {
  it('rendert Help mit allen Flags', async () => {
    const {stdout} = await runCommand('qa batch --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Visual QA Batch')
    expect(stdout).to.contain('--source-base')
    expect(stdout).to.contain('--target-base')
    expect(stdout).to.contain('--slugs')
  })

  it('exited bei fehlenden Required-Flags', async () => {
    const {error} = await runCommand('qa batch', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/source-base.+required|target-base.+required|slugs.+required|Missing required/i)
  })

  it('exit 1 + klare Fehlermeldung bei leerer Slug-Liste', async () => {
    const {error, stdout} = await runCommand(
      'qa batch --source-base=https://a.at --target-base=https://b.at --slugs=,,,',
      undefined,
      {stripAnsi: true},
    )
    expect(stdout).to.contain('--slugs enthält keine gültigen Einträge')
    expect(error?.oclif?.exit).to.equal(1)
  })
})
