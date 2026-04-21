/**
 * test/lib/images.test.ts — Tests für Image-Pipeline (pure helpers).
 *
 * Fokus: Path-Traversal-Härtung explizit, extractImageUrls,
 * escapeHostnamePattern, buildUrlSlugMap, validateImagesOptions.
 *
 * HTTP-Calls (auditImages/migrateImages/listImages/uploadImages) NICHT
 * getestet — Live-Server.
 */

import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {GhostPage} from '../../src/lib/ghost-api.js'

import {
  buildUrlSlugMap,
  escapeHostnamePattern,
  extractImageUrls,
  publicKeyId,
  urlToLocalPath,
  validateImagesOptions,
} from '../../src/lib/images.js'

const DUMMY_KEY = 'deadbeef:cafebabe12345678'

function fakePage(overrides: Partial<GhostPage> = {}): GhostPage {
  return {
    // eslint-disable-next-line camelcase -- Ghost API schema
    feature_image: null,
    id: 'p1',
    lexical: null,
    slug: 'test',
    // eslint-disable-next-line camelcase -- Ghost API schema
    updated_at: '2026-04-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('lib/images (pure helpers)', () => {
  describe('escapeHostnamePattern', () => {
    it('escapet Punkte für RegExp-Verwendung', () => {
      expect(escapeHostnamePattern('alt-host.at')).to.equal(String.raw`alt-host\.at`)
    })

    it('mehrere Punkte', () => {
      expect(escapeHostnamePattern('sub.example.co.uk')).to.equal(String.raw`sub\.example\.co\.uk`)
    })

    it('ohne Punkte unverändert', () => {
      expect(escapeHostnamePattern('localhost')).to.equal('localhost')
    })
  })

  describe('extractImageUrls', () => {
    it('findet URL in feature_image', () => {
      const page = fakePage({
        // eslint-disable-next-line camelcase -- Ghost API schema
        feature_image: 'https://alt.at/img/hero.jpg',
      })
      const urls = extractImageUrls(page, String.raw`alt\.at`)
      expect([...urls]).to.deep.equal(['https://alt.at/img/hero.jpg'])
    })

    it('findet URLs in lexical-JSON', () => {
      const page = fakePage({
        lexical: '{"src":"https://alt.at/img/a.png","other":"https://alt.at/img/b.jpg"}',
      })
      const urls = extractImageUrls(page, String.raw`alt\.at`)
      expect(urls.size).to.equal(2)
    })

    it('Set-Behavior: doppelte URLs werden dedupliziert', () => {
      const page = fakePage({
        // eslint-disable-next-line camelcase -- Ghost API schema
        feature_image: 'https://alt.at/img/x.png',
        lexical: '{"src":"https://alt.at/img/x.png"}',
      })
      const urls = extractImageUrls(page, String.raw`alt\.at`)
      expect(urls.size).to.equal(1)
    })

    it('andere Hostnames werden ignoriert', () => {
      const page = fakePage({
        // eslint-disable-next-line camelcase -- Ghost API schema
        feature_image: 'https://other.at/img/x.png',
      })
      const urls = extractImageUrls(page, String.raw`alt\.at`)
      expect(urls.size).to.equal(0)
    })

    it('leere Page → leeres Set', () => {
      expect(extractImageUrls(fakePage(), String.raw`x\.at`).size).to.equal(0)
    })
  })

  describe('buildUrlSlugMap', () => {
    it('gruppiert URLs zu page.slug-Sets', () => {
      const pages = [
        fakePage({
          // eslint-disable-next-line camelcase
          feature_image: 'https://alt.at/img/a.png',
          slug: 'home',
        }),
        fakePage({
          // eslint-disable-next-line camelcase
          feature_image: 'https://alt.at/img/a.png',
          id: 'p2',
          slug: 'about',
        }),
      ]
      const map = buildUrlSlugMap(pages, String.raw`alt\.at`)
      expect(map.size).to.equal(1)
      const slugs = map.get('https://alt.at/img/a.png')!
      expect([...slugs].sort()).to.deep.equal(['about', 'home'])
    })
  })

  describe('urlToLocalPath — PATH TRAVERSAL HÄRTUNG (M5.5 vs. Legacy)', () => {
    let archive: string

    beforeEach(() => {
      archive = mkdtempSync(join(tmpdir(), 'infactory-images-archive-'))
    })

    afterEach(() => {
      rmSync(archive, {force: true, recursive: true})
    })

    it('erlaubt normalen Archiv-Pfad', () => {
      const result = urlToLocalPath('https://alt.at/content/images/2024/test.png', archive)
      expect(result).to.equal(join(archive, 'content', 'images', '2024', 'test.png'))
    })

    it('SECURITY (defense-in-depth): URL-Parser normalisiert ../ — landet sicher im Archiv', () => {
      // Wichtige Dokumentation: WHATWG URL parser collabiert ../-Segmente.
      // `https://alt.at/content/../../../etc/passwd` → pathname = `/etc/passwd`.
      // Damit kann ein URL-basierter Angriff prinzipiell nicht aus dem Archiv ausbrechen,
      // weil der relative-Path-Klau weggekürzt wird BEVOR wir resolve() aufrufen.
      const result = urlToLocalPath('https://alt.at/content/../../../etc/passwd', archive)
      expect(result).to.equal(join(archive, 'etc', 'passwd'))
      // Resultat ist innerhalb des Archivs — der "Angriff" mit URL-Schema ist no-op.
    })

    it('SECURITY: wirft bei Pfad-Fragment mit ../-Escape (kein URL-Schema)', () => {
      // Tests/Caller, die den Pfad-Teil ohne URL übergeben, umgehen den URL-Parser.
      // Hier MUSS der explizite startsWith-Check greifen.
      expect(() => urlToLocalPath('/content/../../../etc/passwd', archive))
        .to.throw(/außerhalb des Archivs/)
    })

    it('SECURITY: wirft bei reinem ../-Pfad-Fragment', () => {
      expect(() => urlToLocalPath('../../etc/passwd', archive))
        .to.throw(/außerhalb des Archivs/)
    })

    it('SECURITY: leerer Pfad bleibt im Archiv-Root', () => {
      // edge case: URL-Pfad nur "/" → legt sich auf archive-root, nicht außerhalb
      const result = urlToLocalPath('https://alt.at/', archive)
      expect(result).to.equal(archive)
    })

    it('akzeptiert Pfad-Fragment ohne URL-Schema', () => {
      // Tests übergeben oft nur den Pfad-Teil
      const result = urlToLocalPath('/content/img.png', archive)
      expect(result).to.equal(join(archive, 'content', 'img.png'))
    })
  })

  describe('validateImagesOptions', () => {
    it('wirft ImagesError bei fehlenden Credentials (kein Key-Leak)', () => {
      try {
        validateImagesOptions({adminKey: 'badformat', ghostUrl: 'https://x.test'})
        expect.fail('sollte werfen')
      } catch (error) {
        const e = error as Error
        expect(e.name).to.equal('ImagesError')
        expect(e.message).to.not.contain('badformat')
      }
    })

    it('valid → GhostConfig zurück', () => {
      const config = validateImagesOptions({adminKey: DUMMY_KEY, ghostUrl: 'https://x.test/'})
      expect(config.url).to.equal('https://x.test')
    })
  })

  describe('publicKeyId', () => {
    it('gibt nur key-id (Teil vor :) zurück', () => {
      expect(publicKeyId(DUMMY_KEY)).to.equal('deadbeef')
    })

    it('invalid Format → leer-String (kein throw, kein Leak)', () => {
      expect(publicKeyId('badformat')).to.equal('')
    })
  })
})
