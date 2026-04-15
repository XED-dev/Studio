import {expect} from 'chai'

import {renderPayloadUnit} from '../../src/lib/systemd.js'

describe('lib/systemd', () => {
  describe('renderPayloadUnit', () => {
    const fixture = {
      envFile: '/var/xed/example.com/studio-payload.env',
      installDir: '/opt/studio-payload',
      port: 5368,
      tld: 'example.com',
    }

    it('enthält alle Pflicht-Sektionen', () => {
      const unit = renderPayloadUnit(fixture)
      expect(unit).to.contain('[Unit]')
      expect(unit).to.contain('[Service]')
      expect(unit).to.contain('[Install]')
    })

    it('setzt TLD in Description', () => {
      const unit = renderPayloadUnit(fixture)
      expect(unit).to.contain('Description=Studio-Payload — Puck Editor (example.com)')
    })

    it('setzt Port korrekt im ExecStart', () => {
      const unit = renderPayloadUnit({...fixture, port: 5369})
      expect(unit).to.match(/ExecStart=.+next start -p 5369/)
    })

    it('setzt WorkingDirectory auf installDir', () => {
      const unit = renderPayloadUnit({...fixture, installDir: '/opt/custom'})
      expect(unit).to.contain('WorkingDirectory=/opt/custom')
    })

    it('setzt EnvironmentFile auf envFile', () => {
      const unit = renderPayloadUnit({...fixture, envFile: '/tmp/test.env'})
      expect(unit).to.contain('EnvironmentFile=/tmp/test.env')
    })

    it('läuft als g-host (User + Group)', () => {
      const unit = renderPayloadUnit(fixture)
      expect(unit).to.contain('User=g-host')
      expect(unit).to.contain('Group=g-host')
    })

    it('aktiviert auto-restart on-failure', () => {
      const unit = renderPayloadUnit(fixture)
      expect(unit).to.contain('Restart=on-failure')
      expect(unit).to.contain('RestartSec=5')
    })

    it('setzt NODE_ENV=production', () => {
      const unit = renderPayloadUnit(fixture)
      expect(unit).to.contain('Environment=NODE_ENV=production')
    })

    it('Snapshot — Full Unit-File', () => {
      const unit = renderPayloadUnit(fixture)
      const expected = `[Unit]
Description=Studio-Payload — Puck Editor (example.com)
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=/opt/studio-payload
EnvironmentFile=/var/xed/example.com/studio-payload.env
ExecStart=/usr/bin/node /opt/studio-payload/node_modules/next/dist/bin/next start -p 5368
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`
      expect(unit).to.equal(expected)
    })
  })
})
