/**
 * test/lib/ghost-api.test.ts — Tests für pure Funktionen in lib/ghost-api.ts
 *
 * Scope:
 *   - parseAdminKey: Format-Validation + Zerlegung
 *   - generateJwt: Snapshot mit fixem `now` (deterministisch)
 *   - buildAdminUrl: URL-Normalisierung
 *
 * NICHT hier: ghostRequest, uploadTheme, activateTheme, uploadImage — sind
 * execSync/HTTP-Wrapper, Live-Test via deploy (Test-Strategie im CC).
 */

import {expect} from 'chai'

import {buildAdminUrl, generateJwt, parseAdminKey} from '../../src/lib/ghost-api.js'

describe('lib/ghost-api', () => {
  describe('parseAdminKey', () => {
    it('zerlegt gültigen Key in keyId + keySecret', () => {
      const result = parseAdminKey('abc123:def456hex')
      expect(result).to.deep.equal({keyId: 'abc123', keySecret: 'def456hex'})
    })

    it('wirft bei fehlendem Doppelpunkt', () => {
      expect(() => parseAdminKey('nokeyformat')).to.throw(/Ungültiges Admin-Key-Format/)
    })

    it('wirft bei zu vielen Doppelpunkten', () => {
      expect(() => parseAdminKey('id:secret:extra')).to.throw(/Ungültiges Admin-Key-Format/)
    })

    it('wirft bei leerem keyId', () => {
      expect(() => parseAdminKey(':secret')).to.throw(/Ungültiges Admin-Key-Format/)
    })

    it('wirft bei leerem keySecret', () => {
      expect(() => parseAdminKey('id:')).to.throw(/Ungültiges Admin-Key-Format/)
    })

    it('wirft bei leerem String', () => {
      expect(() => parseAdminKey('')).to.throw(/Ungültiges Admin-Key-Format/)
    })
  })

  describe('generateJwt', () => {
    // Fixer Timestamp + deterministischer Key → reproduzierbarer JWT
    const adminKey = 'deadbeef:cafebabe12345678'
    const fixedNow = 1_700_000_000 // 2023-11-14T22:13:20Z

    it('liefert einen JWT mit drei Teilen (header.payload.signature)', () => {
      const jwt = generateJwt(adminKey, fixedNow)
      const parts = jwt.split('.')
      expect(parts).to.have.lengthOf(3)
    })

    it('Header enthält alg=HS256 + kid=keyId', () => {
      const jwt = generateJwt(adminKey, fixedNow)
      const [header] = jwt.split('.')
      const decoded = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
      expect(decoded).to.deep.equal({alg: 'HS256', kid: 'deadbeef', typ: 'JWT'})
    })

    it('Payload enthält iat, exp (+5min), aud=/admin/', () => {
      const jwt = generateJwt(adminKey, fixedNow)
      const [, payload] = jwt.split('.')
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      expect(decoded).to.deep.equal({
        aud: '/admin/',
        exp: fixedNow + 300,
        iat: fixedNow,
      })
    })

    it('deterministisch bei gleichem `now`: gleicher JWT', () => {
      const jwt1 = generateJwt(adminKey, fixedNow)
      const jwt2 = generateJwt(adminKey, fixedNow)
      expect(jwt1).to.equal(jwt2)
    })

    it('unterschiedlich bei verschiedenem `now`', () => {
      const jwt1 = generateJwt(adminKey, fixedNow)
      const jwt2 = generateJwt(adminKey, fixedNow + 1)
      expect(jwt1).to.not.equal(jwt2)
    })

    it('wirft bei ungültigem Admin-Key', () => {
      expect(() => generateJwt('invalid')).to.throw(/Ungültiges Admin-Key-Format/)
    })

    it('Signatur ist base64url (kein +/= enthalten)', () => {
      const jwt = generateJwt(adminKey, fixedNow)
      const signature = jwt.split('.')[2]
      expect(signature).to.match(/^[\w-]+$/)
    })
  })

  describe('buildAdminUrl', () => {
    it('verbindet Base + Path ohne doppelten Slash', () => {
      expect(buildAdminUrl('https://mein.blog', '/ghost/api/admin/posts/'))
        .to.equal('https://mein.blog/ghost/api/admin/posts/')
    })

    it('entfernt trailing Slash von Base', () => {
      expect(buildAdminUrl('https://mein.blog/', '/ghost/api/admin/posts/'))
        .to.equal('https://mein.blog/ghost/api/admin/posts/')
    })

    it('entfernt mehrere trailing Slashes von Base', () => {
      expect(buildAdminUrl('https://mein.blog///', '/ghost/api/admin/posts/'))
        .to.equal('https://mein.blog/ghost/api/admin/posts/')
    })

    it('fügt führenden Slash hinzu wenn Path keinen hat', () => {
      expect(buildAdminUrl('https://mein.blog', 'ghost/api/admin/posts/'))
        .to.equal('https://mein.blog/ghost/api/admin/posts/')
    })

    it('funktioniert mit http (nicht nur https)', () => {
      expect(buildAdminUrl('http://localhost:2368', '/ghost/api/admin/themes/'))
        .to.equal('http://localhost:2368/ghost/api/admin/themes/')
    })

    it('behält Query-String im Path', () => {
      expect(buildAdminUrl('https://mein.blog', '/ghost/api/admin/images/upload/?ref=foo'))
        .to.equal('https://mein.blog/ghost/api/admin/images/upload/?ref=foo')
    })
  })
})
