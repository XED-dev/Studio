/**
 * lib/qa-error.ts — Typisierte Fehler-Klasse für die QA-Pipeline.
 *
 * QA-Fehler sind meist nicht-fatal auf der Sensor-Ebene (ein Sensor kann
 * fehlschlagen ohne den Gesamt-Report zu killen), aber Infrastruktur-Fehler
 * (fehlender venv, fehlender Python-Helper) sind fatal und werfen QaError.
 *
 * Pattern analog BuildError/DeployError (M5.2/M5.3).
 */

export class QaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QaError'
  }
}
