/**
 * test/lib/nginx.test.ts — Snapshot-Tests für NGINX-Location-Rendering
 *
 * renderLocationsSnippet ist pure (nur String-Templating) und extrem fehlersensibel:
 * Ein fehlendes $-Anker oder vertauschter rewrite kann Production-Loops auslösen
 * (siehe Session 24/25). Snapshot-Tests schützen gegen versehentliche Änderungen.
 */

import {expect} from 'chai'

import {renderLocationsSnippet} from '../../src/lib/nginx.js'

describe('lib/nginx', () => {
  describe('renderLocationsSnippet', () => {
    it('erzeugt zwei Regex-Locations mit dem korrekten Port', () => {
      const out = renderLocationsSnippet(5368)
      expect(out).to.contain('location ~ ^/studio(/|$)')
      expect(out).to.contain('location ~ ^/(_next|api|next|media|__nextjs)(/|$)')
      expect(out).to.contain('proxy_pass http://127.0.0.1:5368')
    })

    it('enthält den rewrite-Block für Plugin-Hardcodes', () => {
      const out = renderLocationsSnippet(5368)
      expect(out).to.contain('rewrite ^(.*)$ /studio$1 break')
    })

    it('enthält NICHT den rewrite-Block in der /studio-Location (das würde den Pfad verdoppeln)', () => {
      const out = renderLocationsSnippet(5368)
      const studioBlock = out.split('location ~ ^/(_next')[0]
      expect(studioBlock).to.not.contain('rewrite')
    })

    it('nutzt payload.conf (nicht xed.conf direkt)', () => {
      // payload.conf ist ein Symlink auf xed.conf, aber semantisch korrekt benannt.
      // Siehe Session-25-Fix.
      const out = renderLocationsSnippet(5368)
      expect(out).to.contain('include /etc/nginx/proxy/payload.conf')
      expect(out).to.not.contain('include /etc/nginx/proxy/xed.conf')
    })

    it('Port wird in beide Locations eingesetzt', () => {
      const out = renderLocationsSnippet(5369)
      const matches = out.match(/127\.0\.0\.1:5369/g)
      expect(matches).to.have.lengthOf(2)
    })

    it('stabiler Snapshot für Port 5368', () => {
      const expected = `# Studio + Admin + Puck-Editor (URI unverändert)
location ~ ^/studio(/|$) {
    proxy_pass http://127.0.0.1:5368;
    include /etc/nginx/proxy/payload.conf;
}

# Next.js-Assets + API + Media (basePath-Kompensat für Plugin-Hardcodes)
location ~ ^/(_next|api|next|media|__nextjs)(/|$) {
    rewrite ^(.*)$ /studio$1 break;
    proxy_pass http://127.0.0.1:5368;
    include /etc/nginx/proxy/payload.conf;
}`
      expect(renderLocationsSnippet(5368)).to.equal(expected)
    })
  })
})
