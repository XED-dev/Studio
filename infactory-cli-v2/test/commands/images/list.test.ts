/**
 * test/commands/images/list.test.ts — Smoke-Tests für `infactory images list`.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('images list (M5.5)', () => {
  it('rendert Help', async () => {
    const {stdout} = await runCommand('images list --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Image-Inventur')
    expect(stdout).to.contain('--ghost-url')
    expect(stdout).to.contain('--admin-key')
  })
})
