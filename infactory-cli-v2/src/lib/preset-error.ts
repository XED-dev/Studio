/**
 * lib/preset-error.ts — Typisierte Fehler-Klasse für Preset-Operationen
 *
 * Pattern analog BuildError/DeployError/QaError/ImagesError. Sub-typing erlaubt
 * dem Command-Handler gezieltes `instanceof PresetError` für Exit-1-Pfade.
 */

export class PresetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PresetError'
  }
}
