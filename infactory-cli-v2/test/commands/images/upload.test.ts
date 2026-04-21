/**
 * test/commands/images/upload.test.ts — Smoke-Tests für `infactory images upload`.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('images upload (M5.5)', () => {
  it('rendert Help mit variadischem files-Arg', async () => {
    const {stdout} = await runCommand('images upload --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Bilder zu Ghost hochladen')
    expect(stdout).to.contain('--ghost-url')
  })

  it('exited bei fehlenden Args', async () => {
    const {error} = await runCommand('images upload', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/files.+required|Missing|argument/i)
  })
})
