/**
 * test/commands/qa/compare.test.ts — Smoke-Tests für `infactory qa compare`.
 *
 * Kern-Logik ist in test/lib/qa*.test.ts getestet. Hier nur oclif-Integration.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('qa compare (native command)', () => {
  it('rendert Help ohne Crash + zeigt alle Flags', async () => {
    const {stdout} = await runCommand('qa compare --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Visual QA')
    expect(stdout).to.contain('--source')
    expect(stdout).to.contain('--target')
    expect(stdout).to.contain('--width')
  })

  it('USAGE enthält --source + --target (Regression-Schutz gegen Flag-Reorder)', async () => {
    const {stdout} = await runCommand('qa compare --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/--source=<value>/)
    expect(stdout).to.match(/--target=<value>/)
  })

  it('exited bei fehlenden Required-Flags', async () => {
    const {error} = await runCommand('qa compare', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/source.+required|target.+required|Missing required flag/i)
  })
})
