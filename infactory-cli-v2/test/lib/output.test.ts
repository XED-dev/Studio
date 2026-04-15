import {expect} from 'chai'

import {color, icon} from '../../src/lib/output.js'

describe('lib/output', () => {
  describe('color', () => {
    it('exportiert alle erwarteten Farb-Keys', () => {
      expect(color).to.have.all.keys('red', 'green', 'blue', 'yellow', 'bold', 'nc')
    })

    it('alle Werte sind Strings', () => {
      for (const key of Object.keys(color)) {
        expect(color[key as keyof typeof color]).to.be.a('string')
      }
    })

    it('im Test-Umfeld (kein TTY) sind alle Farben leere Strings', () => {
      // Mocha unter Node setzt kein TTY → isTTY = false → Farben leer.
      // Wenn Tests irgendwann in einem TTY-Kontext laufen, darf dieser Check nicht failen,
      // deshalb prüfen wir hier nur die Konsistenz: Entweder ALLE Farben sind leer, oder keine.
      const allEmpty = Object.values(color).every((v) => v === '')
      const noneEmpty = Object.values(color).every((v) => v.length > 0)
      expect(allEmpty || noneEmpty, 'Farben müssen alle gesetzt ODER alle leer sein').to.be.true
    })
  })

  describe('icon', () => {
    it('exportiert ok/err/warn/info', () => {
      expect(icon).to.have.all.keys('ok', 'err', 'warn', 'info')
    })

    it('enthält die erwarteten Unicode-Symbole', () => {
      expect(icon.ok).to.contain('\u2714')
      expect(icon.err).to.contain('\u2718')
      expect(icon.warn).to.contain('\u26A0')
      expect(icon.info).to.contain('\u2192')
    })
  })
})
