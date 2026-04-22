import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('site init', () => {
  it('zeigt Help mit korrekter Usage-Zeile', async () => {
    const {stdout} = await runCommand('site init --help')
    expect(stdout).to.contain('Track-A Foundation einrichten')
    expect(stdout).to.match(/USAGE[\s\S]*site init\s+TLD/)
  })

  it('fehlt TLD → Fehlermeldung', async () => {
    const {error} = await runCommand('site init')
    expect(error?.message).to.contain('Missing 1 required arg')
  })
})
